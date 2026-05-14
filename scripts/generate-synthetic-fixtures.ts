#!/usr/bin/env tsx
/**
 * scripts/generate-synthetic-fixtures.ts
 *
 * Per checklist §六.1 / §七.1 / §八.1-3 each subject needs ≥ 20 real exam images.
 * Real images must come from teachers. Until they do, this script creates SYNTHETIC
 * fixtures so:
 *   - `scripts/accuracy-test.ts` can run end-to-end against the AI mock
 *   - CI smoke tests have non-empty data
 *   - the regression-gate plumbing is exercised
 *
 * Run: pnpm tsx scripts/generate-synthetic-fixtures.ts [--count 20]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SUBJECTS } from '@teacher-score/types';

const COUNT = (() => {
  const idx = process.argv.indexOf('--count');
  if (idx >= 0) return Number(process.argv[idx + 1]);
  return 20;
})();

const ROOT = path.resolve(process.cwd(), 'fixtures');

// 1x1 transparent PNG — the AI mock path doesn't look at pixels.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

const BANK: Record<(typeof SUBJECTS)[number], Array<{
  no: string;
  type: string;
  correctAnswer: string;
  maxScore: number;
  knowledgeTags: string[];
}>> = {
  math: [
    { no: '1', type: 'multiple_choice', correctAnswer: 'A', maxScore: 5, knowledgeTags: ['代数'] },
    { no: '2', type: 'multiple_choice', correctAnswer: 'B', maxScore: 5, knowledgeTags: ['几何'] },
    { no: '3', type: 'fill_in_blank', correctAnswer: '1/2', maxScore: 4, knowledgeTags: ['分数'] },
    { no: '4', type: 'fill_in_blank', correctAnswer: '12', maxScore: 4, knowledgeTags: ['运算'] },
    { no: '5', type: 'calculation', correctAnswer: '36', maxScore: 8, knowledgeTags: ['几何', '面积'] },
  ],
  english: [
    { no: '1', type: 'multiple_choice', correctAnswer: 'C', maxScore: 5, knowledgeTags: ['vocabulary'] },
    { no: '2', type: 'multiple_choice', correctAnswer: 'A', maxScore: 5, knowledgeTags: ['grammar'] },
    { no: '3', type: 'fill_in_blank', correctAnswer: 'have been', maxScore: 4, knowledgeTags: ['tense'] },
    { no: '4', type: 'reading_comprehension', correctAnswer: 'B', maxScore: 6, knowledgeTags: ['reading'] },
    { no: '5', type: 'essay', correctAnswer: '', maxScore: 15, knowledgeTags: ['writing'] },
  ],
  chinese: [
    { no: '1', type: 'multiple_choice', correctAnswer: 'D', maxScore: 5, knowledgeTags: ['字音'] },
    { no: '2', type: 'fill_in_blank', correctAnswer: '床前明月光', maxScore: 4, knowledgeTags: ['古诗默写'] },
    { no: '3', type: 'reading_comprehension', correctAnswer: 'C', maxScore: 6, knowledgeTags: ['阅读'] },
    { no: '4', type: 'short_answer', correctAnswer: '', maxScore: 8, knowledgeTags: ['理解'] },
    { no: '5', type: 'essay', correctAnswer: '', maxScore: 30, knowledgeTags: ['作文'] },
  ],
  physics: [
    { no: '1', type: 'multiple_choice', correctAnswer: 'B', maxScore: 5, knowledgeTags: ['力学'] },
    { no: '2', type: 'fill_in_blank', correctAnswer: '9.8 m/s²', maxScore: 4, knowledgeTags: ['重力', '单位'] },
    { no: '3', type: 'calculation', correctAnswer: '10 N', maxScore: 8, knowledgeTags: ['受力分析'] },
    { no: '4', type: 'multiple_choice', correctAnswer: 'C', maxScore: 5, knowledgeTags: ['电学'] },
    { no: '5', type: 'short_answer', correctAnswer: '', maxScore: 10, knowledgeTags: ['实验题'] },
  ],
  chemistry: [
    { no: '1', type: 'multiple_choice', correctAnswer: 'A', maxScore: 5, knowledgeTags: ['元素'] },
    { no: '2', type: 'fill_in_blank', correctAnswer: 'CaCO3', maxScore: 4, knowledgeTags: ['化学式'] },
    { no: '3', type: 'calculation', correctAnswer: '2H2O', maxScore: 8, knowledgeTags: ['配平'] },
    { no: '4', type: 'short_answer', correctAnswer: '', maxScore: 8, knowledgeTags: ['实验'] },
    { no: '5', type: 'short_answer', correctAnswer: '', maxScore: 10, knowledgeTags: ['推断'] },
  ],
};

async function main() {
  for (const subject of SUBJECTS) {
    const dir = path.join(ROOT, subject);
    await fs.mkdir(dir, { recursive: true });
    const bank = BANK[subject];
    for (let i = 0; i < COUNT; i++) {
      const base = String(i + 1).padStart(4, '0');
      const img = path.join(dir, `${base}.png`);
      const json = path.join(dir, `${base}.json`);
      // Don't overwrite real fixtures the user may have added.
      const exists = await fs
        .access(json)
        .then(() => true)
        .catch(() => false);
      if (exists) continue;
      await fs.writeFile(img, TINY_PNG);
      await fs.writeFile(json, JSON.stringify(bank, null, 2));
    }
    // eslint-disable-next-line no-console
    console.log(`[synth] ${subject}: ${COUNT} synthetic fixtures present in ${dir}`);
  }
  // eslint-disable-next-line no-console
  console.log('Done. These are PLACEHOLDERS for plumbing. Replace with real exam images before relying on accuracy numbers.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
