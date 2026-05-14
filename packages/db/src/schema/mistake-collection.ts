import { pgTable, text, timestamp, integer, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { students } from './students';
import { gradingRecords } from './grading-records';

// Per checklist §六.13: 错题自动归集 — questionHash de-duplicates same mistake across attempts.

export const mistakeCollection = pgTable(
  'mistake_collection',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    questionHash: text('question_hash').notNull(),
    questionStem: text('question_stem').notNull(),
    correctAnswer: text('correct_answer'),
    knowledgeTags: text('knowledge_tags').array().notNull().default([]),
    occurrences: integer('occurrences').notNull().default(1),
    lastWrongAnswer: text('last_wrong_answer'),
    lastGradingId: text('last_grading_id').references(() => gradingRecords.id, {
      onDelete: 'set null',
    }),
    mastered: boolean('mastered').notNull().default(false),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('mistake_collection_org_idx').on(t.organizationId),
    orgStudentIdx: index('mistake_collection_org_student_idx').on(t.organizationId, t.studentId),
    orgSubjectIdx: index('mistake_collection_org_subject_idx').on(t.organizationId, t.subject),
    uniqueQuestion: unique('mistake_collection_unique').on(
      t.organizationId,
      t.studentId,
      t.questionHash,
    ),
  }),
);
