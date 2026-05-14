import pino from 'pino';

// Standalone logger child — does NOT import from ./index to avoid module-init cycle.
// (sentry.ts is re-exported from index.ts; importing back the other way causes TDZ.)
const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: process.env.APP_NAME ?? 'teacher-score', scope: 'sentry' },
}).child({});

// Silent-when-unconfigured Sentry wrapper. Server-side only.
// Per checklist §六.15: Sentry should be optional and dev-friendly.

let captureFn: ((err: unknown, ctx?: Record<string, unknown>) => void) | null = null;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    log.debug('SENTRY_DSN unset — Sentry disabled');
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Sentry = await import('@sentry/node' as any).catch(() => null);
    if (!Sentry) {
      log.warn('@sentry/node not installed — falling back to log-only error capture');
      captureFn = (err, ctx) => log.error({ err, ctx }, 'captured error (no Sentry)');
      return;
    }
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.1),
    });
    captureFn = (err, ctx) => {
      Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
    };
    log.info('Sentry initialized');
  } catch (err) {
    log.warn({ err }, 'Sentry init failed; continuing without it');
  }
}

export function captureError(err: unknown, ctx?: Record<string, unknown>): void {
  if (captureFn) captureFn(err, ctx);
  else log.error({ err, ctx }, 'error');
}
