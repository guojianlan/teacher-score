import { pgTable, text, timestamp, integer, boolean, index, varchar } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const students = pgTable(
  'students',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    grade: text('grade'),
    subjects: text('subjects').array().notNull().default([]),
    notes: varchar('notes', { length: 5000 }),
    archived: boolean('archived').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('students_org_idx').on(t.organizationId),
    orgArchivedIdx: index('students_org_archived_idx').on(t.organizationId, t.archived),
    orgGradeIdx: index('students_org_grade_idx').on(t.organizationId, t.grade),
  }),
);
