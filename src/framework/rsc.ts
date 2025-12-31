import process from 'node:process';
import { createElement, Fragment } from 'react';
import type { ReactFormState } from 'react-dom/client';
import { fromFileUrl } from '@std/path/from-file-url';
import { extname } from '@std/path/extname';
import { getCookies, getSetCookies, setCookie } from '@std/http/cookie';
import * as ReactServer from '@vitejs/plugin-rsc/rsc';

import type { GleezContext } from '@/lib/app-state.ts';
import {
  type BaseContext,
  createRouteStorage,
  revalidatePath,
  type RouteStorage,
  runWithRouteStorage,
} from '@/lib/context.ts';
import { logger } from '@/lib/logger.ts';
import type { RscPayload } from './entry.rsc.tsx';

/** The HTTP header used to send the server action ID for fetch actions. */
const RSC_ACTION_HEADER = 'x-rsc-action-id';
/** The HTTP header used to communicate a client-side redirect from an action. */
const RSC_REDIRECT_HEADER = 'x-rsc-action-redirect-path';
const RSC_REVALIDATE_HEADER = 'x-rsc-revalidate-paths';

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript;charset=UTF-8',
  '.css': 'text/css;charset=UTF-8',
  '.html': 'text/html;charset=UTF-8',
  '.json': 'application/json;charset=UTF-8',
  // Add more as needed
};

interface ProcessedAction {
  returnValue?: RscPayload['returnValue'];
  formState?: ReactFormState;
  temporaryReferences?: unknown;
  actionStatus?: number;
  isAction: boolean;
}

interface Route {
  method?: string | string[];
  pattern: string;
  handler: (context: GleezContext) => Response | Promise<Response>;
}

// deno-lint-ignore ban-types
type PageFC = React.FC<{}>;
type RenderComponent = { default: PageFC } | Promise<{ default: PageFC }>;

export interface RscServerHandlers {
  /**
   * Handler for serving static assets from the build directory. It maps public URL paths
   * (e.g., /build/client.js) to their location on the file system.
   */
  statics: Route;
  /**
   * Handler for processing React Server Actions.
   */
  actions: Route;
  /**
   * A factory that creates a render handler for a specific Server Component.
   * @param componentModule A promise for the module exporting the component.
   */
  render: (
    componentModule:
      | RenderComponent
      | (() => RenderComponent | PageFC | Promise<PageFC>),
  ) => Route['handler'];
}

// export const prerender: SSRModuleType["prerender"] = (...params) =>
//   loadBootstrapScriptModule<SSRModuleType>("ssr")
//     .then((module) => module.prerender(...params));

const serverRedirect = async (storage: RouteStorage<BaseContext>) => {
  const context = storage.context;
  const responseHeaders = storage.responseHeaders;
  const clientRouteState = storage.getCurrentClientRouteState();
  if (!clientRouteState.redirect) throw Error('Redirect not found');

  const url = new URL(clientRouteState.redirect.url, context.request.url);
  const status = clientRouteState.redirect.status;
  console.debug(`[rsc:action] Redirecting to ${url} with status ${status}.`);

  const isCrossOrigin = url.origin !== new URL(context.request.url).origin;
  const acceptRSC = context.request.headers
    .get('Accept')
    ?.includes('text/x-component');

  if (acceptRSC && !isCrossOrigin) {
    const forwardedHeaders = mergeHeaders(
      context.request.headers,
      responseHeaders,
    );

    forwardedHeaders.delete('transfer-encoding');
    forwardedHeaders.delete(RSC_ACTION_HEADER);
    const controller = new AbortController();
    const response = await fetch(url.href, {
      method: 'GET',
      headers: forwardedHeaders,
      signal: controller.signal,
    }).catch((err) => {
      console.error(`[rsc:action] Fetch error: ${err.message}`);
    });

    const isRSC = response?.headers
      .get('content-type')
      ?.startsWith('text/x-component');

    if (isRSC && response) {
      const redirectHeaders = new Headers(response.headers);
      redirectHeaders.delete('Set-Cookie');
      if (clientRouteState.revalidatePaths.length > 0) {
        redirectHeaders.set(
          RSC_REVALIDATE_HEADER,
          JSON.stringify(clientRouteState.revalidatePaths),
        );
      }
      const setCookies = [responseHeaders, response.headers].flatMap(
        getSetCookies,
      );
      for (const cookie of setCookies) {
        setCookie(redirectHeaders, cookie);
      }

      redirectHeaders.set(
        RSC_REDIRECT_HEADER,
        url.href.replace(url.origin, ''),
      );

      return new Response(response?.body, {
        status: 200,
        headers: redirectHeaders,
      });
    }
    controller.abort();
  }

  if (isCrossOrigin) {
    responseHeaders.set('X-Location', url.href);
    responseHeaders.set('X-Status', status.toString());
    return new Response(null, { headers: responseHeaders });
  }

  responseHeaders.set('Location', url.href);
  return new Response(null, { status, headers: responseHeaders });
};

