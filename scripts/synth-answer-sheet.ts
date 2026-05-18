#!/usr/bin/env tsx
/**
 * D6 · 答题卡合成器
 * schema + 随机"学生答案" → 已填写的答题卡 HTML/PNG，用作 e2e 测试输入。
 *
 * 用法：
 *   pnpm tokens:synth-sheet                              # 默认用生物 fixture，10 张
 *   pnpm tokens:synth-sheet --count=5 --error-rate=0.3   # 30% 错答
 *
 * 输出：tmp/synth/<sheet-name>-stu-<n>.html
 *      tmp/synth/<sheet-name>-stu-<n>.png  (puppeteer 可用时)
 *      tmp/synth/<sheet-name>-truth.json   (ground truth：每张学生答了啥)
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { renderAnswerSheetHtml } from '@teacher-score/pdf';
import { bioFixture } from '@teacher-score/types';
import type { SheetQuestion, SheetBlank } from '@teacher-score/types';

interface SynthOptions {
  count: number;
  errorRate: number;    // 0..1：每个空 / 选项错答的概率
  blankRate: number;    // 0..1：每个空留空的概率
}

interface StudentTruth {
  studentName: string;
  mcq: Array<{ questionNo: string; selected: string; correct: string }>;
  blanks: Array<{
    questionNo: string;
    subQuestionNo: string;
    blankNo: string;
    written: string;
    expected: string;
  }>;
}

function pickError(options: string[], correct: string): string {
  const others = options.filter((o) => o !== correct);
  return others[Math.floor(Math.random() * others.length)] ?? correct;
}

function maybeMisspell(s: string): string {
  // 极小概率字符级偏差，模拟笔误（中文不好造，简单返回原文+'…'）
  return Math.random() < 0.3 ? s.slice(0, -1) : s;
}

function genStudent(
  questions: SheetQuestion[],
  opts: SynthOptions,
  idx: number,
): StudentTruth {
  const truth: StudentTruth = {
    studentName: `学生${idx + 1}`,
    mcq: [],
    blanks: [],
  };

  for (const q of questions) {
    if (q.type === 'mcq') {
      const correct = q.correctOption ?? 'A';
      const isBlank = Math.random() < opts.blankRate;
      const isError = !isBlank && Math.random() < opts.errorRate;
      const selected = isBlank ? '' : (isError ? pickError(q.options ?? ['A','B','C','D'], correct) : correct);
      truth.mcq.push({ questionNo: q.no, selected, correct });
    } else {
      for (const sq of q.subQuestions ?? []) {
        for (const b of sq.blanks) {
          const isBlank = Math.random() < opts.blankRate;
          const isError = !isBlank && Math.random() < opts.errorRate;
          let written = '';
          if (!isBlank) {
            if (isError) {
              // 错答策略：要么写错答，要么只写一半
              written = Math.random() < 0.5
                ? maybeMisspell(b.expected)
                : `${b.expected.split(/[，、,]/)[0] ?? b.expected}（不完整）`;
            } else {
              written = b.expected;
            }
          }
          truth.blanks.push({
            questionNo: q.no,
            subQuestionNo: sq.no,
            blankNo: b.no,
            written,
            expected: b.expected,
          });
        }
      }
    }
  }
  return truth;
}

/**
 * 改造空白 HTML：把每个空换成"学生填写好"的 HTML（手写感字体 + 内容）。
 * 直接在原 renderAnswerSheetHtml 输出上做字符串替换。
 */
