import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { createLogger } from '@teacher-score/logger';

const log = createLogger({ scope: 'me' });

export const meRoute = new Hono();

meRoute.get('/', async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);

  const org = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);

  const ym = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const quota = await db
    .select()
    .from(schema.monthlyQuotas)
    .where(
      and(
        eq(schema.monthlyQuotas.organizationId, orgId),
        eq(schema.monthlyQuotas.yearMonth, ym),
      ),
    )
    .limit(1);

  return c.json({
    user: { id: session.userId, email: session.email },
    organization: org[0]
      ? {
          id: org[0].id,
          name: org[0].name,
          isPersonal: org[0].isPersonal,
          subscriptionTier: org[0].subscriptionTier,
          monthlyQuota: org[0].monthlyQuota,
        }
      : null,
    quota: {
      yearMonth: ym,
      gradingsUsed: quota[0]?.gradingsUsed ?? 0,
      tokensUsed: quota[0]?.tokensUsed ?? 0,
      costCents: quota[0]?.costCents ?? 0,
    },
  });
});

// Data export — JSON dump of the user's org-scoped data. §十.11.
meRoute.get('/export', async (c) => {
  const orgId = c.get('activeOrganizationId');
  const session = c.get('session');
  if (!orgId || !session) return c.json({ error: 'unauthorized' }, 401);

  const [students, gradings, mistakes, templates, quotas] = await Promise.all([
    db.select().from(schema.students).where(eq(schema.students.organizationId, orgId)),
    db
      .select()
      .from(schema.gradingRecords)
      .where(eq(schema.gradingRecords.organizationId, orgId)),
    db
      .select()
      .from(schema.mistakeCollection)
      .where(eq(schema.mistakeCollection.organizationId, orgId)),
    db.select().from(schema.examPapers).where(eq(schema.examPapers.organizationId, orgId)),
    db.select().from(schema.monthlyQuotas).where(eq(schema.monthlyQuotas.organizationId, orgId)),
  ]);

  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        organization: { id: orgId },
        students,
        gradingRecords: gradings,
        mistakeCollection: mistakes,
        examPapers: templates,
        monthlyQuotas: quotas,
      },
      null,
      2,
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="teacher-score-export.json"',
      },
    },
  );
});

// Account deletion — drops everything owned by this user's personal org
// AND removes their membership from any other org. §十.12.
meRoute.delete('/', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  log.warn({ userId: session.userId }, 'account deletion requested');

  // Find personal org and delete cascade.
  const memberships = await db
    .select({
      orgId: schema.members.organizationId,
      isPersonal: schema.organizations.isPersonal,
    })
    .from(schema.members)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.members.organizationId))
    .where(eq(schema.members.userId, session.userId));

  for (const m of memberships) {
    if (m.isPersonal) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, m.orgId));
    } else {
      // leave the org (don't drop org's other members)
      await db
        .delete(schema.members)
        .where(
          and(
            eq(schema.members.userId, session.userId),
            eq(schema.members.organizationId, m.orgId),
          ),
        );
    }
  }

  // Finally drop the user — cascades wipe sessions/accounts/verifications.
  await db.delete(schema.users).where(eq(schema.users.id, session.userId));

  return c.json({ ok: true });
});
