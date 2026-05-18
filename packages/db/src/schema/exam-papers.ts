import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// exam_papers 既存"试卷模板"（旧）也存"答题卡定义"（新，schema 驱动 PDF+合成+批改）。
// - questions JSONB：可装旧 Question[]（扁平）或新 SheetQuestion[]（嵌套子问/空）。
//   新代码读 layout 不为 null 即可判定走新路径。
// - layout JSONB：仅新模型有，PDF 渲染 + 设计器布局参数。null = 旧模板。
// 详见 docs/claude/ROADMAP-2026-W20.md §2 Schema 设计。

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
    // 旧：Question[]；新：SheetQuestion[]（包含 subQuestions/blanks）
    questions: jsonb('questions').notNull().default([]),
    // 新增：SheetLayoutSpec | null —— null 表示旧扁平模板，非 null 表示新答题卡
    layout: jsonb('layout'),
    sourceKey: text('source_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('exam_papers_org_idx').on(t.organizationId),
    orgSubjectIdx: index('exam_papers_org_subject_idx').on(t.organizationId, t.subject),
  }),
);
