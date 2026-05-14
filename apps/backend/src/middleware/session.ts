import type { Context, Next } from 'hono';
import { auth } from '@teacher-score/auth';

export interface SessionContext {
  userId: string;
  sessionId: string;
  activeOrganizationId: string | null;
  email: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    session?: SessionContext;
  }
}

export async function sessionMiddleware(c: Context, next: Next) {
  try {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (result?.session && result.user) {
      c.set('session', {
        userId: result.user.id,
        sessionId: result.session.id,
        // Better-Auth organization plugin attaches activeOrganizationId on the session
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeOrganizationId: (result.session as any).activeOrganizationId ?? null,
        email: result.user.email,
      });
    }
  } catch {
    // Session lookup is best-effort; downstream require-org / require-auth enforce.
  }
  await next();
}
