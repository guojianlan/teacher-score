import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

// Stage 4 §十.2-4: invitations + role management + org switching.
// MVP scope: owner can invite by email, switch active org, see members.

export const orgsRoute = new Hono();

orgsRoute.get('/mine', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const rows = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      isPersonal: schema.organizations.isPersonal,
      subscriptionTier: schema.organizations.subscriptionTier,
      monthlyQuota: schema.organizations.monthlyQuota,
      role: schema.members.role,
    })
    .from(schema.members)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.members.organizationId))
    .where(eq(schema.members.userId, session.userId));
  return c.json({ organizations: rows });
});

orgsRoute.post('/switch', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  const id = (body as { organizationId?: string })?.organizationId;
  if (!id) return c.json({ error: 'bad_request' }, 400);

  const member = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.userId, session.userId), eq(schema.members.organizationId, id)))
    .limit(1);
  if (member.length === 0) return c.json({ error: 'not_a_member' }, 403);

  await db
    .update(schema.sessions)
    .set({ activeOrganizationId: id, updatedAt: new Date() })
    .where(eq(schema.sessions.id, session.sessionId));
  return c.json({ ok: true });
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

orgsRoute.post('/invite', async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);

  // role check — only owner/admin can invite
  const me = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.userId, session.userId), eq(schema.members.organizationId, orgId)))
    .limit(1);
  if (me.length === 0 || me[0]!.role === 'member') {
    return c.json({ error: 'forbidden', message: 'requires admin/owner role' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);

  const id = `inv_${ulid()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const inserted = await db
    .insert(schema.invitations)
    .values({
      id,
      organizationId: orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      status: 'pending',
      inviterId: session.userId,
      expiresAt,
    })
    .returning();
  return c.json({ invitation: inserted[0] }, 201);
});

orgsRoute.get('/members', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const rows = await db
    .select({
      id: schema.members.id,
      userId: schema.members.userId,
      role: schema.members.role,
      userName: schema.users.name,
      userEmail: schema.users.email,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.organizationId, orgId));
  return c.json({ members: rows });
});

orgsRoute.patch('/members/:memberId/role', async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);

  const me = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.userId, session.userId), eq(schema.members.organizationId, orgId)))
    .limit(1);
  if (me.length === 0 || me[0]!.role !== 'owner') {
    return c.json({ error: 'forbidden', message: 'requires owner role' }, 403);
  }

  const memberId = c.req.param('memberId');
  const body = await c.req.json().catch(() => null);
  const role = (body as { role?: 'admin' | 'member' | 'owner' })?.role;
  if (!role || !['admin', 'member', 'owner'].includes(role)) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const updated = await db
    .update(schema.members)
    .set({ role })
    .where(and(eq(schema.members.id, memberId), eq(schema.members.organizationId, orgId)))
    .returning();
  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ member: updated[0] });
});
