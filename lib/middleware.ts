import process from 'node:process';
import { extname } from '@std/path/extname';
import { fromFileUrl } from '@std/path/from-file-url';

import type { AppState } from './app-state.ts';
import { getClientIP } from './get-client-ip.ts';
import { logger } from './logger.ts';
import type { Route } from './router.ts';

export const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript;charset=UTF-8',
  '.mjs': 'text/javascript;charset=UTF-8',
  '.css': 'text/css;charset=UTF-8',
  '.txt': 'text/plain;charset=UTF-8',
  '.html': 'text/html;charset=UTF-8',
  '.json': 'application/json;charset=UTF-8',

  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  // Add more as needed
};

export function logMiddleware<TState extends AppState = AppState>(): Route<
  TState
>[] {
  return [
    {
      method: undefined, // All methods
      pattern: new URLPattern({ pathname: '*' }), // All paths
      handler: async (ctx) => {
        // Exclude health/check endpoints from logging to reduce noise
        if (ctx.url.pathname === '/health' || ctx.url.pathname === '/ready') {
          return ctx.next();
        }

        const start = performance.now();

        // 1. Request ID — prefer header, fallback to UUID
        const requestId = ctx.request.headers.get('X-Request-Id')?.trim() ||
          crypto.randomUUID();

        // 2. Client IP (using your getClientIP)
        const clientIP = getClientIP(ctx.request, ctx.info);

        // 3. Enrich state
        Object.assign(ctx.state, {
          requestId,
          clientIP,
          requestStartTime: start,
        });

        try {
          // 4. Proceed to next handler
          const response = await ctx.next();

          // 5. Calculate latency
          const latencyMs = performance.now() - start;

          // 6. Clone response to add header safely
          const loggedResponse = response.clone
            ? response.clone()
            : new Response(response.body, response);
          loggedResponse.headers.set('X-Request-Id', requestId);

          // 7. Structured logging
          logger.info('HTTP request', {
            requestId,
            method: ctx.request.method,
            path: ctx.url.pathname,
            query: ctx.url.search || null,
            status: response.status,
            latencyMs: Number(latencyMs.toFixed(2)),
            clientIP,
            userAgent: ctx.request.headers.get('User-Agent') || null,
          });

          return loggedResponse;
        } catch (error) {
          const latencyMs = performance.now() - start;

          logger.error('HTTP request failed', {
            requestId,
            method: ctx.request.method,
            path: ctx.url.pathname,
            clientIP,
            latencyMs: Number(latencyMs.toFixed(2)),
            error: error instanceof Error ? error.message : String(error),
          });

          // Re-throw to let error handling middleware deal with it
          throw error;
        }
      },
    },
  ];
}

/**
 * Creates a secure static file handler for a given URL prefix and disk directory.
 *
 * Use this to serve static assets from different paths (e.g., `/assets/*`, `/static/*`, `/cdn/*`)
 * while preventing directory traversal attacks and providing proper caching/content-type headers.
 *
 * ### Example Usage
 *
 * ```ts
 * // Serve Vite-built client assets
 * app.get(
 *   "/assets/*",
 *   createStaticHandler({
 *     urlPrefix: "/assets/",
 *     diskDir: "client/assets/",
 *   }).handler
 * );
 *
 * // Serve custom public files with shorter cache
 * app.get(
 *   "/static/*",
 *   createStaticHandler({
 *     urlPrefix: "/static/",
 *     diskDir: "public/",
 *     cacheControl: "public, max-age=86400",
 *   }).handler
 * );
 * ```
 *
 * @template TState - Your application state type
 * @param options Configuration for the static handler
 * @returns A Route object compatible with your router
 */
export function createStaticHandler<TState extends AppState = AppState>(options: {
  /** URL path prefix, e.g., "/assets/*" or "/static/*" */
  urlPrefix: string;
  /** Directory inside dist/ to serve from, e.g., "client/assets/" or "public/" */
  diskDir: string;
  /** Optional base dist URL (defaults to ./dist/) */
  distDirUrl?: URL;
  /** Optional custom cache headers */
  cacheControl?: string;
}): Route<TState> {
  const {
    urlPrefix,
    diskDir,
    distDirUrl = new URL('./dist/', import.meta.url),
    cacheControl = process.env.NODE_ENV === 'production'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  } = options;

  const baseDiskUrl = new URL(diskDir, distDirUrl);

  return {
    pattern: `${urlPrefix}*`,
    handler: async (context) => {
      const url = new URL(context.request.url);
      let relativePath = url.pathname.substring(urlPrefix.length);

      // Normalize leading slash
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }

      // Early block for obvious bad paths (defense in depth)
      if (
        relativePath.includes('..') || relativePath.includes('\\') || relativePath.includes('\0')
      ) {
        logger.warn('Blocked suspicious static request', {
          path: url.pathname,
          ip: context.state?.clientIP,
          requestId: context.state?.requestId,
        });
        return new Response('Forbidden', { status: 403 });
      }

      let assetUrl: URL;
      try {
        assetUrl = new URL(relativePath, baseDiskUrl);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      const assetPath = fromFileUrl(assetUrl);
      const basePath = fromFileUrl(baseDiskUrl);

      // Critical security check: prevent directory traversal attacks
      if (!assetPath.startsWith(basePath)) {
        logger.warn('Blocked directory traversal attempt', {
          path: url.pathname,
          resolved: assetPath,
          ip: context.state?.clientIP,
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

        logger.error('Failed to open static file', {
          path: url.pathname,
          resolved: assetPath,
          error: err instanceof Error ? err.message : String(err),
        });
        return new Response('Internal Server Error', { status: 500 });
      }

      // This shouldn't happen, but TypeScript safety
      if (!file) return new Response('Not Found', { status: 500 });

      const ext = extname(assetPath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

      return new Response(file.readable, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          // Optional CORS if needed
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          'Access-Control-Allow-Headers': '*',
        },
      });
    },
  };
}
