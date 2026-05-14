import {
  getBoss,
  JOB_GRADE_EXAM,
  JOB_GENERATE_PDF,
  type GeneratePdfPayload,
  type GradeExamPayload,
} from './boss';
import { gradeExamJobHandler, generatePdfJobHandler } from '@teacher-score/jobs';
import { createLogger, initSentry, captureError } from '@teacher-score/logger';

// Per checklist §三: worker.ts is the ONLY entrypoint that calls boss.start()
// AND registers worker handlers.

const log = createLogger({ scope: 'worker' });

async function main() {
  await initSentry();
  const boss = getBoss();
  await boss.start();
  // pg-boss v10: queues must exist before .work() / .send()
  for (const q of [JOB_GRADE_EXAM, JOB_GENERATE_PDF]) {
    try {
      await boss.createQueue(q);
    } catch (err) {
      if (!String((err as Error).message).match(/already exists/i)) throw err;
    }
  }
  log.info('worker pg-boss started');

  const teamSize = Number(process.env.WORKER_TEAM_SIZE ?? 2);

  await boss.work<GradeExamPayload>(
    JOB_GRADE_EXAM,
    { batchSize: teamSize },
    async (jobs) => {
      const jobArr = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of jobArr) {
        try {
          await gradeExamJobHandler(job.data, { log: log.child({ jobId: job.id }) });
        } catch (err) {
          captureError(err, { jobId: job.id, jobName: JOB_GRADE_EXAM, gradingId: job.data.gradingId });
          throw err;
        }
      }
    },
  );

  await boss.work<GeneratePdfPayload>(JOB_GENERATE_PDF, { batchSize: 1 }, async (jobs) => {
    const jobArr = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobArr) {
      try {
        await generatePdfJobHandler(job.data, { log: log.child({ jobId: job.id }) });
      } catch (err) {
        captureError(err, { jobId: job.id, jobName: JOB_GENERATE_PDF });
        throw err;
      }
    }
  });

  function shutdown(signal: string) {
    log.info({ signal }, 'worker shutting down');
    boss
      .stop({ graceful: true, timeout: 30_000, wait: true })
      .then(() => process.exit(0))
      .catch((err) => {
        log.error({ err }, 'graceful stop failed');
        process.exit(1);
      });
    setTimeout(() => process.exit(1), 35_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
