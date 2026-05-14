import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createLogger, initSentry } from '@teacher-score/logger';

const log = createLogger({ scope: 'http' });
await initSentry();
const port = Number(process.env.BACKEND_PORT ?? 3001);
const app = createApp();

const server = serve({ fetch: app.fetch, port });
log.info({ port }, 'backend listening');

function shutdown(signal: string) {
  log.info({ signal }, 'http shutting down');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).close(() => process.exit(0));
  // Hard exit fallback in case close hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
