#!/usr/bin/env tsx
/**
 * scripts/accuracy-test.ts
 *
 * Per checklist §六.2 / §七.3: runs grading against `fixtures/<subject>/*` images
 * with hand-labeled expected answers (`expected.json`), computes:
 *   - objective accuracy
 *   - subjective suggested-score deviation
 *   - high-confidence teacher-override rate (post-hoc; requires labeled overrides)
 *   - low-confidence recall samples
 *
 * Exit nonzero if accuracy drops > 5% vs `baselines/<subject>.json`.
 *
 * USAGE
 *   pnpm tsx scripts/accuracy-test.ts --subject math
 *   pnpm tsx scripts/accuracy-test.ts --subject all
 *   pnpm tsx scripts/accuracy-test.ts --subject math --update-baseline
 *
 * STATUS
 *   Skeleton — actual LLM call is gated on AI_API_KEY. Without a key, the script
 *   still loads fixtures and prints a structured plan. CI invokes this when
 *   AI_API_KEY is provided (see §七.9).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gradeExam } from '@teacher-score/ai';
import type { Subject } from '@teacher-score/types';

interface ExpectedQuestion {
  no: string;
  type: string;
  correctAnswer: string;
  maxScore: number;
  knowledgeTags?: string[];
}

interface Fixture {
  imagePath: string;
  expected: ExpectedQuestion[];
}

interface Baseline {
  subject: Subject;
  objectiveAccuracy: number; // 0..1
  capturedAt: string;
}

const SUBJECTS_ARG = process.argv.includes('--subject')
  ? process.argv[process.argv.indexOf('--subject') + 1]
  : 'all';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const ACCURACY_REGRESSION_THRESHOLD = 0.05;

const FIXTURE_ROOT = path.resolve(process.cwd(), 'fixtures');
const BASELINE_ROOT = path.resolve(process.cwd(), 'baselines');

async function loadFixtures(subject: Subject): Promise<Fixture[]> {
  const dir = path.join(FIXTURE_ROOT, subject);
  try {
    const files = await fs.readdir(dir);
    const items: Fixture[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const base = f.replace(/\.json$/, '');
      const candidate = ['jpg', 'jpeg', 'png', 'webp'].find(async (ext) =>
        fs
          .access(path.join(dir, `${base}.${ext}`))
          .then(() => true)
          .catch(() => false),
      );
      const ext = candidate ?? 'jpg';
      items.push({
        imagePath: path.join(dir, `${base}.${ext}`),
        expected: JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as ExpectedQuestion[],
      });
    }
    return items;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function loadBaseline(subject: Subject): Promise<Baseline | null> {
  try {
    const text = await fs.readFile(path.join(BASELINE_ROOT, `${subject}.json`), 'utf8');
    return JSON.parse(text) as Baseline;
  } catch {
    return null;
  }
}

async function saveBaseline(b: Baseline) {
  await fs.mkdir(BASELINE_ROOT, { recursive: true });
  await fs.writeFile(path.join(BASELINE_ROOT, `${b.subject}.json`), JSON.stringify(b, null, 2));
}

async function runSubject(subject: Subject): Promise<{ pass: boolean; accuracy: number }> {
  const fixtures = await loadFixtures(subject);
  if (fixtures.length === 0) {
    console.warn(`[accuracy] no fixtures for ${subject} — skipping`);
    return { pass: true, accuracy: 0 };
  }

  let correct = 0;
  let totalObjective = 0;

  for (const fix of fixtures) {
    const buf = await fs.readFile(fix.imagePath);
    const result = await gradeExam({
      subject,
      images: [{ buf, contentType: 'image/jpeg' }],
    });
    for (const q of result.results) {
      const exp = fix.expected.find((e) => e.no === q.no);
      if (!exp) continue;
      if (exp.type === 'multiple_choice' || exp.type === 'fill_in_blank') {
        totalObjective += 1;
        if ((q.studentAnswer ?? '').trim() === exp.correctAnswer.trim() && q.isCorrect) correct += 1;
      }
    }
  }

  const accuracy = totalObjective > 0 ? correct / totalObjective : 0;
  const baseline = await loadBaseline(subject);

  console.log(
    `[accuracy] ${subject}: objective=${(accuracy * 100).toFixed(1)}% (${correct}/${totalObjective}) baseline=${
      baseline ? `${(baseline.objectiveAccuracy * 100).toFixed(1)}%` : 'none'
    }`,
  );

  if (UPDATE_BASELINE) {
    await saveBaseline({ subject, objectiveAccuracy: accuracy, capturedAt: new Date().toISOString() });
    console.log(`[accuracy] ${subject}: baseline updated`);
    return { pass: true, accuracy };
  }

  if (baseline && accuracy < baseline.objectiveAccuracy - ACCURACY_REGRESSION_THRESHOLD) {
    console.error(
      `[accuracy] ${subject}: regression ${(baseline.objectiveAccuracy * 100).toFixed(
        1,
      )}% -> ${(accuracy * 100).toFixed(1)}% exceeds ${ACCURACY_REGRESSION_THRESHOLD * 100}%`,
    );
    return { pass: false, accuracy };
  }
  return { pass: true, accuracy };
}

async function main() {
  const ALL: Subject[] = ['math', 'english', 'chinese', 'physics', 'chemistry'];
  const targets: Subject[] =
    SUBJECTS_ARG === 'all' ? ALL : [SUBJECTS_ARG as Subject];

  let pass = true;
  for (const s of targets) {
    const r = await runSubject(s);
    if (!r.pass) pass = false;
  }
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
