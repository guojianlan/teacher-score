import { and, eq, type SQL } from 'drizzle-orm';
import { db as rawDb, type Db } from './client';
import * as schema from './schema/index';

/**
 * scopedDb(organizationId)
 *
 * Returns a thin wrapper that auto-applies `organizationId = ?` to all business-table
 * queries. Per checklist §三 (red lines): business code MUST use scopedDb; raw `db`
 * is forbidden outside packages/db, packages/auth, and apps/backend/src/worker.ts.
 *
 * Inserts also auto-stamp organizationId.
 */
export function scopedDb(organizationId: string) {
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('scopedDb requires a non-empty organizationId');
  }

  return {
    organizationId,
    raw: rawDb,

    students: tableScope(rawDb, schema.students, organizationId),
    examPapers: tableScope(rawDb, schema.examPapers, organizationId),
    gradingRecords: tableScope(rawDb, schema.gradingRecords, organizationId),
    mistakeCollection: tableScope(rawDb, schema.mistakeCollection, organizationId),
    monthlyQuotas: tableScope(rawDb, schema.monthlyQuotas, organizationId),
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;

function tableScope(db: Db, tableArg: unknown, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = tableArg as any;
  // We don't try to be a full Drizzle proxy; we expose the most-used patterns and
  // require callers to use `where(orgScope(table))` when composing custom queries.
  return {
    table,
    orgScope: (extra?: SQL) =>
      extra ? and(eq(table.organizationId, organizationId), extra)! : eq(table.organizationId, organizationId),
    findMany: async (where?: SQL) =>
      db
        .select()
        .from(table)
        .where(where ? and(eq(table.organizationId, organizationId), where) : eq(table.organizationId, organizationId)),
    findOne: async (id: string) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.organizationId, organizationId), eq(table.id, id))!)
        .limit(1);
      return rows[0] ?? null;
    },
    insert: async (values: Record<string, unknown>) => {
      const row = { ...values, organizationId };
      const result = await db.insert(table).values(row).returning();
      return result[0];
    },
    update: async (id: string, values: Record<string, unknown>) => {
      const { organizationId: _drop, ...rest } = values;
      void _drop;
      const result = await db
        .update(table)
        .set(rest)
        .where(and(eq(table.organizationId, organizationId), eq(table.id, id))!)
        .returning();
      return result[0] ?? null;
    },
    delete: async (id: string) => {
      const result = await db
        .delete(table)
        .where(and(eq(table.organizationId, organizationId), eq(table.id, id))!)
        .returning();
      return result[0] ?? null;
    },
  };
}