/**
 * A shared function that processes an incoming request to determine if it's an action,
 * executes it, and returns the results. It does NOT generate a response.
 */
async function processAction(request: Request): Promise<ProcessedAction> {
  if (request.method !== 'POST') {
    return { isAction: false };
  }

  let returnValue: RscPayload['returnValue'] | undefined;
  let formState: ReactFormState | undefined;
  let temporaryReferences: unknown | undefined;
  let actionStatus: number | undefined;

  const actionId = request.headers.get(RSC_ACTION_HEADER);
  if (actionId) {
    // Case 1: Client-side action call via fetch.
    const contentType = request.headers.get('content-type');
    const body = contentType?.startsWith('multipart/form-data')
      ? await request.clone().formData()
      : await request.clone().text();

    temporaryReferences = ReactServer.createTemporaryReferenceSet();
    const args = await ReactServer.decodeReply(body, { temporaryReferences });
    const action = await ReactServer.loadServerAction(actionId);

    try {
      const data = await action.apply(null, args);
      returnValue = { ok: true, data };
    } catch (e) {
      returnValue = { ok: false, data: e };
      actionStatus = 500;
    }

    return { isAction: true, returnValue, actionStatus, temporaryReferences };
  }

  // Case 2: Progressive Enhancement form submission.
  const formData = await request.clone().formData();
  const decodedAction = await ReactServer.decodeAction(formData);
  if (!decodedAction) {
    // Not a valid action form submission, treat as a normal POST.
    return { isAction: false };
  }

  try {
    const result = await decodedAction();
    formState = await ReactServer.decodeFormState(result, formData);
  } catch (_e) {
    // there's no single general obvious way to surface this error,
    // so explicitly return classic 500 response.
    // return new Response('Internal Server Error: server action failed', {
    //   status: 500,
    // })
    actionStatus = 500;
  }

  return { isAction: true, formState, actionStatus, temporaryReferences };
}

