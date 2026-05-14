import type { Context, Next } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

declare module 'hono' {
  interface ContextVariableMap {
    activeOrganizationId?: string;
  }
}

export async function requireOrgMiddleware(c: Context, next: Next) {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let orgId = session.activeOrganizationId;

  // Fall back to user's personal organization if no active org is set.
  if (!orgId) {
    const rows = await db
      .select({
        orgId: schema.members.organizationId,
        isPersonal: schema.organizations.isPersonal,
      })
      .from(schema.members)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.members.organizationId))
      .where(eq(schema.members.userId, session.userId));

    const personal = rows.find((r) => r.isPersonal);
    orgId = personal?.orgId ?? rows[0]?.orgId ?? null;
  }

  if (!orgId) {
    return c.json(
      { error: 'no_active_organization', message: 'No active organization for this user' },
      403,
    );
  }

  // Verify membership (defence-in-depth — Better-Auth org plugin sets activeOrganizationId,
  // but we re-verify against the members table on every request).
  const member = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.userId, session.userId), eq(schema.members.organizationId, orgId)))
    .limit(1);

  if (member.length === 0) {
    return c.json({ error: 'forbidden', message: 'Not a member of this organization' }, 403);
  }

  c.set('activeOrganizationId', orgId);
  await next();
}
