import { and, eq, sql } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { gradeExam, type GradeExamResult } from '@teacher-score/ai';
import { createStorageProvider, assertKeyBelongsToOrg } from '@teacher-score/storage';
import { capture as captureAnalytics } from '@teacher-score/analytics';
import { createHash } from 'node:crypto';
import type { Logger } from '@teacher-score/logger';
import type { QuestionResult, Subject } from '@teacher-score/types';

export interface GradeExamPayload {
  gradingId: string;
  organizationId: string;
  attempt?: number;
}

export interface GradeJobContext {
  log: Logger;
}

const MAX_ATTEMPTS = 3;
const COST_CENTS_LIMIT = Number(process.env.LLM_COST_CENTS_LIMIT ?? 20); // $0.20
const TOKEN_LIMIT = Number(process.env.LLM_TOKEN_LIMIT ?? 8000);

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hashQuestion(subject: string, stem: string): string {
  return createHash('sha256').update(`${subject}::${stem.trim()}`).digest('hex').slice(0, 32);
}

/**
 * grade-exam worker. Per checklist §三 red lines:
 *   - MUST read grading_records by both id AND organizationId.
 *   - MUST reject mismatched payload (record stays pending).
 *   - On success: write results, totals, tokens, cost, duration; decrement quota;
 *     auto-collect mistakes; mark completed.
 *   - On failure: write failed status + error code; honour retryable flag (≤ 3).
 */
export async function gradeExamJobHandler(
  payload: GradeExamPayload,
  ctx: GradeJobContext,
): Promise<void> {
  const log = ctx.log.child({ gradingId: payload.gradingId, orgId: payload.organizationId });
  log.info('grade-exam start');

  if (!payload.gradingId || !payload.organizationId) {
    log.warn('rejecting payload missing id/org');
    return;
  }

  // (1) double-check the grading record matches the payload org. Mismatch => bail without modifying.
  const records = await db
    .select()
    .from(schema.gradingRecords)
    .where(
      and(
        eq(schema.gradingRecords.id, payload.gradingId),
        eq(schema.gradingRecords.organizationId, payload.organizationId),
      ),
    )
    .limit(1);

  const record = records[0];
  if (!record) {
    log.warn('grading record not found OR org mismatch — refusing to process');
    return;
  }
  if (record.status === 'completed') {
    log.info('record already completed; idempotent skip');
    return;
  }

  await db
    .update(schema.gradingRecords)
    .set({
      status: 'recognizing',
      progress: 'recognizing',
      updatedAt: new Date(),
      attempts: (record.attempts ?? 0) + 1,
    })
    .where(
      and(
        eq(schema.gradingRecords.id, record.id),
        eq(schema.gradingRecords.organizationId, payload.organizationId),
      ),
    );

  // (2) load image bytes; reject any key that does not belong to this org.
  const storage = createStorageProvider();
  const imageKeys = record.imageKeys ?? [];
  for (const k of imageKeys) {
    try {
      assertKeyBelongsToOrg(k, payload.organizationId);
    } catch {
      await markFailed(
        record.id,
        payload.organizationId,
        'storage_forbidden',
        'image key does not belong to organization',
        false,
      );
      return;
    }
  }

  const imageBuffers: { buf: Buffer; contentType: string }[] = [];
  for (const k of imageKeys) {
    const f = await storage.get(k);
    if (!f) {
      await markFailed(
        record.id,
        payload.organizationId,
        'image_missing',
        `image not found: ${k}`,
        false,
      );
      return;
    }
    imageBuffers.push({ buf: f.body, contentType: f.contentType });
  }

  // (3) call AI (may be mocked when AI_API_KEY is not set; see @teacher-score/ai).
  await db
    .update(schema.gradingRecords)
    .set({ status: 'scoring', progress: 'scoring', updatedAt: new Date() })
    .where(
      and(
        eq(schema.gradingRecords.id, record.id),
        eq(schema.gradingRecords.organizationId, payload.organizationId),
      ),
    );

  // Optional: load template for reuse path (§九.4)
  let template:
    | { questions: Array<{ no: string; type: string; stem: string; correctAnswer: string | null; maxScore: number; knowledgeTags?: string[] }> }
    | undefined;
  if (record.examPaperId) {
    const tpl = await db
      .select()
      .from(schema.examPapers)
      .where(
        and(
          eq(schema.examPapers.id, record.examPaperId),
          eq(schema.examPapers.organizationId, payload.organizationId),
        ),
      )
      .limit(1);
    if (tpl[0]) {
      template = {
        questions: (tpl[0].questions as Array<{
          no: string;
          type: string;
          stem: string;
          correctAnswer: string | null;
          maxScore: number;
          knowledgeTags?: string[];
        }> | null) ?? [],
      };
    }
  }

  const started = Date.now();
  let result: GradeExamResult;
  try {
    result = await gradeExam({
      subject: record.subject as Subject,
      images: imageBuffers,
      ...(template ? { template } : {}),
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; retryable?: boolean };
    const retryable = e.retryable !== false;
    const attempt = (record.attempts ?? 0) + 1;
    if (retryable && attempt < MAX_ATTEMPTS) {
      // leave status as 'scoring' and re-throw; pg-boss will retry per its config.
      log.warn({ err: e.message, attempt }, 'llm call failed, will retry');
      throw err;
    }
    await markFailed(
      record.id,
      payload.organizationId,
      e.code ?? 'llm_error',
      e.message ?? 'LLM call failed',
      retryable,
    );
    return;
  }

  // (4) cost circuit breaker (§六.8).
  if (result.tokensUsed > TOKEN_LIMIT || result.costCents > COST_CENTS_LIMIT) {
    await markFailed(
      record.id,
      payload.organizationId,
      'cost_circuit_breaker',
      `tokens=${result.tokensUsed} cost=${result.costCents}c exceeded limits`,
      false,
    );
    return;
  }

  // (5) finalize.
  await db
    .update(schema.gradingRecords)
    .set({
      status: 'completed',
      progress: 'finalizing',
      results: result.results as unknown as object,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      overallComment: result.overallComment,
      llmRawOutput: result.raw as unknown as object,
      tokensUsed: result.tokensUsed,
      costCents: result.costCents,
      durationMs: Date.now() - started,
      model: result.model,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.gradingRecords.id, record.id),
        eq(schema.gradingRecords.organizationId, payload.organizationId),
      ),
    );

  // (6) monthly quota usage (§四.8).
  const ym = currentYearMonth();
  await db
    .insert(schema.monthlyQuotas)
    .values({
      organizationId: payload.organizationId,
      yearMonth: ym,
      gradingsUsed: 1,
      tokensUsed: result.tokensUsed,
      costCents: result.costCents,
    })
    .onConflictDoUpdate({
      target: [schema.monthlyQuotas.organizationId, schema.monthlyQuotas.yearMonth],
      set: {
        gradingsUsed: sql`${schema.monthlyQuotas.gradingsUsed} + 1`,
        tokensUsed: sql`${schema.monthlyQuotas.tokensUsed} + ${result.tokensUsed}`,
        costCents: sql`${schema.monthlyQuotas.costCents} + ${result.costCents}`,
        updatedAt: new Date(),
      },
    });

  // analytics: grading_completed
  captureAnalytics({
    distinctId: record.studentId, // user id not available inside worker — use student as fallback
    organizationId: payload.organizationId,
    event: 'grading_completed',
    properties: {
      gradingId: record.id,
      subject: record.subject,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      tokensUsed: result.tokensUsed,
      costCents: result.costCents,
      model: result.model,
    },
  }).catch(() => undefined);

  // (7) auto-collect mistakes (§六.13).
  await collectMistakes({
    organizationId: payload.organizationId,
    studentId: record.studentId,
    subject: record.subject,
    gradingId: record.id,
    results: result.results,
  });

  log.info({ totalScore: result.totalScore, durationMs: Date.now() - started }, 'grade-exam done');
}