export const createHandlers = (options?: {
  moduleBaseUrl: string;
  distDirUrl: URL;
  action: string;
  contextHook?: <T>(data: T) => void | Promise<void>;
}): RscServerHandlers => {
  const statics: Route = {
    pattern: `${options?.moduleBaseUrl}*`,
    handler: async (context) => {
      const url = new URL(context.request.url);
      let relativeAssetPath = url.pathname.substring(options!.moduleBaseUrl.length);

      // Normalize: remove leading slash
      if (relativeAssetPath.startsWith('/')) {
        relativeAssetPath = relativeAssetPath.substring(1);
      }

      // Block obvious malicious patterns early (optional defense-in-depth)
      if (relativeAssetPath.includes('..') || relativeAssetPath.includes('\\')) {
        return new Response('Forbidden', { status: 403 });
      }

      const clientDistUrl = new URL(
        'client/assets/',
        options?.distDirUrl ?? new URL('./dist/', import.meta.url),
      );

      // const assetUrl = new URL(relativeAssetPath, clientDistUrl);
      let assetUrl: URL;
      try {
        assetUrl = new URL(relativeAssetPath, clientDistUrl);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      // Security check: prevent directory traversal attacks
      const assetPath = fromFileUrl(assetUrl);
      const basePath = fromFileUrl(clientDistUrl);

      const authorized = assetPath.startsWith(basePath);

      // const authorized = fromFileUrl(assetUrl).startsWith(fromFileUrl(clientDistUrl));
      // const file = authorized
      //   ? await Deno.open(assetUrl, { read: true }).catch(() => null)
      //   : null;

      if (!authorized) {
        // Log as warning or security event
        logger.warn('Blocked potential directory traversal attempt', {
          path: url.pathname,
          resolved: assetPath,
          clientIP: context.state?.clientIP,
          userAgent: context.request.headers.get('user-agent'),
          requestId: context.state?.requestId,
        });

        return new Response('Not Found', { status: 404 });
      }

      let file: Deno.FsFile | null = null;
      try {
        file = await Deno.open(assetUrl, { read: true });
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          return new Response('Not Found', { status: 404 });
        }

        // Log with context
        logger.error('Failed to open static asset', {
          path: url.pathname,
          resolved: assetPath,
          clientIP: context.state?.clientIP,
          error: err instanceof Error ? err.message : String(err),
        });
        return new Response('Internal Server Error', { status: 500 });
      }

      // This shouldn't happen, but TypeScript safety
      if (!file) return new Response('Not Found', { status: 500 });

      const ext = extname(assetPath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || 'text/javascript;charset=UTF-8';
      return new Response(file.readable, {
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': process.env.NODE_ENV === 'production'
            ? 'public, max-age=31536000, s-maxage=31536000, immutable'
            : 'no-cache',
        },
      });
    },
  };

  const actions: Route = {
    method: ['GET', 'POST'],
    pattern: options!.action,
    handler: async (context) => {
      await options?.contextHook?.(context);
      const request = context.request;
      const responseHeaders = new Headers();
      const storage = createRouteStorage(context, responseHeaders);

      return await runWithRouteStorage(storage, async () => {
        try {
          // After a mutation, signal to revalidate the data for the page that made the request.
          revalidatePath(
            new URL(request.headers.get('referer') || '/').pathname,
          );

          const { isAction, ...actionResult } = await processAction(request);
          if (!isAction) {
            return new Response('This endpoint only accepts RSC actions.', {
              status: 400,
            });
          }

          const clientRouteState = storage.getCurrentClientRouteState();
          if (clientRouteState.redirect) {
            return serverRedirect(storage);
          }

          const { returnValue, formState, temporaryReferences } = actionResult;

          // For client-side actions, the payload ONLY contains the action result.
          // The client is responsible for re-fetching the page content.
          const rscPayload: RscPayload = {
            returnValue: returnValue,
            formState: formState,
          };
          const rscOptions = temporaryReferences ? { temporaryReferences } : {};
          const rscStream = ReactServer.renderToReadableStream<RscPayload>(
            rscPayload,
            rscOptions,
          );

          responseHeaders.set('Content-Type', 'text/x-component;charset=utf-8');
          return new Response(rscStream, { headers: responseHeaders });
        } catch (error) {
          console.error(error);
          throw error;
        }
      });
    },
  };

  const render: RscServerHandlers['render'] = (componentModule) => {
    return async (context) => {
      await options?.contextHook?.(context);
      const request = context.request;
      const responseHeaders = new Headers();
      const storage = createRouteStorage(context, responseHeaders);
      const PageComponent = await Promise.resolve(componentModule)
        .then((r) => (typeof r === 'function' ? r() : r))
        .then((r) => ('default' in r ? r.default : r));
      const nonce = !process.env.NO_CSP ? crypto.randomUUID() : undefined;

      return await runWithRouteStorage(storage, async () => {
        // This is the core of the rsc-engine-scratch logic.
        const actionResult = await processAction(request);
        const { returnValue, formState, temporaryReferences } = actionResult;

        const url = new URL(request.url);
        // The payload for a page render INCLUDES the page's root component
        // AND merges in any results from a PE form submission.
        const rscPayload: RscPayload = {
          root: createElement(Fragment, null, [
            nonce &&
            createElement('meta', { property: 'csp-nonce', nonce, key: 1 }),
            createElement(PageComponent, { key: 2 }),
          ]),
          formState: formState,
          returnValue: returnValue,
        };

        const rscOptions = temporaryReferences ? { temporaryReferences } : {};
        const rscStream = ReactServer.renderToReadableStream<RscPayload>(
          rscPayload,
          rscOptions,
        );

        const clientRouteState = storage.getCurrentClientRouteState();
        if (clientRouteState.redirect) {
          return serverRedirect(storage);
        }

        // If the request is for an RSC payload (client-side navigation), send it directly.
        const isRscRequest = (!request.headers.get('accept')?.includes('text/html') &&
          !url.searchParams.has('__html')) ||
          url.searchParams.has('__rsc');

        if (isRscRequest) {
          responseHeaders.set('Content-Type', 'text/x-component;charset=utf-8');
          responseHeaders.set('vary', 'accept');
          return new Response(rscStream, { headers: responseHeaders });
        }

        // Delegate to SSR for HTML rendering
        const ssrEntryModule = await import.meta.viteRsc.loadModule<
          typeof import('./entry.ssr.tsx')
        >('ssr', 'index');

        const { stream: htmlStream, status } = await ssrEntryModule.renderHTML(
          rscStream,
          {
            debugNojs: url.searchParams.has('__nojs'),
            formState: formState,
            nonce,
          },
        );

        if (
          nonce &&
          responseHeaders.get('content-type')?.includes('text/html')
        ) {
          const cspValue = [
            `default-src 'self';`,
            // `unsafe-eval` is required during dev since React uses eval for findSourceMapURL feature
            `script-src 'self' 'nonce-${nonce}' ${
              process.env.NODE_ENV !== 'production' ? `'unsafe-eval'` : ``
            };`,
            `style-src 'self' 'unsafe-inline';`,
            `img-src 'self' data:;`,
          ]
            .filter(Boolean)
            .join('');
          responseHeaders.set('content-security-policy', cspValue);
        }
        responseHeaders.set('Content-Type', 'text/html;charset=utf-8');
        responseHeaders.set('vary', 'accept');
        return new Response(htmlStream, { headers: responseHeaders, status });
      });
    };
  };

  return { statics, actions, render };
};

