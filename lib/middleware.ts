import process from 'node:process';
import { extname } from '@std/path/extname';
import { fromFileUrl } from '@std/path/from-file-url';
import { join } from '@std/path/join';
import { normalize } from '@std/path/normalize';
import { typeByExtension } from '@std/media-types/type-by-extension';

import type { AppState } from './app-state.ts';
import { getClientIP } from './get-client-ip.ts';
import { logger } from './logger.ts';
import type { Route } from './router.ts';

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
 * Creates a secure static file handler.
 *
 * The handler serves files **only for GET requests** from a configured URL
 * prefix (e.g. `/assets/*` or `/static/*`). It performs a strict whitelist of
 * file extensions, excludes HTML responses, and safeguards against directory
 * traversal attacks. The response includes the appropriate `Content-Type`
 * header and cache‑control directives.
 *
 * This utility works with any router that expects a `Route` object. For
 * convenience, a `staticMiddleware` wrapper is provided to return an array of
 * routes.
 *
 * ### Example Usage
 * ```ts
 * // Serve Vite‑built client assets
 * app.get(
 *   "/assets/*",
 *   createStaticHandler({
 *     prefix: "/assets/",
 *     diskDir: "client/assets/",
 *   }).handler,
 * );
 *
 * // Serve custom public files with a shorter cache TTL
 * app.get(
 *   "/static/*",
 *   createStaticHandler({
 *     prefix: "/static/",
 *     diskDir: "public/",
 *     cacheControl: "public, max-age=86400",
 *   }).handler,
 * );
 * ```
 *
 * @template TState - Your application state type
 * @param options Configuration for the static handler
 * @property prefix The public URL prefix that maps to the `baseUrl`. Defaults to `/`.
 * @property directory Directory inside the `dist` folder to serve from, e.g.
 *   "client/assets/" or "public/"
 * @property baseUrl Optional base `dist` URL (defaults to `./dist/`)
 * @property cacheControl Optional `Cache‑Control` header value (production vs dev)
 * @property headers Optional headers to add to every successful response.
 * @property allowedExtensions Optional whitelist of file extensions. HTML is always excluded.
 * @returns A `Route` object compatible with your router
 */
export function createStaticHandler<TState extends AppState = AppState>(options: {
  /**
   * URL path prefix, e.g., "/assets" or "/static"
   */
  prefix: string;
  /**
   * Directory inside dist/ to serve from, e.g., "client/assets" or "public"
   */
  directory: string;
  /** Optional base dist URL (defaults to ./dist/)
   */
  baseUrl?: URL;
  /** Optional custom cache headers */
  cacheControl?: string;
  /** Optional custom headers */
  headers?: HeadersInit;
  /** Optional set of allowed file extensions for static serving. Defaults to common asset types.
   */
  allowedExtensions?: string[];
}): Route<TState> {
  const {
    prefix = '/',
    directory,
    baseUrl = new URL('./dist/', import.meta.url),
    cacheControl = process.env.NODE_ENV === 'production'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    // Default allowed extensions if none provided
    allowedExtensions = [
      '.js',
      '.mjs',
      '.css',
      '.png',
      '.jpg',
      '.jpeg',
      '.svg',
      '.webp',
      '.ico',
      '.woff',
      '.woff2',
      '.ttf',
      '.txt',
    ],
  } = options;

  // Convert the file:// baseUrl to an absolute filesystem path.
  // This is our trusted root directory.
  // const rootPath = fromFileUrl(baseUrl);
  const rootPath = join(fromFileUrl(baseUrl), directory);

  return {
    method: ['GET', 'HEAD'],
    pattern: `${prefix}/*`,
    handler: async (context) => {
      const request = context.request;
      const url = new URL(request.url);

      // 1. Sanitize and resolve the requested file path.
      // - Decode URI components like %20.
      // - Remove the public prefix to get the relative path.
      // - Join it with our trusted root path.
      let relativePath = decodeURIComponent(url.pathname).substring(prefix.length);

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

      // 3️⃣ Extension whitelist & HTML exclusion
      const fileExtension = extname(relativePath).toLowerCase();

      // Skip serving HTML or disallowed extensions
      if (fileExtension === '.html' || !allowedExtensions.includes(fileExtension)) {
        // Let the request fall through to the RSC handler
        return context.next();
      }

      const filePath = join(rootPath, relativePath);

      // 2️⃣ Security Check – normalization & symlink resolution
      // Normalize the constructed path to eliminate any '..' or '.' segments.
      const normalizedPath = normalize(filePath);

      // Resolve any symlinks to get the true filesystem path.
      let resolvedPath: string;
      try {
        resolvedPath = await Deno.realPath(normalizedPath);
      } catch {
        // If realPath fails (e.g., path does not exist), fallback to normalizedPath.
        resolvedPath = normalizedPath;
      }

      // 2. Security Check: Prevent path traversal attacks.
      // Ensure the resolved absolute `filePath` is still within our trusted `rootPath`.
      if (!resolvedPath.startsWith(rootPath)) {
        logger.warn('Blocked directory traversal attempt', {
          path: url.pathname,
          resolved: resolvedPath,
          ip: context.state?.clientIP,
          requestId: context.state?.requestId,
        });

        // Return 403 Forbidden if the path attempts to escape the root directory.
        return new Response('Forbidden', { status: 403 });
      }

      // 3. Open the file using Deno.open.
      // This is more direct and secure than `fetch` for local files.
      // Use a try-catch block as `open` throws on not-found, which is a normal 404 case.
      try {
        // 3️⃣ Open the file – now using the safely‑resolved path.
        const file = await Deno.open(resolvedPath, { read: true });

        // This shouldn't happen, but TypeScript safety
        if (!file) return new Response('Not Found', { status: 500 });

        // `using` ensures the file is closed automatically when the handler exits.
        // 4. Get file stats for Content-Length and determine the media type.
        const stats = await file.stat().catch(() => null);
        const contentType = typeByExtension(fileExtension) ?? 'application/octet-stream';

        // 5. Construct all headers for the response.
        const headers = new Headers(options.headers);
        headers.set('Content-Type', contentType);
        if (stats) headers.set('Content-Length', String(stats.size));
        headers.set('Cache-Control', cacheControl);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,HEAD');
        headers.set('Access-Control-Allow-Headers', '*');

        // 6. If it's a HEAD request, we've done all we need. Return just the headers.
        if (request.method === 'HEAD') {
          return new Response(null, { headers });
        }

        // 7. For GET requests, stream the file content in the response.
        return new Response(file.readable, { headers });
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          return new Response('Not Found', { status: 404 });
        }

        logger.error('Failed to open static file', {
          path: url.pathname,
          resolved: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
        return new Response('Internal Server Error', { status: 500 });
      }
    },
  };
}

/**
 * Convenience middleware wrapper that returns an array of Route objects using
 * `createStaticHandler`. This avoids duplication when multiple routers expect a
 * list of routes (e.g., `app.use(...staticMiddleware({ ... }))`.
 */
export function staticMiddleware<TState extends AppState = AppState>(options: {
  prefix: string;
  directory: string;
  baseUrl?: URL;
  cacheControl?: string;
  headers?: HeadersInit;
  allowedExtensions?: string[];
}): Route<TState>[] {
  const route = createStaticHandler<TState>(options);
  return [route];
}
