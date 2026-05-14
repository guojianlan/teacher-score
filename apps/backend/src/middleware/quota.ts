import type { Context, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { capture } from '@teacher-score/analytics';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function quotaMiddleware(c: Context, next: Next) {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const org = await db
    .select({ monthlyQuota: schema.organizations.monthlyQuota })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);

  const monthlyQuota = org[0]?.monthlyQuota ?? 50;
  const ym = currentYearMonth();

  const usage = await db
    .select({ gradingsUsed: schema.monthlyQuotas.gradingsUsed })
    .from(schema.monthlyQuotas)
    .where(
      and(
        eq(schema.monthlyQuotas.organizationId, orgId),
        eq(schema.monthlyQuotas.yearMonth, ym),
      ),
    )
    .limit(1);

  const used = usage[0]?.gradingsUsed ?? 0;
  if (used >= monthlyQuota) {
    const session = c.get('session');
    if (session) {
      capture({
        distinctId: session.userId,
        organizationId: orgId,
        event: 'quota_exceeded',
        properties: { monthlyQuota, used },
      }).catch(() => undefined);
    }
    return c.json(
      {
        error: 'quota_exceeded',
        message: '本月批改次数已达上限',
        monthlyQuota,
        used,
      },
      402,
    );
  }
  await next();
}
