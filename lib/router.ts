/**
 * Minimal, type-safe HTTP router for Deno and modern browsers
 * built on the Web-standard URLPattern API.
 *
 * @module Router
 * @see {@link https://github.com/FartLabs/rt} GitHub Repository
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URLPattern} URLPattern API
 *
 * @example
 * ```ts
 * import { createRouter } from "@/lib/router.ts";
 *
 * const router = createRouter()
 *   .get("/", () => new Response("Hello World"))
 *   .post("/users", createUserHandler);
 *
 * Deno.serve(router.fetch);
 * ```
 *
 * @example With state management:
 * ```ts
 * interface AppState { user?: { id: string } };
 *
 * const router = createRouter<AppState>()
 *   .use(authMiddleware())
 *   .get("/profile", (ctx) => {
 *     return new Response(`Hello ${ctx.state.user?.id}`);
 *   });
 * ```
 */
import { type Route as StdRoute, route } from '@std/http/unstable-route';

type StatusCode = number;
type HeaderRecord = HeadersInit | Record<string, string>;
type Data = string | ArrayBuffer | ReadableStream | Uint8Array;

export interface ResponseInit<T extends StatusCode = StatusCode> {
  headers?: HeaderRecord;
  status?: T;
  statusText?: string;
}

export interface Route<TState = unknown> extends Omit<StdRoute, 'handler' | 'pattern'> {
  pattern: string | URLPattern;
  handler: HandleRequest<TState>;
}

export interface Context<TState = unknown> {
  /**
   * The incoming HTTP request object
   * @example
   * const method = context.request.method;
   * const body = await context.request.json();
   */
  request: Request;

  /**
   * Get route parameter by name
   * @param name The parameter name (e.g., "id" for route path "/test/:id")
   * @returns The parameter value or undefined if not found
   * @example
   * const id = context.param("id"); // Returns "123" for route "/test/123"
   */
  param(name: string): string | undefined;

  /**
   * The parsed URL pattern result containing route parameters
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
   * @example
   * const userId = context.params?.pathname.groups.id;
   */
  params: URLPatternResult | undefined;

  /**
   * Get a decoded query parameter by key. Returns `undefined` if the key doesn't exist.
   * Automatically handles URL-encoded values (e.g., `%20` → space, `+` → space).
   *
   * @param key - The query parameter key (e.g., "name" for `?name=Jane+Doe`).
   * @returns The decoded value as a string, or `undefined` if the key is missing.
   *
   * @example
   * // For URL `/api/avatar?name=Jane+Doe&size=100`
   * const name = context.query("name"); // "Jane Doe" (decoded from "+")
   * const size = context.query("size"); // "100"
   * const missing = context.query("missing"); // undefined
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
   */
  query(key: string): string | undefined;

  /**
   * Function to call the next middleware/handler in the chain
   * @returns Promise that resolves to the Response
   * @example
   * // In middleware:
   * const response = await context.next();
   * response.headers.set("X-Modified", "true");
   * return response;
   */
  next: () => Promise<Response>;

  /**
   * The parsed URL object of the request
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL
   * @example
   * const pathname = context.url.pathname;
   * const searchParams = context.url.searchParams;
   */
  url: URL;

  /**
   * Information about the server connection (Deno-specific)
   * @see https://deno.land/api?s=Deno.ServeHandlerInfo
   * @example
   * const remoteAddr = context.info?.remoteAddr;
   */
  info: Deno.ServeHandlerInfo | undefined;

  /**
   * Custom state object that flows through middleware chain
   * @template TState Type of the state object
   * @example
   * // Setting state:
   * router.use((ctx) => {
   *   ctx.state = { userId: 123 };
   *   return ctx.next();
   * });
   *
   * // Getting state:
   * const userId = context.state.userId;
   */
  state: TState;

  /**
   * Send JSON response with multiple signatures:
   * - json(data)
   * - json(data, status)
   * - json(data, init)
   * - json(data, status, headers)
   */
  json<T>(data: T): Response;
  json<T>(data: T, status: StatusCode): Response;
  json<T>(data: T, init: ResponseInit): Response;
  json<T>(data: T, status: StatusCode, headers: HeaderRecord): Response;

