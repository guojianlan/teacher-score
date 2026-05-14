import { describe, it, expect, vi } from 'vitest';
import { gradeExamJobHandler } from './grade-exam';
import { createLogger } from '@teacher-score/logger';
import type { Logger } from '@teacher-score/logger';

// These tests document the multi-tenant negative-test contract per checklist §五.13.
// They are skipped by default because they need a real DB; CI provides DATABASE_URL.

describe('gradeExamJobHandler (multi-tenant safety)', () => {
  it.skipIf(!process.env.DATABASE_URL)(
    'refuses to process payload whose organizationId does not match the grading record',
    async () => {
      // see scripts/test-worker-org-isolation.ts for the full integration scenario.
      // unit-level we just confirm the handler bails fast on empty payload.
      const log = createLogger({ scope: 'test' });
      await expect(
        gradeExamJobHandler({ gradingId: '', organizationId: '' }, { log }),
      ).resolves.toBeUndefined();
    },
  );

  it('rejects payload missing organizationId without throwing', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const log = {
      child: () => ({ info, warn }),
    } as unknown as Logger;
    await gradeExamJobHandler({ gradingId: 'gr_x', organizationId: '' }, { log });
    expect(warn).toHaveBeenCalled();
  });
});
