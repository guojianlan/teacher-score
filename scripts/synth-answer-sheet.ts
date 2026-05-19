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

/**
 * 真学生错答策略（4 选 1，等概率）：
 *   1. 留空：直接不写
 *   2. 只写开头：写 1-3 个字就停了（学生没想出来）
 *   3. 写错关键词：把正确答案里的某个关键字替换成错的
 *   4. 答非所问：写跟标答完全无关但听起来沾边的内容
 *
 * 避免合成器留下 "（不完整）" 之类的占位符 — 真学生不会这么写。
 */
function genWrongAnswer(expected: string): string {
  const strategies = [
    // 1) 留空
    () => '',
    // 2) 只写开头 1-3 字（中文按字数）
    () => expected.slice(0, Math.max(1, Math.min(3, Math.floor(expected.length * 0.3)))),
    // 3) 写一个关键词替换（用 "?" 模拟学生卡住）
    () => {
      const parts = expected.split(/[，、,；;。.\s]/).filter(Boolean);
      if (parts.length === 0) return '？';
      // 第一个词换成 "?"，其他保留
      return ['？', ...parts.slice(1)].join('、');
    },
    // 4) 答非所问 — 截前半 + 后半省略
    () => {
      const half = Math.max(2, Math.floor(expected.length / 2));
      return expected.slice(0, half);
    },
  ];
  return strategies[Math.floor(Math.random() * strategies.length)]!();
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
            written = isError ? genWrongAnswer(b.expected) : b.expected;
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

  // 注入手写样式 + 放大基础文字
  out = out.replace(
    '</style></head>',
    `
/* 整体放大，便于 LLM 视觉模型和老师肉眼看 */
body { font-size: 18px !important; }
.title { font-size: 22px !important; }
.subtitle { font-size: 17px !important; }
.section-h { font-size: 17px !important; }
.mcq-no { font-size: 18px !important; }
.mcq-opt { font-size: 18px !important; font-family: 'SF Mono', Menlo, monospace; }
.q-no { font-size: 19px !important; }
.q-score { font-size: 16px !important; }
.sub-no { font-size: 17px !important; }
.notes { font-size: 14px !important; }
.header-label { font-size: 17px !important; }

/* 手写答案：明显放大 + 蓝色 + 落在下划线上 */
.hw {
  font-family: "STKaiti", "楷体", "Kaiti SC", "KaiTi", "Caveat", cursive;
  font-size: 22px;
  font-weight: 600;
  color: #1e3a8a;
  display: inline-block;
  transform: rotate(-0.5deg);
  margin: 0 6px;
  line-height: 1.2;
}
/* 题号头部里的姓名手写 */
.header-line .hw {
  font-size: 20px;
}
/* 选择题填涂效果（黑底白字圆点） */
.mcq-filled .filled {
  display: inline-block;
  background: #111;
  color: #fff;
  width: 1.4em;
  height: 1.4em;
  line-height: 1.4em;
  text-align: center;
  border-radius: 50%;
  font-weight: 700;
}
/* 空（下划线）保留宽度，hw 在它内部行内显示 */
.blank {
  border-bottom: 2px solid #1a1a1a !important;
  min-height: 28px !important;
  vertical-align: bottom;
  display: inline-flex !important;
  align-items: flex-end;
  padding-bottom: 2px;
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
      // A4 @ 150 DPI: 1240×1754；deviceScaleFactor=2 → 输出 2480×3508
      // 这样 LLM 看得清，老师肉眼看 PDF/PNG 也清楚
      await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      return Buffer.from(buf);
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (err) {
    console.error('puppeteer error:', (err as Error).message);
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

  const safeBase = sheetTitle.replace(/[^\p{L}\p{N}_-]+/gu, '_');

  // 先生成「标准答案版」（所有 MCQ + 填空都填正确答案，标记为"参考"学生）
  {
    const refTruth: StudentTruth = {
      studentName: '【标准答案】',
      mcq: bioFixture.BIO_2025_MOCK_QUESTIONS
        .filter((q) => q.type === 'mcq')
        .map((q) => ({
          questionNo: q.no,
          selected: q.correctOption ?? '',
          correct: q.correctOption ?? '',
        })),
      blanks: bioFixture.BIO_2025_MOCK_QUESTIONS
        .filter((q) => q.type === 'structured')
        .flatMap((q) =>
          (q.subQuestions ?? []).flatMap((sq) =>
            sq.blanks.map((b) => ({
              questionNo: q.no,
              subQuestionNo: sq.no,
              blankNo: b.no,
              written: b.expected,
              expected: b.expected,
            })),
          ),
        ),
    };
    const refHtml = fillAnswers(baseHtml, refTruth);
    await fs.writeFile(path.join(outDir, `${safeBase}-reference.html`), refHtml);
    const refPng = await tryRenderPng(refHtml);
    if (refPng) {
      await fs.writeFile(path.join(outDir, `${safeBase}-reference.png`), refPng);
      console.log(`  ✓ 标准答案版（reference）已生成`);
    }
  }

  const allTruth: StudentTruth[] = [];
  for (let i = 0; i < opts.count; i++) {
    const truth = genStudent(bioFixture.BIO_2025_MOCK_QUESTIONS, opts, i);
    allTruth.push(truth);
    const html = fillAnswers(baseHtml, truth);
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