  /**
   * Send text response with multiple signatures
   */
  text(data: string): Response;
  text(data: string, status: StatusCode): Response;
  text(data: string, init: ResponseInit): Response;
  text(
    data: string,
    status: StatusCode,
    headers: HeaderRecord,
  ): Response;

  /**
   * Send HTML response with multiple signatures
   */
  html(data: string): Response;
  html(data: string, status: StatusCode): Response;
  html(data: string, init: ResponseInit): Response;
  html(
    data: string,
    status: StatusCode,
    headers: HeaderRecord,
  ): Response;
}

export type ErrorContext<TState = unknown> = {
  request: Request;
  info?: Deno.ServeHandlerInfo;
  state?: TState;
};

export type HandleRequest<TState = unknown> = (
  context: Context<TState>,
) => Response | Promise<Response>;

export type HandleDefault<TState = unknown> = (
  context: Context<TState>,
) => Response | Promise<Response>;

export type HandleError<TState = unknown> = (
  error: Error,
  context: Context<TState>,
) => Response | Promise<Response>;

// Router interface that defines the shape of the router object
export interface Router<TState = unknown> {
  routes: Route<TState>[];
  initializeState: () => TState;
  handleDefault: HandleDefault;
  handleError: HandleError;

  fetch: (
    request: Request,
    info?: Deno.ServeHandlerInfo,
    state?: TState,
  ) => Promise<Response>;

  state: (defaultState: () => TState) => Router<TState>;
  with: (route: Route<TState>) => Router<TState>;
  on: (
    method: string | string[] | undefined,
    pathname: string,
    handler: HandleRequest<TState>,
  ) => Router<TState>;
  use: (data: Route<TState>[] | Router<TState>) => Router<TState>;
  default: (handle: HandleDefault) => Router<TState>;
  error: (handle: HandleError) => Router<TState>;

  connect: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  delete: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  get: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  head: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  options: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  patch: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  post: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  put: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
  trace: (pathname: string, handler: HandleRequest<TState>) => Router<TState>;
}

const createResponse = (
  content: Data,
  arg?: StatusCode | ResponseInit,
  headers?: HeaderRecord,
  contentType?: string,
): Response => {
  let init: ResponseInit = { status: 200 };
  let finalHeaders = new Headers();

  // Handle headers parameter
  if (headers) {
    if (headers instanceof Headers) {
      finalHeaders = new Headers(headers);
    } else {
      finalHeaders = new Headers(Object.entries(headers));
    }
  }

  // Handle different argument patterns
  if (typeof arg === 'number') {
    init.status = arg;
  } else if (arg) {
    init = { status: 200, ...arg };
    if (arg.headers) {
      const argHeaders = new Headers(arg.headers);
      argHeaders.forEach((value, key) => finalHeaders.set(key, value));
    }
  }

  // Set content type if specified
  if (contentType) {
    finalHeaders.set('Content-Type', contentType);
  }

  //   const validBody: BodyInit = content instanceof Uint8Array
  //     ? new Uint8Array(content.buffer, content.byteOffset, content.length)
  //     : content;

  return new Response(content as BodyInit, {
    ...init,
    headers: finalHeaders,
  });
};

// Default handlers
const defaultNotFoundHandler = (): Response => new Response('Not found', { status: 404 });

const defaultErrorHandler = (error: Error): Response =>
  new Response(error.message, { status: 500 });

/**
 * Creates a minimal context for error handling when full request context isn't available.
 *
 * This "dummy" context is necessary because:
 * 1. Error handlers need basic response capabilities (json/text/html)
 * 2. The router expects a complete Context object
 * 3. During errors, some properties (like params/next) may not exist
 *
 * The context provides:
 * - Basic response helpers (json/text/html)
 * - Safe defaults for missing properties
 * - Type safety matching the full Context interface
 */
const toPartialContext = <TState>(
  ctx: ErrorContext<TState>,
): Context<TState> => {
  return {
    request: ctx.request,
    info: ctx.info,
    state: ctx.state ?? {} as TState,
    // Default values for required members
    params: undefined,
    next: () => Promise.resolve(new Response('Internal error')),
    url: new URL(ctx.request.url),
    // Add your helpers
    param: () => undefined,
    query: () => undefined,
    json: (data, _arg?, _headers?) => new Response(JSON.stringify(data)),
    text: (text, _arg?, _headers?) => new Response(text),
    html: (html, _arg?, _headers?) => new Response(html),
  };
};

