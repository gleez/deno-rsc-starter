import handler from './dist/rsc/index.js';
import { logger } from '@/lib/logger.ts';

const port = parseInt(Deno.env.get('PORT') || '8080', 10);

export default function main() {
  try {
    // Start the server
    Deno.serve(
      {
        port: port,
        hostname: '0.0.0.0',
        onListen: ({ hostname, port }) => {
          logger.info('Gleez started', { deno: Deno.version.deno });
          logger.info(`Server started on http://${hostname}:${port}`);
        },
        onError: (error) => {
          logger.error('HTTP server error:', error);
          return new Response('Internal Server Error', { status: 500 });
        },
      },
      handler,
    );
  } catch (err) {
    logger.error(`Server failed to start: ${err}`);
  }
}

if (import.meta.main) {
  main();
}
