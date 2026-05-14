import { pgTable, text, timestamp, integer, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { students } from './students';
import { examPapers } from './exam-papers';

export const gradingStatusValues = [
  'pending',
  'queued',
  'recognizing',
  'scoring',
  'finalizing',
  'completed',
  'failed',
] as const;
export type GradingRecordStatus = (typeof gradingStatusValues)[number];

export const gradingRecords = pgTable(
  'grading_records',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    examPaperId: text('exam_paper_id').references(() => examPapers.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    status: text('status', { enum: gradingStatusValues }).notNull().default('pending'),
    progress: text('progress', { enum: ['queued', 'recognizing', 'scoring', 'finalizing'] }),
    imageKeys: text('image_keys').array().notNull().default([]),
    // QuestionResult[]
    results: jsonb('results'),
    totalScore: integer('total_score'),
    maxScore: integer('max_score'),
    overallComment: text('overall_comment'),
    llmRawOutput: jsonb('llm_raw_output'),
    teacherModified: boolean('teacher_modified').notNull().default(false),
    // Cost / observability
    tokensUsed: integer('tokens_used'),
    costCents: integer('cost_cents'),
    durationMs: integer('duration_ms'),
    model: text('model'),
    // Failure
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    retryable: boolean('retryable'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('grading_records_org_idx').on(t.organizationId),
    orgStatusIdx: index('grading_records_org_status_idx').on(t.organizationId, t.status),
    orgStudentIdx: index('grading_records_org_student_idx').on(t.organizationId, t.studentId),
    orgCreatedIdx: index('grading_records_org_created_idx').on(t.organizationId, t.createdAt),
  }),
);
