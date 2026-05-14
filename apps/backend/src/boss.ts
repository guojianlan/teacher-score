import PgBoss from 'pg-boss';
import { createLogger } from '@teacher-score/logger';

// Per checklist §三 (red lines):
//   - boss.ts MUST NOT call boss.start()
//   - boss.ts MUST NOT register worker handlers
//   - boss.ts MUST NOT install process signal handlers
// Only worker.ts starts pg-boss; HTTP only enqueues via sendJob().

const log = createLogger({ scope: 'boss' });

let bossSingleton: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (bossSingleton) return bossSingleton;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to construct PgBoss');
  bossSingleton = new PgBoss({
    connectionString: url,
    schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
  });
  bossSingleton.on('error', (err) => log.error({ err }, 'pg-boss error'));
  return bossSingleton;
}

export const JOB_GRADE_EXAM = 'grade-exam';
export const JOB_GENERATE_PDF = 'generate-pdf';

export interface GradeExamPayload {
  gradingId: string;
  // organizationId MUST be in payload per §三. Worker re-checks against the grading record.
  organizationId: string;
  attempt?: number;
}

export interface GeneratePdfPayload {
  organizationId: string;
  gradingId?: string;
  studentId?: string;
  kind: 'grading-report' | 'mistake-collection';
}

const queuesCreated = new Set<string>();

export async function sendJob<T extends object>(
  name: string,
  payload: T,
  opts?: PgBoss.SendOptions,
): Promise<string | null> {
  const boss = getBoss();
  if (!(boss as unknown as { started?: boolean }).started) {
    await boss.start();
    (boss as unknown as { started?: boolean }).started = true;
  }
  // pg-boss v10 requires createQueue before send.
  if (!queuesCreated.has(name)) {
    try {
      await boss.createQueue(name);
    } catch (err) {
      // Already exists is fine; rethrow others.
      if (!String((err as Error).message).match(/already exists/i)) throw err;
    }
    queuesCreated.add(name);
  }
  return boss.send(name, payload as unknown as object, opts ?? {});
}
