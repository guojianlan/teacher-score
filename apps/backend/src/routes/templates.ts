import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { SUBJECTS } from '@teacher-score/types';
import type {
  AnswerSheet, SheetLayoutSpec, SheetQuestion,
} from '@teacher-score/types';
import { renderAnswerSheet } from '@teacher-score/pdf';
import { capture } from '@teacher-score/analytics';

export const templatesRoute = new Hono();

// SheetLayoutSpec 校验（与 packages/types/src/answer-sheet.ts 对齐）
const layoutSchema = z.object({
  mcqColumns: z.number().int().min(1).max(6).default(3),
  pageSize: z.enum(['A4', 'A3']).default('A4'),
  headerFields: z.array(z.enum(['name', 'examId', 'class', 'date'])).default(['name', 'examId']),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.enum(SUBJECTS),
  grade: z.string().optional(),
  totalScore: z.number().int().min(1).max(1000).default(100),
  questions: z.array(z.unknown()).default([]),
  // null = 旧扁平模板；object = 新嵌套答题卡
  layout: layoutSchema.nullable().optional(),
  sourceKey: z.string().optional(),
  fromGradingId: z.string().optional(),
});

const patchSchema = createSchema.partial();

templatesRoute.get('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const search = new URL(c.req.url).searchParams;
  const subject = search.get('subject');
  const where = [eq(schema.examPapers.organizationId, orgId)];
  if (subject) where.push(eq(schema.examPapers.subject, subject));

  const rows = await db
    .select()
    .from(schema.examPapers)
    .where(and(...where))
    .orderBy(desc(schema.examPapers.createdAt))
    .limit(200);
  return c.json({ templates: rows });
});

templatesRoute.post('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  const session = c.get('session');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  let questions = parsed.data.questions;

  // If fromGradingId is provided, derive questions from that grading record.
  if (parsed.data.fromGradingId) {
    const records = await db
      .select()
      .from(schema.gradingRecords)
      .where(
        and(
          eq(schema.gradingRecords.id, parsed.data.fromGradingId),
          eq(schema.gradingRecords.organizationId, orgId),
        ),
      )
      .limit(1);
    if (records.length === 0) return c.json({ error: 'grading_not_found' }, 404);
    const r = records[0]!;
    const results = (r.results as Array<Record<string, unknown>> | null) ?? [];
    questions = results.map((q) => ({
      no: q.no,
      type: q.type,
      stem: q.stem,
      correctAnswer: q.correctAnswer,
      maxScore: q.maxScore,
      knowledgeTags: q.knowledgeTags ?? [],
    }));
  }

  const id = `tpl_${ulid()}`;
  const inserted = await db
    .insert(schema.examPapers)
    .values({
      id,
      organizationId: orgId,
      name: parsed.data.name,
      subject: parsed.data.subject,
      grade: parsed.data.grade ?? null,
      totalScore: parsed.data.totalScore,
      questions: questions as unknown as object,
      layout: (parsed.data.layout ?? null) as unknown as object | null,
      sourceKey: parsed.data.sourceKey ?? null,
    })
    .returning();

  if (session) {
    capture({
      distinctId: session.userId,
      organizationId: orgId,
      event: 'template_created',
      properties: { templateId: id, subject: parsed.data.subject, fromGrading: !!parsed.data.fromGradingId },
    }).catch(() => undefined);
  }

  return c.json({ template: inserted[0] }, 201);
});

templatesRoute.get('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const rows = await db
    .select()
    .from(schema.examPapers)
    .where(and(eq(schema.examPapers.id, id), eq(schema.examPapers.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ template: rows[0] });
});

templatesRoute.patch('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);

  const updated = await db
    .update(schema.examPapers)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.grade !== undefined ? { grade: parsed.data.grade ?? null } : {}),
      ...(parsed.data.totalScore !== undefined ? { totalScore: parsed.data.totalScore } : {}),
      ...(parsed.data.questions !== undefined
        ? { questions: parsed.data.questions as unknown as object }
        : {}),
      ...(parsed.data.layout !== undefined
        ? { layout: parsed.data.layout as unknown as object | null }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.examPapers.id, id), eq(schema.examPapers.organizationId, orgId)))
    .returning();

  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ template: updated[0] });
});

/**
 * GET /:id/pdf — 渲染答题卡为可打印 PDF（puppeteer 可用时）或 HTML 回退。
 * Content-Disposition: inline → 浏览器打开预览；前端可加 ?download=1 强制下载。
 */
templatesRoute.get('/:id/pdf', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const rows = await db
    .select()
    .from(schema.examPapers)
    .where(and(eq(schema.examPapers.id, id), eq(schema.examPapers.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  const r = rows[0]!;

  if (!r.layout) {
    return c.json({ error: 'no_layout', message: '此模板未带 layout（旧扁平模板）' }, 400);
  }

  const out = await renderAnswerSheet({
    sheet: {
      name: r.name,
      subject: r.subject as AnswerSheet['subject'],
      grade: r.grade,
      totalScore: r.totalScore,
      questions: (r.questions as unknown as SheetQuestion[]) ?? [],
      layout: r.layout as unknown as SheetLayoutSpec,
    },
  });

  const download = new URL(c.req.url).searchParams.get('download') === '1';
  const safeName = r.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50);
  const filename = `${safeName}.${out.extension}`;
  // RFC 5987 + 兼容 fallback
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`;

  return new Response(out.body as unknown as BodyInit, {
    headers: {
      'Content-Type': out.contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
    },
  });
});

templatesRoute.delete('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const result = await db
    .delete(schema.examPapers)
    .where(and(eq(schema.examPapers.id, id), eq(schema.examPapers.organizationId, orgId)))
    .returning();
  if (result.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
