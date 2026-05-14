import { eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { randomId } from './ids';

export async function ensurePersonalOrganization(opts: { userId: string; userName: string }) {
  // Idempotent: if the user already owns a personal org, do nothing.
  const existing = await db
    .select({ orgId: schema.members.organizationId })
    .from(schema.members)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.members.organizationId))
    .where(eq(schema.members.userId, opts.userId));

  for (const row of existing) {
    const orgs = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, row.orgId))
      .limit(1);
    if (orgs[0]?.isPersonal) return orgs[0];
  }

  const orgId = randomId('org');
  const slug = `personal-${opts.userId.slice(0, 12)}`;

  const inserted = await db
    .insert(schema.organizations)
    .values({
      id: orgId,
      name: `${opts.userName} 的工作区`,
      slug,
      isPersonal: true,
      subscriptionTier: 'free',
      monthlyQuota: 50,
    })
    .returning();

  await db.insert(schema.members).values({
    id: randomId('mbr'),
    organizationId: orgId,
    userId: opts.userId,
    role: 'owner',
  });

  // Also mark this as the active org on the user's next session.
  // Better-Auth will set activeOrganizationId on session creation; here we just ensure
  // membership exists and let the auth flow pick it.
  return inserted[0]!;
}
