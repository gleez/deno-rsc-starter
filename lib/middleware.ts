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
