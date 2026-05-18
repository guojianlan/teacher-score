#!/usr/bin/env tsx
/**
 * D9-D10 · E2E 批改验证
 *
 * 流程：
 *   1. 读 ground truth（synth-answer-sheet 输出的 *-truth.json）
 *   2. 把每个学生的 "已知正确答案" 直接当成 extraction 输入（绕过 LLM；
 *      因为 LLM 部分在没装 puppeteer 转 PNG 时不能跑——HTML 不能给 vision 看）
 *   3. 跑 scoreBlank + scoreMcq 评分引擎
 *   4. 跟 truth 对比，输出 confusion matrix + 总准确率
 *
 * 这一步验证的是"评分引擎正确性"，不是"LLM 视觉识别准确率"。
 * 后者需要 PNG 输入 → 装 puppeteer 跑 synth 生成 PNG → 改本脚本接入真 LLM。
 *
 * 用法：
 *   pnpm e2e
 *   pnpm e2e --use-llm   # 如果你装了 puppeteer + 有 PNG，会真调 LLM
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bioFixture } from '@teacher-score/types';
import { scoreBlank, scoreMcq } from '@teacher-score/ai';
import { extractStudentAnswers } from '@teacher-score/ai';
import type { BlankExtraction } from '@teacher-score/types';
import type { McqExtraction } from '@teacher-score/ai';

interface StudentTruth {
  studentName: string;
  mcq: Array<{ questionNo: string; selected: string; correct: string }>;
  blanks: Array<{
    questionNo: string; subQuestionNo: string; blankNo: string;
    written: string; expected: string;
  }>;
}

interface Stats {
  total: number;
  correct: number;
  errorByType: Record<string, number>;
  perQuestion: Record<string, { correct: number; total: number }>;
}

async function main() {
  const argv = process.argv.slice(2);
  const useLlm = argv.includes('--use-llm');

  const synthDir = path.resolve(__dirname, '../tmp/synth');
  const sheetTitle = bioFixture.BIO_2025_MOCK_META.name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const truthPath = path.join(synthDir, `${sheetTitle}-truth.json`);

  if (!await fileExists(truthPath)) {
    console.error(`✗ 找不到 ${truthPath}\n  先跑：pnpm synth:sheet --count=10`);
    process.exit(1);
  }

  const allTruth = JSON.parse(await fs.readFile(truthPath, 'utf8')) as StudentTruth[];
  console.log(`E2E · ${allTruth.length} 个合成学生 · ${useLlm ? '走 LLM' : '直跑评分引擎'}`);

  const stats: Stats = { total: 0, correct: 0, errorByType: {}, perQuestion: {} };
  const detailLog: string[] = [];

  for (let i = 0; i < allTruth.length; i++) {
    const truth = allTruth[i]!;
    detailLog.push(`\n=== ${truth.studentName} ===`);

    let mcqAnswers: McqExtraction[];
    let blankAnswers: BlankExtraction[];

    if (useLlm) {
      // 装了 puppeteer + 真 LLM：读 PNG → 调 extract
      const pngPath = path.join(synthDir, `${sheetTitle}-stu-${i + 1}.png`);
      if (!await fileExists(pngPath)) {
        console.warn(`  ⚠ ${truth.studentName}: 没 PNG，回退到 truth 直注入`);
        mcqAnswers = truth.mcq.map((m) => ({
          questionNo: m.questionNo, selectedOption: m.selected, confidence: 'high' as const,
        }));
        blankAnswers = truth.blanks.map((b) => ({
          questionNo: b.questionNo, subQuestionNo: b.subQuestionNo, blankNo: b.blankNo,
          studentAnswer: b.written, confidence: 'high' as const,
        }));
      } else {
        const buf = await fs.readFile(pngPath);
        let ex: Awaited<ReturnType<typeof extractStudentAnswers>> | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            ex = await extractStudentAnswers({
              questions: bioFixture.BIO_2025_MOCK_QUESTIONS,
              images: [{ buf, contentType: 'image/png' }],
            });
            break;
          } catch (err) {
            const msg = (err as Error).message.slice(0, 100);
            console.warn(`  ⚠ ${truth.studentName} attempt ${attempt}/3: ${msg}`);
            if (attempt === 3) {
              console.warn(`  ⚠ ${truth.studentName}: 3 次失败，跳过该学生`);
            } else {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        }
        if (!ex) {
          // 跳过：这条不计入统计
          continue;
        }
        mcqAnswers = ex.mcqAnswers;
        blankAnswers = ex.blankAnswers;
        console.log(`  ${truth.studentName} · 调 LLM · ${ex.tokensUsed} tokens`);
      }
    } else {
      // 直接把 truth 当 extraction 注入（评分引擎纯净测试）
      mcqAnswers = truth.mcq.map((m) => ({
        questionNo: m.questionNo, selectedOption: m.selected, confidence: 'high' as const,
      }));
      blankAnswers = truth.blanks.map((b) => ({
        questionNo: b.questionNo, subQuestionNo: b.subQuestionNo, blankNo: b.blankNo,
        studentAnswer: b.written, confidence: 'high' as const,
      }));
    }

    // 评分
    const mcqMap: Record<string, McqExtraction> = {};
    for (const m of mcqAnswers) mcqMap[m.questionNo] = m;
    const blankMap: Record<string, BlankExtraction> = {};
    for (const b of blankAnswers) blankMap[`${b.questionNo}|${b.subQuestionNo}|${b.blankNo}`] = b;

    for (const q of bioFixture.BIO_2025_MOCK_QUESTIONS) {
      if (q.type === 'mcq') {
        const stu = mcqMap[q.no];
        const truthMcq = truth.mcq.find((x) => x.questionNo === q.no)!;
        const r = scoreMcq(q.no, q.correctOption, stu?.selectedOption ?? '', q.maxScore);

        // 跟 truth 对比："学生真的对了" vs "评分引擎说他对了"
        const truthIsCorrect = truthMcq.selected === truthMcq.correct;
        const ok = r.isCorrect === truthIsCorrect;
        stats.total++;
        if (ok) stats.correct++;
        else {
          stats.errorByType[`mcq-${r.isCorrect}-vs-truth-${truthIsCorrect}`] = (stats.errorByType[`mcq-${r.isCorrect}-vs-truth-${truthIsCorrect}`] ?? 0) + 1;
          detailLog.push(`  ✗ Q${q.no} MCQ: 引擎=${r.isCorrect} truth=${truthIsCorrect} 学生写="${truthMcq.selected}" 标答="${truthMcq.correct}"`);
        }
        const key = `Q${q.no}`;
        stats.perQuestion[key] ??= { correct: 0, total: 0 };
        stats.perQuestion[key].total++;
        if (ok) stats.perQuestion[key].correct++;
      } else {
        for (const sq of q.subQuestions ?? []) {
          for (const b of sq.blanks) {
            const stu = blankMap[`${q.no}|${sq.no}|${b.no}`];
            const truthB = truth.blanks.find((x) =>
              x.questionNo === q.no && x.subQuestionNo === sq.no && x.blankNo === b.no
            );
            if (!truthB) continue;

            const r = scoreBlank(b, stu?.studentAnswer ?? '', {
              questionNo: q.no, subQuestionNo: sq.no,
            });

            // truth 判定：written === expected (字面) OR written ⊇ keywords (keyword 模式)
            const truthIsCorrect = isTruthCorrect(b, truthB.written);
            const ok = r.isCorrect === truthIsCorrect;
            stats.total++;
            if (ok) stats.correct++;
            else {
              const errKey = `${b.scoringMode}-${r.isCorrect}-vs-truth-${truthIsCorrect}`;
              stats.errorByType[errKey] = (stats.errorByType[errKey] ?? 0) + 1;
              detailLog.push(`  ✗ Q${q.no}${sq.no}#${b.no}: 引擎=${r.isCorrect} truth=${truthIsCorrect} mode=${b.scoringMode} 写="${truthB.written.slice(0, 40)}" 标="${b.expected.slice(0, 40)}"`);
            }
            const key = `Q${q.no}`;
            stats.perQuestion[key] ??= { correct: 0, total: 0 };
            stats.perQuestion[key].total++;
            if (ok) stats.perQuestion[key].correct++;
          }
        }
      }
    }
  }

  // 报告
  console.log('\n━━━ 总报告 ━━━');
  console.log(`总判定数：    ${stats.total}`);
  console.log(`引擎与 truth 一致：${stats.correct} (${(stats.correct / stats.total * 100).toFixed(1)}%)`);
  console.log(`不一致：      ${stats.total - stats.correct}`);

  if (Object.keys(stats.errorByType).length > 0) {
    console.log('\n错误类型分布：');
    for (const [k, v] of Object.entries(stats.errorByType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${v}`);
    }
  }

  console.log('\n按题目准确率：');
  const sortedQs = Object.entries(stats.perQuestion).sort((a, b) =>
    Number(a[0].slice(1)) - Number(b[0].slice(1))
  );
  for (const [q, s] of sortedQs) {
    const pct = (s.correct / s.total * 100).toFixed(0);
    const bar = '█'.repeat(Math.round(s.correct / s.total * 10)) + '·'.repeat(10 - Math.round(s.correct / s.total * 10));
    console.log(`  ${q.padEnd(5)}  ${bar}  ${pct}%  (${s.correct}/${s.total})`);
  }

  // 写详细 log 到文件
  const logPath = path.join(synthDir, 'e2e-detail.log');
  await fs.writeFile(logPath, detailLog.join('\n'));
  console.log(`\n详细错误：${logPath}`);
}

function isTruthCorrect(blank: { expected: string; alternateAcceptable?: string[]; keywords?: string[]; scoringMode: string }, written: string): boolean {
  if (!written.trim()) return false;
  if (blank.scoringMode === 'exact') {
    const all = [blank.expected, ...(blank.alternateAcceptable ?? [])];
    return all.some((a) => normalizeForCmp(a) === normalizeForCmp(written));
  }
  // keyword / concept：合成器自身策略——错答时只写一半 + 加"（不完整）"，所以这里
  // 把"包含 expected" 或 "全部 keywords 命中" 视为对
  if (blank.keywords && blank.keywords.length > 0) {
    return blank.keywords.every((kw) => written.includes(kw));
  }
  return normalizeForCmp(written) === normalizeForCmp(blank.expected);
}

function normalizeForCmp(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
