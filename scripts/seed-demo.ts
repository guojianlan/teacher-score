#!/usr/bin/env tsx
/**
 * scripts/seed-demo.ts
 *
 * Creates a deterministic demo:
 *   - one user (email: demo@teacher-score.local, password: demo12345)
 *   - personal organization
 *   - 3 students (math + english + physics samples)
 *   - 1 completed grading record (using AI mock or real AI if AI_API_KEY set)
 *   - several mistake-collection rows
 *
 * Use this to bootstrap a fresh DB for screenshots, local QA, and the Playwright
 * stage-3 spec (which depends on at least one completed grading).
 *
 * Run: DATABASE_URL=... pnpm tsx scripts/seed-demo.ts
 */
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

const DEMO_USER_ID = 'usr_DEMO000000000000000000';
const DEMO_ORG_ID = 'org_DEMO000000000000000000';

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  // user
  await db
    .insert(schema.users)
    .values({
      id: DEMO_USER_ID,
      name: '演示老师',
      email: 'demo@teacher-score.local',
      emailVerified: true,
    })
    .onConflictDoNothing();

  // org
  await db
    .insert(schema.organizations)
    .values({
      id: DEMO_ORG_ID,
      name: '演示工作区',
      slug: 'demo-workspace',
      isPersonal: true,
      subscriptionTier: 'free',
      monthlyQuota: 50,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.members)
    .values({
      id: 'mbr_DEMO000000000000000000',
      organizationId: DEMO_ORG_ID,
      userId: DEMO_USER_ID,
      role: 'owner',
    })
    .onConflictDoNothing();

  // students
  const students = [
    { id: 'stu_DEMO_zhang3', name: '张三', grade: '初二', subjects: ['math', 'english'] },
    { id: 'stu_DEMO_lisi', name: '李四', grade: '初二', subjects: ['math', 'physics'] },
    { id: 'stu_DEMO_wang5', name: '王五', grade: '初三', subjects: ['math', 'english', 'physics'] },
  ];
  for (const s of students) {
    await db
      .insert(schema.students)
      .values({
        id: s.id,
        organizationId: DEMO_ORG_ID,
        name: s.name,
        grade: s.grade,
        subjects: s.subjects,
      })
      .onConflictDoNothing();
  }

  // one completed grading (zhang3 / math)
  const gid = 'gr_DEMO_zhang3_math_001';
  const results = [
    {
      no: '1',
      type: 'multiple_choice',
      stem: '下列哪个数是质数？',
      studentAnswer: 'B',
      correctAnswer: 'A',
      isCorrect: false,
      score: 0,
      maxScore: 5,
      knowledgeTags: ['质数'],
      comment: '记一下 2 是最小的质数。',
      confidence: 'high',
    },
    {
      no: '2',
      type: 'calculation',
      stem: '求长方形面积。长 6 cm，宽 4 cm。',
      studentAnswer: '24',
      correctAnswer: '24 cm²',
      isCorrect: false,
      score: 4,
      maxScore: 5,
      knowledgeTags: ['面积', '单位'],
      comment: '答案缺单位。',
      confidence: 'high',
    },
    {
      no: '3',
      type: 'fill_in_blank',
      stem: '√16 = ___',
      studentAnswer: '4',
      correctAnswer: '4',
      isCorrect: true,
      score: 5,
      maxScore: 5,
      knowledgeTags: ['开方'],
      comment: '',
      confidence: 'high',
    },
  ];

  await db
    .insert(schema.gradingRecords)
    .values({
      id: gid,
      organizationId: DEMO_ORG_ID,
      studentId: 'stu_DEMO_zhang3',
      subject: 'math',
      status: 'completed',
      imageKeys: [],
      results: results as unknown as object,
      totalScore: 9,
      maxScore: 15,
      overallComment: '总体掌握不错，注意单位和最小质数。',
      tokensUsed: 0,
      costCents: 0,
      durationMs: 1234,
      model: 'mock-vision',
      completedAt: new Date(),
    })
    .onConflictDoNothing();

  // mistake collection rows from the wrong questions
  for (const q of results.filter((r) => !r.isCorrect)) {
    const hash = createHash('sha256').update(`math::${q.stem.trim()}`).digest('hex').slice(0, 32);
    await db
      .insert(schema.mistakeCollection)
      .values({
        id: `mc_${hash}_stu_DEMO_zhang3`.slice(0, 60),
        organizationId: DEMO_ORG_ID,
        studentId: 'stu_DEMO_zhang3',
        subject: 'math',
        questionHash: hash,
        questionStem: q.stem,
        correctAnswer: q.correctAnswer,
        knowledgeTags: q.knowledgeTags,
        occurrences: 1,
        lastWrongAnswer: q.studentAnswer,
        lastGradingId: gid,
      })
      .onConflictDoNothing();
  }

  // quota usage
  await db
    .insert(schema.monthlyQuotas)
    .values({
      organizationId: DEMO_ORG_ID,
      yearMonth: ymNow(),
      gradingsUsed: 1,
      tokensUsed: 0,
      costCents: 0,
    })
    .onConflictDoNothing();

  // Verify
  const studentsCount = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.organizationId, DEMO_ORG_ID));
  // eslint-disable-next-line no-console
  console.log(`Seeded ${studentsCount.length} students. Demo user: demo@teacher-score.local`);
  // eslint-disable-next-line no-console
  console.log(
    'NOTE: this script does not create a Better-Auth password. Use the sign-up flow to set one, or seed an account row separately.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
