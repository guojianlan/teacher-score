#!/usr/bin/env tsx
/**
 * D5 · 把生物样本卷直接 seed 到 DB + 渲染 PDF 到 tmp/synth/
 * （替代手动在 UI 录入，加速验证；UI 设计器同样的数据通路）
 *
 * 用法：
 *   pnpm tsx scripts/seed-bio-sheet.ts
 *   pnpm tsx scripts/seed-bio-sheet.ts --org=<orgId>  # 指定 org，否则取第一个
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { bioFixture } from '@teacher-score/types';
import { renderAnswerSheet } from '@teacher-score/pdf';

async function main() {
  const argv = process.argv.slice(2);
  const orgFlag = argv.find((a) => a.startsWith('--org='))?.split('=')[1];

  // 取目标 org
  let orgId = orgFlag;
  if (!orgId) {
    const orgs = await db.select().from(schema.organizations).limit(1);
    if (orgs.length === 0) {
      console.error('✗ 没有 org，先登录注册一个账号');
      process.exit(1);
    }
    orgId = orgs[0]!.id;
  }
  console.log(`org: ${orgId}`);

  // 重复检查：同名 + 同 orgId 已存在 → 删旧再 seed
  const existing = await db
    .select()
    .from(schema.examPapers)
    .where(eq(schema.examPapers.organizationId, orgId))
    .limit(50);
  const dup = existing.find((e) => e.name === bioFixture.BIO_2025_MOCK_META.name);
  if (dup) {
    await db.delete(schema.examPapers).where(eq(schema.examPapers.id, dup.id));
    console.log(`  ⤳ 清掉重名旧 row: ${dup.id}`);
  }

  const id = `tpl_${ulid()}`;
  await db.insert(schema.examPapers).values({
    id,
    organizationId: orgId,
    name: bioFixture.BIO_2025_MOCK_META.name,
    subject: bioFixture.BIO_2025_MOCK_META.subject,
    grade: bioFixture.BIO_2025_MOCK_META.grade,
    totalScore: bioFixture.BIO_2025_MOCK_META.totalScore,
    questions: bioFixture.BIO_2025_MOCK_QUESTIONS as unknown as object,
    layout: bioFixture.BIO_2025_MOCK_LAYOUT as unknown as object,
  });
  console.log(`✓ seed 成功: ${id}`);

  // 验证：统计题/空数
  const mcqCount = bioFixture.BIO_2025_MOCK_QUESTIONS.filter((q) => q.type === 'mcq').length;
  const structCount = bioFixture.BIO_2025_MOCK_QUESTIONS.filter((q) => q.type === 'structured').length;
  const blankCount = bioFixture.BIO_2025_MOCK_QUESTIONS.flatMap((q) => q.subQuestions ?? [])
    .reduce((s, sq) => s + sq.blanks.length, 0);
  console.log(`  ${mcqCount} MCQ + ${structCount} 结构化 · ${blankCount} 个空`);

  const sumScore = bioFixture.BIO_2025_MOCK_QUESTIONS.reduce((s, q) => s + q.maxScore, 0);
  console.log(`  题目合计: ${sumScore} 分 / 设定: ${bioFixture.BIO_2025_MOCK_META.totalScore} 分`);

  // 渲染 PDF
  const out = await renderAnswerSheet({
    sheet: {
      name: bioFixture.BIO_2025_MOCK_META.name,
      subject: bioFixture.BIO_2025_MOCK_META.subject,
      grade: bioFixture.BIO_2025_MOCK_META.grade,
      totalScore: bioFixture.BIO_2025_MOCK_META.totalScore,
      questions: bioFixture.BIO_2025_MOCK_QUESTIONS,
      layout: bioFixture.BIO_2025_MOCK_LAYOUT,
    },
  });
  const outDir = path.resolve(__dirname, '../tmp/synth');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `bio-2025-mock.${out.extension}`);
  await fs.writeFile(outFile, out.body);
  console.log(`✓ 渲染输出: ${outFile} (${out.contentType})`);
  console.log(`  跟原 PDF 对比: tmp/cankao/生物考前猜想卷01（答题卡）.pdf`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
