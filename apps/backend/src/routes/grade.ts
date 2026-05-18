import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { SUBJECTS } from '@teacher-score/types';
import { assertKeyBelongsToOrg } from '@teacher-score/storage';
import { sendJob, JOB_GRADE_EXAM, type GradeExamPayload } from '../boss';
import { quotaMiddleware } from '../middleware/quota';
import { consumeCustom } from '../middleware/rate-limit';
import { capture } from '@teacher-score/analytics';

export const gradeRoute = new Hono();

const createSchema = z.object({
  studentId: z.string().min(1),
  subject: z.enum(SUBJECTS),
  imageKeys: z.array(z.string().min(1)).min(1).max(10),
  examPaperId: z.string().optional(),
});

// LLM-specific limits (§六.9): 10/min/user, 100/day/user
gradeRoute.post('/', quotaMiddleware, async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);

  if (!consumeCustom(`grade:min:${session.userId}`, 10, 60_000)) {
    return c.json({ error: 'rate_limited', scope: 'llm_minute' }, 429);
  }
  if (!consumeCustom(`grade:day:${session.userId}`, 100, 24 * 60 * 60_000)) {
    return c.json({ error: 'rate_limited', scope: 'llm_day' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  // Verify all image keys belong to this org (defence-in-depth).
  for (const k of parsed.data.imageKeys) {
    try {
      assertKeyBelongsToOrg(k, orgId);
    } catch {
      return c.json({ error: 'forbidden', message: 'image key does not belong to org' }, 403);
    }
  }

  // Verify student belongs to this org (§五.9 acceptance).
  const student = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.id, parsed.data.studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);
  if (student.length === 0) {
    return c.json({ error: 'student_not_found' }, 404);
  }

  const gradingId = `gr_${ulid()}`;
  await db.insert(schema.gradingRecords).values({
    id: gradingId,
    organizationId: orgId,
    studentId: parsed.data.studentId,
    examPaperId: parsed.data.examPaperId ?? null,
    subject: parsed.data.subject,
    status: 'pending',
    progress: 'queued',
    imageKeys: parsed.data.imageKeys,
  });

  const payload: GradeExamPayload = { gradingId, organizationId: orgId };
  await sendJob(JOB_GRADE_EXAM, payload);

  capture({
    distinctId: session.userId,
    organizationId: orgId,
    event: 'grading_started',
    properties: { gradingId, subject: parsed.data.subject, imageCount: parsed.data.imageKeys.length },
  }).catch(() => undefined);

  return c.json({ gradingId, status: 'pending' }, 202);
});

/**
 * POST /batch — 批量分发
 * 给一个班级中的每位学生分配一张图片，全部用同一份模板 + gradingRunId 入队。
 * 前端传：{ examPaperId, classId, assignments: [{ studentId, imageKey }] }
 */
const batchSchema = z.object({
  examPaperId: z.string().min(1),
  classId: z.string().min(1),
  assignments: z.array(z.object({
    studentId: z.string().min(1),
    imageKey: z.string().min(1),
  })).min(1).max(80),
});

gradeRoute.post('/batch', quotaMiddleware, async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);

  if (!consumeCustom(`grade:batch:${session.userId}`, 5, 60_000)) {
    return c.json({ error: 'rate_limited', scope: 'batch_minute' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  // 验证 image keys 属于本 org
  for (const a of parsed.data.assignments) {
    try { assertKeyBelongsToOrg(a.imageKey, orgId); }
    catch { return c.json({ error: 'forbidden', message: `imageKey ${a.imageKey}` }, 403); }
  }

  // 验证 examPaper 属于本 org
  const tplRows = await db.select().from(schema.examPapers)
    .where(and(eq(schema.examPapers.id, parsed.data.examPaperId), eq(schema.examPapers.organizationId, orgId)))
    .limit(1);
  if (tplRows.length === 0) return c.json({ error: 'template_not_found' }, 404);
  const tpl = tplRows[0]!;

  // 验证 class 属于本 org
  const classRows = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.id, parsed.data.classId), eq(schema.classes.organizationId, orgId)))
    .limit(1);
  if (classRows.length === 0) return c.json({ error: 'class_not_found' }, 404);

  const runId = `run_${ulid()}`;
  const gradingIds: string[] = [];

  // 批量 insert
  const rows = parsed.data.assignments.map((a) => {
    const id = `gr_${ulid()}`;
    gradingIds.push(id);
    return {
      id,
      organizationId: orgId,
      studentId: a.studentId,
      examPaperId: parsed.data.examPaperId,
      gradingRunId: runId,
      subject: tpl.subject,
      status: 'pending' as const,
      progress: 'queued' as const,
      imageKeys: [a.imageKey],
    };
  });
  await db.insert(schema.gradingRecords).values(rows);

  // 全部入队
  for (const gradingId of gradingIds) {
    const payload: GradeExamPayload = { gradingId, organizationId: orgId };
    await sendJob(JOB_GRADE_EXAM, payload).catch((err) => {
      console.error(`enqueue failed for ${gradingId}:`, err);
    });
  }

  capture({
    distinctId: session.userId,
    organizationId: orgId,
    event: 'grading_started',
    properties: { batch: true, runId, count: gradingIds.length, examPaperId: parsed.data.examPaperId, classId: parsed.data.classId },
  }).catch(() => undefined);

  return c.json({ runId, gradingIds, count: gradingIds.length }, 202);
});

