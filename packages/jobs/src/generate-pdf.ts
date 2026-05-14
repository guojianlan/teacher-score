import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { renderGradingReport } from '@teacher-score/pdf';
import { createStorageProvider, buildStorageKey, assertKeyBelongsToOrg } from '@teacher-score/storage';
import type { Logger } from '@teacher-score/logger';
import type { QuestionResult, Subject } from '@teacher-score/types';

export interface GeneratePdfPayload {
  organizationId: string;
  kind: 'grading-report' | 'mistake-collection';
  gradingId?: string;
  studentId?: string;
}

export interface GeneratePdfContext {
  log: Logger;
}

export async function generatePdfJobHandler(
  payload: GeneratePdfPayload,
  ctx: GeneratePdfContext,
): Promise<{ key: string } | null> {
  const log = ctx.log.child({ kind: payload.kind, orgId: payload.organizationId });
  if (!payload.organizationId) {
    log.warn('refusing payload without organizationId');
    return null;
  }

  if (payload.kind === 'grading-report') {
    if (!payload.gradingId) {
      log.warn('grading-report requires gradingId');
      return null;
    }
    const rows = await db
      .select()
      .from(schema.gradingRecords)
      .where(
        and(
          eq(schema.gradingRecords.id, payload.gradingId),
          eq(schema.gradingRecords.organizationId, payload.organizationId),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      log.warn('grading record not found / org mismatch');
      return null;
    }
    const record = rows[0]!;

    // ensure all image keys are within org bounds
    const imageKeys = record.imageKeys ?? [];
    for (const k of imageKeys) {
      try {
        assertKeyBelongsToOrg(k, payload.organizationId);
      } catch {
        log.warn({ key: k }, 'image key out of org bounds — refusing');
        return null;
      }
    }

    const students = await db
      .select({ name: schema.students.name })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, record.studentId),
          eq(schema.students.organizationId, payload.organizationId),
        ),
      )
      .limit(1);
    const studentName = students[0]?.name ?? '[学生]';

    const out = await renderGradingReport({
      studentName,
      subject: record.subject as Subject,
      totalScore: record.totalScore ?? 0,
      maxScore: record.maxScore ?? 0,
      overallComment: record.overallComment ?? '',
      createdAt: (record.completedAt ?? record.createdAt).toISOString(),
      results: (record.results as QuestionResult[] | null) ?? [],
      imageUrls: imageKeys.map((k) => `/api/upload/${encodeURIComponent(k)}`),
    });

    const storage = createStorageProvider();
    const key = buildStorageKey({
      organizationId: payload.organizationId,
      type: 'pdf-report',
      ext: out.extension,
    });
    await storage.put({ key, body: out.body, contentType: out.contentType });
    log.info({ key }, 'grading-report rendered');
    return { key };
  }

  log.warn('unsupported pdf kind for now');
  return null;
}
