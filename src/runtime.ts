import { createApp } from '@/lib/app-state.ts';
import { logger } from '@/lib/logger.ts';
import { logMiddleware } from '@/lib/middleware.ts';
import { createHandlers } from './framework/rsc.ts';

const app = createApp();
app.use(logMiddleware());

// This file is a Chrome DevTools feature (Automatic Workspace Folders) that lets DevTools
// automatically map your local project folder for live editing when debugging localhost.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (c) => {
  // You can generate once and store in a file if you want persistence
  const uuid = crypto.randomUUID();

  // Get absolute project root path
  const projectRoot = Deno.cwd(); // Current working directory (your project root)

  const payload = {
    workspace: {
      root: projectRoot,
      uuid: uuid,
    },
  };

  return c.json(payload, 200, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
  });
});

/** The absolute URL to the root of the build output directory (e.g., `file:///path/to/dist/`). */
// const distDirUrl = new URL(import.meta.resolve("../../"));

const { statics, actions, render } = createHandlers({
  action: '/_rsc/actions',
  moduleBaseUrl: '/assets/',
  distDirUrl: new URL('../', import.meta.url),
});

app.get('/', render(() => import('@/src/pages/home.tsx')))
  .get('/assets/*', statics.handler)
  .post('/_rsc/actions', actions.handler);

// GET catch-all for undefined routes
app.default(() => new Response('Not found', { status: 404 }));

function shutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  // Close DB connection
  // Optional: close other resources (cache, queues, etc.)

  // Exit process after cleanup
  Deno.exit(0);
}

// Listen for termination signals
Deno.addSignalListener('SIGINT', () => shutdown('SIGINT'));
Deno.addSignalListener('SIGTERM', () => shutdown('SIGTERM'));

export default app;
