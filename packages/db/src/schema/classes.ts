import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// classes 表 —— 班级实体
// 设计取舍：studentIds 存 JSON 数组（一个班通常 < 100 学生，多对多表过度工程）。
// 后续需要班主任视角 / 学生在多班时再升级为 class_members 关联表。

export const classes = pgTable(
  'classes',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),          // "初二 (3) 班"
    grade: text('grade'),                  // "初二"
    studentIds: jsonb('student_ids').notNull().default([]),  // string[]
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('classes_org_idx').on(t.organizationId),
  }),
);