const mergeHeaders = (...sources: HeadersInit[]): Headers => {
  const result = new Headers();
  const mergedCookies = new Map<string, string>();

  // Process all sources, separating cookies from other headers
  for (const source of sources) {
    const headers = new Headers(source);

    // 1. Extract cookies from the 'Cookie' header (for request-like sources)
    for (const [name, value] of Object.entries(getCookies(headers))) {
      mergedCookies.set(name, value);
    }

    // 2. Extract cookies from 'Set-Cookie' headers (for response-like sources)
    for (const cookie of getSetCookies(headers)) {
      // The value from Set-Cookie is what matters.
      if (cookie.value === '') {
        mergedCookies.delete(cookie.name);
      } else {
        mergedCookies.set(cookie.name, cookie.value);
      }
    }

    // 3. Append all OTHER headers, skipping the ones we've processed.
    for (const [key, value] of headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'cookie' && lowerKey !== 'set-cookie') {
        result.append(key, value);
      }
    }
  }

  // 4. Serialize the final cookie string, filtering out any marked for deletion.
  const cookieString = Array.from(mergedCookies.entries())
    .filter(([, value]) => value !== '') // A value of '' signals deletion.
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  // 5. Set the final cookie header only if it contains cookies.
  if (cookieString) {
    result.set('Cookie', cookieString);
  }

  return result;
};
