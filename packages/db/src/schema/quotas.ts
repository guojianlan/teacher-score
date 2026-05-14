import { pgTable, text, timestamp, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Per checklist §四.8: monthly_quotas — composite PK (organizationId, yearMonth).
// yearMonth is 'YYYY-MM' string for easy human inspection and indexability.

export const monthlyQuotas = pgTable(
  'monthly_quotas',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(), // '2026-05'
    gradingsUsed: integer('gradings_used').notNull().default(0),
    tokensUsed: integer('tokens_used').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.yearMonth] }),
    orgIdx: index('monthly_quotas_org_idx').on(t.organizationId),
  }),
);
