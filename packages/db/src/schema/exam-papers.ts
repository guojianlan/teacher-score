import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// exam_papers stores reusable templates: parsed questions + correct answers + knowledge tags.
// Per PRODUCT.md: 渐进沉淀 — first capture is direct, then one-click promotion to template.

export const examPapers = pgTable(
  'exam_papers',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    grade: text('grade'),
    totalScore: integer('total_score').notNull().default(100),
    // Parsed questions structure (Question[] from @teacher-score/types)
    questions: jsonb('questions').notNull().default([]),
    sourceKey: text('source_key'), // storage key of source image
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('exam_papers_org_idx').on(t.organizationId),
    orgSubjectIdx: index('exam_papers_org_subject_idx').on(t.organizationId, t.subject),
  }),
);