/**
 * GET /runs/:id — 聚合页查询（D13）
 * 返回某个 gradingRunId 下所有记录 + 关联学生 + 模板信息
 */
gradeRoute.get('/runs/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const runId = c.req.param('id');
  const rows = await db
    .select({
      gradingId: schema.gradingRecords.id,
      studentId: schema.gradingRecords.studentId,
      examPaperId: schema.gradingRecords.examPaperId,
      status: schema.gradingRecords.status,
      progress: schema.gradingRecords.progress,
      totalScore: schema.gradingRecords.totalScore,
      maxScore: schema.gradingRecords.maxScore,
      results: schema.gradingRecords.results,
      errorMessage: schema.gradingRecords.errorMessage,
      createdAt: schema.gradingRecords.createdAt,
      completedAt: schema.gradingRecords.completedAt,
    })
    .from(schema.gradingRecords)
    .where(and(
      eq(schema.gradingRecords.gradingRunId, runId),
      eq(schema.gradingRecords.organizationId, orgId),
    ))
    .orderBy(desc(schema.gradingRecords.createdAt));
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);

  // 一次性带回学生 + 模板 名字
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const examIds = [...new Set(rows.map((r) => r.examPaperId).filter(Boolean) as string[])];
  const [studs, tpls] = await Promise.all([
    db.select({ id: schema.students.id, name: schema.students.name })
      .from(schema.students)
      .where(eq(schema.students.organizationId, orgId)),
    examIds.length > 0
      ? db.select({ id: schema.examPapers.id, name: schema.examPapers.name, totalScore: schema.examPapers.totalScore })
          .from(schema.examPapers)
          .where(eq(schema.examPapers.organizationId, orgId))
      : Promise.resolve([] as Array<{ id: string; name: string; totalScore: number }>),
  ]);
  const studById: Record<string, string> = {};
  studs.forEach((s) => { studById[s.id] = s.name; });
  const tplById: Record<string, { name: string; totalScore: number }> = {};
  tpls.forEach((t) => { tplById[t.id] = { name: t.name, totalScore: t.totalScore }; });

  return c.json({
    runId,
    template: rows[0]?.examPaperId ? tplById[rows[0].examPaperId] : null,
    records: rows.map((r) => ({
      ...r,
      studentName: studById[r.studentId] ?? r.studentId.slice(-6),
    })),
  });
});

gradeRoute.get('/history', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const rows = await db
    .select({
      id: schema.gradingRecords.id,
      subject: schema.gradingRecords.subject,
      status: schema.gradingRecords.status,
      totalScore: schema.gradingRecords.totalScore,
      maxScore: schema.gradingRecords.maxScore,
      createdAt: schema.gradingRecords.createdAt,
    })
    .from(schema.gradingRecords)
    .where(eq(schema.gradingRecords.organizationId, orgId))
    .orderBy(desc(schema.gradingRecords.createdAt))
    .limit(100);
  return c.json({ rows });
});

gradeRoute.post('/:id/retry', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const row = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (row.length === 0) return c.json({ error: 'not_found' }, 404);
  const r = row[0]!;
  if (r.status !== 'failed') return c.json({ error: 'not_failed' }, 400);
  await db
    .update(schema.gradingRecords)
    .set({
      status: 'pending',
      progress: 'queued',
      errorCode: null,
      errorMessage: null,
      retryable: null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)));
  await sendJob(JOB_GRADE_EXAM, { gradingId: id, organizationId: orgId });
  return c.json({ ok: true });
});

gradeRoute.get('/:id/status', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const row = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);

  if (row.length === 0) return c.json({ error: 'not_found' }, 404);
  const r = row[0]!;
  return c.json({
    gradingId: r.id,
    status: r.status,
    progress: r.progress ?? undefined,
    totalScore: r.totalScore ?? undefined,
    maxScore: r.maxScore ?? undefined,
    errorCode: r.errorCode ?? undefined,
    retryable: r.retryable ?? undefined,
  });
});

gradeRoute.get('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const row = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);

  if (row.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ grading: row[0] });
});

const overrideSchema = z.object({
  questionNo: z.string(),
  score: z.number().min(0),
  comment: z.string().optional(),
});

// Teacher manual score override (§六.12).
gradeRoute.post('/:id/override', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const body = await c.req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);

  const row = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (row.length === 0) return c.json({ error: 'not_found' }, 404);

  const record = row[0]!;
  const results = (record.results as Array<Record<string, unknown>> | null) ?? [];
  let newTotal = 0;
  const updated = results.map((q) => {
    if (q.no === parsed.data.questionNo) {
      const maxScore = Number(q.maxScore ?? 0);
      const score = Math.min(parsed.data.score, maxScore);
      const next = {
        ...q,
        score,
        comment: parsed.data.comment ?? q.comment,
        isCorrect: score === maxScore,
        teacherModified: true,
      };
      newTotal += score;
      return next;
    }
    newTotal += Number(q.score ?? 0);
    return q;
  });

  await db
    .update(schema.gradingRecords)
    .set({
      results: updated as unknown as object,
      totalScore: newTotal,
      teacherModified: true,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)));

  const session = c.get('session');
  if (session) {
    capture({
      distinctId: session.userId,
      organizationId: orgId,
      event: 'grading_score_modified',
      properties: { gradingId: id, questionNo: parsed.data.questionNo, newScore: parsed.data.score },
    }).catch(() => undefined);
  }

  return c.json({ ok: true, totalScore: newTotal });
});
