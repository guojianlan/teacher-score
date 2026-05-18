import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { sendJob, JOB_GENERATE_PDF, type GeneratePdfPayload } from '../boss';
import { renderGradingReport } from '@teacher-score/pdf';
import type { QuestionResult, Subject } from '@teacher-score/types';

export const pdfRoute = new Hono();

// 异步：入队后台 worker（持久化存到 storage）
pdfRoute.post('/grading/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  if (rows[0]!.status !== 'completed') return c.json({ error: 'not_completed' }, 400);

  const payload: GeneratePdfPayload = {
    organizationId: orgId,
    kind: 'grading-report',
    gradingId: id,
  };
  await sendJob(JOB_GENERATE_PDF, payload);
  return c.json({ ok: true }, 202);
});

/**
 * 同步：直接渲染流式返回（P2D 一键导）
 * 不入 queue，不持久化。GET 端点便于浏览器直接打开 / 下载。
 *
 * URL: /api/pdf/grading/:id?download=1
 */
pdfRoute.get('/grading/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  const r = rows[0]!;
  if (r.status !== 'completed') return c.json({ error: 'not_completed' }, 400);

  const students = await db
    .select({ name: schema.students.name })
    .from(schema.students)
    .where(and(eq(schema.students.id, r.studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);

  const out = await renderGradingReport({
    studentName: students[0]?.name ?? '[学生]',
    subject: r.subject as Subject,
    totalScore: r.totalScore ?? 0,
    maxScore: r.maxScore ?? 0,
    overallComment: r.overallComment ?? '',
    createdAt: (r.completedAt ?? r.createdAt).toISOString(),
    results: (r.results as QuestionResult[] | null) ?? [],
  });

  const download = new URL(c.req.url).searchParams.get('download') === '1';
  const safeName = (students[0]?.name ?? id).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50);
  const filename = `${safeName}-报告.${out.extension}`;
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`;

  return new Response(out.body as unknown as BodyInit, {
    headers: {
      'Content-Type': out.contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
    },
  });
});
