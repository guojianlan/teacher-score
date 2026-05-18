/**
 * 知识点热力图（P2B · Phase 2）
 *
 * 数据源：mistake_collection（错题已自动入库 + tags）
 * 输出：knowledgeTag → { studentCount, totalOccurrences, masteredCount }
 *
 * 维度：
 *   GET /students/:id  → 单学生 weak spots
 *   GET /classes/:id   → 班级 common gaps
 */
import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

export const heatmapRoute = new Hono();

interface TagBucket {
  tag: string;
  totalOccurrences: number;
  questionCount: number;
  masteredCount: number;
  studentCount: number;     // 唯一学生数
}

function aggregateByTag(rows: Array<{
  studentId: string; questionHash: string; knowledgeTags: string[];
  occurrences: number; mastered: boolean;
}>): TagBucket[] {
  const map: Record<string, {
    occ: number;
    questions: Set<string>;
    students: Set<string>;
    mastered: number;
  }> = {};
  for (const r of rows) {
    const tags = r.knowledgeTags.length > 0 ? r.knowledgeTags : ['(无标签)'];
    for (const t of tags) {
      const b = (map[t] ??= { occ: 0, questions: new Set(), students: new Set(), mastered: 0 });
      b.occ += r.occurrences;
      b.questions.add(r.questionHash);
      b.students.add(r.studentId);
      if (r.mastered) b.mastered++;
    }
  }
  return Object.entries(map)
    .map(([tag, b]) => ({
      tag,
      totalOccurrences: b.occ,
      questionCount: b.questions.size,
      studentCount: b.students.size,
      masteredCount: b.mastered,
    }))
    .sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

/** 单学生热力图 */
heatmapRoute.get('/students/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const studentId = c.req.param('id');

  const rows = await db
    .select({
      studentId: schema.mistakeCollection.studentId,
      questionHash: schema.mistakeCollection.questionHash,
      knowledgeTags: schema.mistakeCollection.knowledgeTags,
      occurrences: schema.mistakeCollection.occurrences,
      mastered: schema.mistakeCollection.mastered,
    })
    .from(schema.mistakeCollection)
    .where(
      and(
        eq(schema.mistakeCollection.organizationId, orgId),
        eq(schema.mistakeCollection.studentId, studentId),
      ),
    );

  const studRows = await db
    .select({ id: schema.students.id, name: schema.students.name })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);

  return c.json({
    student: studRows[0] ?? null,
    buckets: aggregateByTag(rows),
    totalQuestions: rows.length,
  });
});

/** 班级热力图：班内所有学生的错题归集后按 tag 聚合 */
heatmapRoute.get('/classes/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const classId = c.req.param('id');

  const classRows = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.organizationId, orgId)))
    .limit(1);
  if (classRows.length === 0) return c.json({ error: 'not_found' }, 404);
  const klass = classRows[0]!;
  const studentIds = (klass.studentIds as unknown as string[]) ?? [];
  if (studentIds.length === 0) {
    return c.json({ class: { id: klass.id, name: klass.name }, buckets: [], totalQuestions: 0 });
  }

  const rows = await db
    .select({
      studentId: schema.mistakeCollection.studentId,
      questionHash: schema.mistakeCollection.questionHash,
      knowledgeTags: schema.mistakeCollection.knowledgeTags,
      occurrences: schema.mistakeCollection.occurrences,
      mastered: schema.mistakeCollection.mastered,
    })
    .from(schema.mistakeCollection)
    .where(
      and(
        eq(schema.mistakeCollection.organizationId, orgId),
        inArray(schema.mistakeCollection.studentId, studentIds),
      ),
    );

  return c.json({
    class: { id: klass.id, name: klass.name, studentCount: studentIds.length },
    buckets: aggregateByTag(rows),
    totalQuestions: rows.length,
  });
});