function fillAnswers(html: string, truth: StudentTruth): string {
  // 注入学生姓名（在第一个 header-line 上）
  let out = html;
  // 头部姓名
  out = out.replace(
    /<span class="header-line"><\/span>/,
    `<span class="header-line"><span class="hw">${escape(truth.studentName)}</span></span>`,
  );

  // MCQ：把对应题号的 `[ X ]` 包装成填涂效果（黑底白字）
  for (const m of truth.mcq) {
    if (!m.selected) continue;
    const re = new RegExp(
      `(<span class="mcq-no">${escapeRegex(m.questionNo)}\\.</span>[\\s\\S]*?)<span class="mcq-opt">\\[\\s*${m.selected}\\s*\\]</span>`,
    );
    out = out.replace(
      re,
      (_full, prefix) =>
        `${prefix}<span class="mcq-opt mcq-filled">[ <span class="filled">${m.selected}</span> ]</span>`,
    );
  }

  // 结构化大题：按 (subQuestionNo, blankNo) 替换对应下划线为手写答案
  // 思路：在 sub-question 里按顺序找 .blank，第 N 个换成学生答案
  const blanksByQSub: Record<string, StudentTruth['blanks']> = {};
  for (const b of truth.blanks) {
    const key = `${b.questionNo}|${b.subQuestionNo}`;
    (blanksByQSub[key] ??= []).push(b);
  }

  // 遍历每个 sub-question 块替换其 blanks
  out = out.replace(
    /<div class="sub-question">[\s\S]*?<\/div>/g,
    (block) => {
      // 提取题号 & 子问号
      const subNoM = /<span class="sub-no">（([^）]+)）<\/span>/.exec(block);
      const subNoBracketed = subNoM ? `(${subNoM[1]})` : '';
      // 拿父 question no：找最近的前文 q-no（不在 block 内可能拿不到）；
      // 改用全文记号 - 这次简化为：遍历所有 q + sub 时按出现顺序匹配
      // 简单做法：把 block 里的 .blank 按序换成 truth 中匹配相同 subQuestionNo 的答案
      // （前提：sub.no 在一个 sheet 内唯一足以定位；本 fixture 是的）
      const matched = Object.entries(blanksByQSub).find(([k]) =>
        k.endsWith(`|${subNoBracketed}`),
      )?.[1] ?? [];

      let i = 0;
      return block.replace(/<span class="blank"[^>]*><\/span>/g, () => {
        const ans = matched[i++];
        if (!ans || !ans.written) {
          return `<span class="blank"></span>`;
        }
        return `<span class="blank"><span class="hw">${escape(ans.written)}</span></span>`;
      });
    },
  );

  // 注入手写样式
  out = out.replace(
    '</style></head>',
    `
.hw {
  font-family: "Caveat", "Kalam", "STKaiti", "KaiTi", "楷体", cursive;
  font-size: 14px;
  color: #1e40af;
  display: inline-block;
  transform: rotate(-1deg);
  margin: 0 4px;
}
.mcq-filled .filled {
  background: #1a1a1a;
  color: #fff;
  display: inline-block;
  width: 1em;
  text-align: center;
  border-radius: 50%;
}
</style></head>`,
  );

  return out;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function tryRenderPng(html: string): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('puppeteer' as any).catch(() => null);
    if (!mod) return null;
    const browser = await mod.default.launch({ headless: 'new', args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 1131 }); // A4 比例
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      return Buffer.from(buf);
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opts: SynthOptions = {
    count: Number(argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 10),
    errorRate: Number(argv.find((a) => a.startsWith('--error-rate='))?.split('=')[1] ?? 0.25),
    blankRate: Number(argv.find((a) => a.startsWith('--blank-rate='))?.split('=')[1] ?? 0.05),
  };
  console.log(`合成 ${opts.count} 张 · 错答率 ${opts.errorRate} · 留空率 ${opts.blankRate}`);

  const outDir = path.resolve(__dirname, '../tmp/synth');
  await fs.mkdir(outDir, { recursive: true });

  const sheetTitle = bioFixture.BIO_2025_MOCK_META.name;
  const baseHtml = renderAnswerSheetHtml({
    sheet: {
      name: sheetTitle,
      subject: bioFixture.BIO_2025_MOCK_META.subject,
      grade: bioFixture.BIO_2025_MOCK_META.grade,
      totalScore: bioFixture.BIO_2025_MOCK_META.totalScore,
      questions: bioFixture.BIO_2025_MOCK_QUESTIONS,
      layout: bioFixture.BIO_2025_MOCK_LAYOUT,
    },
  });

  const allTruth: StudentTruth[] = [];
  for (let i = 0; i < opts.count; i++) {
    const truth = genStudent(bioFixture.BIO_2025_MOCK_QUESTIONS, opts, i);
    allTruth.push(truth);
    const html = fillAnswers(baseHtml, truth);
    const safeBase = sheetTitle.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const htmlPath = path.join(outDir, `${safeBase}-stu-${i + 1}.html`);
    await fs.writeFile(htmlPath, html);

    const png = await tryRenderPng(html);
    if (png) {
      const pngPath = path.join(outDir, `${safeBase}-stu-${i + 1}.png`);
      await fs.writeFile(pngPath, png);
    }

    console.log(`  ✓ 学生 ${i + 1}: ${truth.mcq.length} MCQ + ${truth.blanks.length} blanks · ${htmlPath}`);
  }

  const truthPath = path.join(outDir, `${sheetTitle.replace(/[^\p{L}\p{N}_-]+/gu, '_')}-truth.json`);
  await fs.writeFile(truthPath, JSON.stringify(allTruth, null, 2));
  console.log(`\n✓ ground truth: ${truthPath}`);
  console.log(`如果没装 puppeteer，只生成 HTML（浏览器打开看效果）。`);
  console.log(`PNG 需要：pnpm add -F @teacher-score/pdf puppeteer`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