// Create router function with explicit return type
export const createRouter = <TState = unknown>(): Router<TState> => {
  // Execute function (implementation detail)
  const execute = (
    router: Router<TState>,
    i: number,
    request: Request,
    info: Deno.ServeHandlerInfo | undefined,
    state: TState,
  ): Response | Promise<Response> => {
    if (i >= router.routes.length) {
      return router.handleDefault(toPartialContext({ request, info, state }));
    }

    const { method, pattern, handler } = router.routes[i];
    const next = async () => await execute(router, i + 1, request, info, state);
    const handle = route(
      [
        {
          method,
          pattern: pattern instanceof URLPattern ? pattern : new URLPattern({ pathname: pattern }),
          handler: (request, params, info) => {
            const rUrl = new URL(request.url);
            const exeContext: Context<TState> = {
              request: request,
              params,
              url: rUrl,
              info,
              next,
              state,
              param: (name) => params?.pathname.groups?.[name],
              query: (key) => rUrl.searchParams.get(key) ?? undefined,

              json: (
                data: unknown,
                arg?: StatusCode | ResponseInit,
                headers?: HeaderRecord,
              ): Response => {
                const content = JSON.stringify(data);
                if (typeof arg === 'number' && headers !== undefined) {
                  return createResponse(
                    content,
                    arg,
                    headers,
                    'application/json',
                  );
                }
                return createResponse(
                  content,
                  arg,
                  undefined,
                  'application/json',
                );
              },

              // Text helper with all signatures
              text: (
                data: string,
                arg?: StatusCode | ResponseInit,
                headers?: HeaderRecord,
              ): Response => {
                if (typeof arg === 'number' && headers !== undefined) {
                  return createResponse(data, arg, headers, 'text/plain');
                }
                return createResponse(data, arg, undefined, 'text/plain');
              },

              // HTML helper with all signatures
              html: (
                data: string,
                arg?: StatusCode | ResponseInit,
                headers?: HeaderRecord,
              ): Response => {
                if (typeof arg === 'number' && headers !== undefined) {
                  return createResponse(
                    data,
                    arg,
                    headers,
                    'text/html; charset=UTF-8',
                  );
                }
                return createResponse(
                  data,
                  arg,
                  undefined,
                  'text/html; charset=UTF-8',
                );
              },
            };

            return handler(exeContext);
          },
        },
      ],
      next,
    );

    return handle(request, info);
  };

  // Create the router object
  const router: Router<TState> = {
    routes: [],
    initializeState: () => ({}) as TState,
    handleDefault: defaultNotFoundHandler,
    handleError: defaultErrorHandler,
    fetch: async (request, info, state) => {
      try {
        return await execute(
          router,
          0,
          request,
          info,
          state ?? router.initializeState(),
        );
      } catch (error) {
        if (error instanceof Error) {
          return await router.handleError(
            error,
            toPartialContext({ request, info, state }),
          );
        }
        throw error;
      }
    },
    state: (defaultState) => {
      router.initializeState = defaultState;
      return router;
    },
    with: (routeToAdd) => {
      router.routes.push(routeToAdd);
      return router;
    },
    on: (method, pathname, handler) => {
      const pattern = new URLPattern({ pathname });
      return router.with({ method, pattern, handler });
    },
    use: (data) => {
      if (Array.isArray(data)) {
        router.routes.push(...data);
      } else {
        router.routes.push(...data.routes);
      }
      return router;
    },
    default: (handle) => {
      router.handleDefault = handle;
      return router;
    },
    error: (handle) => {
      router.handleError = handle;
      return router;
    },
    connect: (pathname, handler) => router.on('CONNECT', pathname, handler),
    delete: (pathname, handler) => router.on('DELETE', pathname, handler),
    get: (pathname, handler) => router.on('GET', pathname, handler),
    head: (pathname, handler) => router.on('HEAD', pathname, handler),
    options: (pathname, handler) => router.on('OPTIONS', pathname, handler),
    patch: (pathname, handler) => router.on('PATCH', pathname, handler),
    post: (pathname, handler) => router.on('POST', pathname, handler),
    put: (pathname, handler) => router.on('PUT', pathname, handler),
    trace: (pathname, handler) => router.on('TRACE', pathname, handler),
  };

  return router satisfies Deno.ServeDefaultExport;
};