async function markFailed(
  gradingId: string,
  organizationId: string,
  code: string,
  message: string,
  retryable: boolean,
) {
  await db
    .update(schema.gradingRecords)
    .set({
      status: 'failed',
      errorCode: code,
      errorMessage: message,
      retryable,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.gradingRecords.id, gradingId),
        eq(schema.gradingRecords.organizationId, organizationId),
      ),
    );
}

async function collectMistakes(opts: {
  organizationId: string;
  studentId: string;
  subject: string;
  gradingId: string;
  results: QuestionResult[];
}) {
  for (const q of opts.results) {
    if (q.isCorrect) continue;
    const hash = hashQuestion(opts.subject, q.stem);
    await db
      .insert(schema.mistakeCollection)
      .values({
        id: `mc_${hash}_${opts.studentId}`.slice(0, 60),
        organizationId: opts.organizationId,
        studentId: opts.studentId,
        subject: opts.subject,
        questionHash: hash,
        questionStem: q.stem,
        correctAnswer: q.correctAnswer,
        knowledgeTags: q.knowledgeTags ?? [],
        occurrences: 1,
        lastWrongAnswer: q.studentAnswer,
        lastGradingId: opts.gradingId,
      })
      .onConflictDoUpdate({
        target: [
          schema.mistakeCollection.organizationId,
          schema.mistakeCollection.studentId,
          schema.mistakeCollection.questionHash,
        ],
        set: {
          occurrences: sql`${schema.mistakeCollection.occurrences} + 1`,
          lastWrongAnswer: q.studentAnswer,
          lastGradingId: opts.gradingId,
          lastSeenAt: new Date(),
        },
      });
  }
}
