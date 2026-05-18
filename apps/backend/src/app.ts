import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { auth } from '@teacher-score/auth';
import { createLogger } from '@teacher-score/logger';
import { sessionMiddleware } from './middleware/session';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { requireOrgMiddleware } from './middleware/require-org';
import { studentsRoute } from './routes/students';
import { uploadRoute } from './routes/upload';
import { gradeRoute } from './routes/grade';
import { meRoute } from './routes/me';
import { mistakesRoute } from './routes/mistakes';
import { templatesRoute } from './routes/templates';
import { classesRoute } from './routes/classes';
import { analyticsRoute } from './routes/analytics';
import { pdfRoute } from './routes/pdf';
import { orgsRoute } from './routes/organizations';
import { shareRoute } from './routes/share';
import { mobileCaptureRoute } from './routes/mobile-capture';

const log = createLogger({ scope: 'backend' });

export function createApp() {
  const app = new Hono();

  app.use('*', honoLogger((msg) => log.info(msg)));

  // Backend speaks to the web app via Next rewrites (same-origin). For local
  // direct access (e.g. integration tests), allow the configured origin.
  app.use(
    '*',
    cors({
      origin: process.env.APP_URL ?? 'http://localhost:3000',
      credentials: true,
    }),
  );

  app.get('/api/health', (c) =>
    c.json({ status: 'ok', ts: new Date().toISOString(), service: 'backend' }),
  );

  // Better-Auth handler — owned by backend only. Per checklist §三 (red lines):
  // apps/web MUST NOT carry a Better-Auth route handler.
  app.all('/api/auth/*', async (c) => {
    return auth.handler(c.req.raw);
  });

  // Global rate limit (per-user + per-IP)
  app.use('/api/*', rateLimitMiddleware);

  // session population for everything except /api/auth/* (which is its own flow)
  app.use('/api/*', sessionMiddleware);

  // Authenticated routes require an active org
  app.use('/api/students/*', requireOrgMiddleware);
  app.use('/api/students', requireOrgMiddleware);
  app.use('/api/upload', requireOrgMiddleware);
  app.use('/api/grade', requireOrgMiddleware);
  app.use('/api/grade/*', requireOrgMiddleware);
  app.use('/api/me', requireOrgMiddleware);
  app.use('/api/mistakes', requireOrgMiddleware);
  app.use('/api/mistakes/*', requireOrgMiddleware);
  app.use('/api/templates', requireOrgMiddleware);
  app.use('/api/templates/*', requireOrgMiddleware);
  app.use('/api/classes', requireOrgMiddleware);
  app.use('/api/classes/*', requireOrgMiddleware);
  app.use('/api/analytics', requireOrgMiddleware);
  app.use('/api/analytics/*', requireOrgMiddleware);
  app.use('/api/pdf', requireOrgMiddleware);
  app.use('/api/pdf/*', requireOrgMiddleware);
  // organizations: only /mine and /switch don't need active org; the rest do.
  app.use('/api/orgs/members', requireOrgMiddleware);
  app.use('/api/orgs/members/*', requireOrgMiddleware);
  app.use('/api/orgs/invite', requireOrgMiddleware);
  app.use('/api/share/create/*', requireOrgMiddleware);
  // mobile-capture: /start, /poll, /finish require org; /upload uses HMAC token only.
  app.use('/api/mobile-capture/start', requireOrgMiddleware);
  app.use('/api/mobile-capture/poll', requireOrgMiddleware);
  app.use('/api/mobile-capture/finish', requireOrgMiddleware);

  app.route('/api/me', meRoute);
  app.route('/api/students', studentsRoute);
  app.route('/api/upload', uploadRoute);
  app.route('/api/grade', gradeRoute);
  app.route('/api/mistakes', mistakesRoute);
  app.route('/api/templates', templatesRoute);
  app.route('/api/classes', classesRoute);
  app.route('/api/analytics', analyticsRoute);
  app.route('/api/pdf', pdfRoute);
  app.route('/api/orgs', orgsRoute);
  app.route('/api/share', shareRoute);
  app.route('/api/mobile-capture', mobileCaptureRoute);

  app.onError((err, c) => {
    log.error({ err }, 'unhandled');
    return c.json({ error: 'internal_error', message: 'Something went wrong' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  return app;
}
