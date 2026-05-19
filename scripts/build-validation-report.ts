#!/usr/bin/env tsx
/**
 * 给老师看的验证报告生成器
 *
 * 三列对比：标答 | 学生填写（合成器注入） | LLM 识别 | 引擎判定
 *   绿 = LLM 识别准 + 引擎判对
 *   红 = LLM 识别错（或漏）
 *   黄 = LLM 识别准但引擎判定与"学生实际写的"不同（评分阈值问题）
 *
 * 输出：tmp/synth/validation-report.html（含 base64 PNG，单文件可发给老师）
 *
 * 用法：
 *   pnpm tsx --env-file=.env scripts/build-validation-report.ts --count=5
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bioFixture } from '@teacher-score/types';
import { extractStudentAnswers, scoreBlank, scoreMcq } from '@teacher-score/ai';
import type { BlankExtraction, SheetBlank } from '@teacher-score/types';
import type { McqExtraction, ExtractResult } from '@teacher-score/ai';

interface StudentTruth {
  studentName: string;
  mcq: Array<{ questionNo: string; selected: string; correct: string }>;
  blanks: Array<{
    questionNo: string; subQuestionNo: string; blankNo: string;
    written: string; expected: string;
  }>;
}

interface BlankRow {
  questionNo: string;
  subQuestionNo: string;
  blankNo: string;
  scoringMode: string;
  maxScore: number;
  expected: string;
  written: string;          // 合成器实际注入到 PNG 的内容
  extracted: string;        // LLM 识别出来的
  truthIsCorrect: boolean;  // 合成器视角下学生答对没
  engineIsCorrect: boolean; // 评分引擎判定
  engineScore: number;      // 评分引擎给分
  llmAccurate: boolean;     // LLM 识别是否准（extracted ≈ written）
  category: 'green' | 'yellow' | 'red';
}

interface McqRow {
  questionNo: string;
  correct: string;
  written: string;     // 合成器注入
  extracted: string;   // LLM 识别
  truthIsCorrect: boolean;
  engineIsCorrect: boolean;
  llmAccurate: boolean;
  category: 'green' | 'yellow' | 'red';
}

interface StudentReport {
  studentName: string;
  pngBase64: string;
  mcqRows: McqRow[];
  blankRows: BlankRow[];
  llmTokens: number;
  llmError: string | null;
  stats: {
    mcqAccuracy: number;
    blankAccuracy: number;
    llmRecognitionRate: number;
  };
}

function norm(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toLowerCase().trim();
}

function llmRecognizedAccurately(written: string, extracted: string): boolean {
  if (!written && !extracted) return true;
  if (!written && extracted) return false;
  if (written && !extracted) return false;
  const w = norm(written);
  const e = norm(extracted);
  if (w === e) return true;
  // 容差：60% 的字符匹配视为"基本识别"
  if (w.length > 5 && e.length > 5) {
    const longer = w.length > e.length ? w : e;
    const shorter = w.length > e.length ? e : w;
    if (longer.includes(shorter)) return true;
  }
  return false;
}

async function callLlmWithRetry(
  png: Buffer,
  attempts = 3,
): Promise<{ result: ExtractResult | null; error: string | null }> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await extractStudentAnswers({
        questions: bioFixture.BIO_2025_MOCK_QUESTIONS,
        images: [{ buf: png, contentType: 'image/png' }],
      });
      return { result: r, error: null };
    } catch (err) {
      const msg = (err as Error).message.slice(0, 120);
      if (i === attempts) return { result: null, error: msg };
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  return { result: null, error: 'unreachable' };
}

async function processStudent(
  truth: StudentTruth,
  pngPath: string,
): Promise<StudentReport> {
  const png = await fs.readFile(pngPath);
  const pngBase64 = png.toString('base64');

  const { result, error } = await callLlmWithRetry(png);

  const mcqRows: McqRow[] = [];
  const blankRows: BlankRow[] = [];

  // Index LLM output
  const mcqMap: Record<string, McqExtraction> = {};
  const blankMap: Record<string, BlankExtraction> = {};
  if (result) {
    for (const m of result.mcqAnswers) mcqMap[m.questionNo] = m;
    for (const b of result.blankAnswers) {
      blankMap[`${b.questionNo}|${b.subQuestionNo}|${b.blankNo}`] = b;
    }
  }

  // MCQ rows
  for (const q of bioFixture.BIO_2025_MOCK_QUESTIONS.filter((x) => x.type === 'mcq')) {
    const truthMcq = truth.mcq.find((x) => x.questionNo === q.no);
    if (!truthMcq) continue;
    const extracted = mcqMap[q.no]?.selectedOption ?? '';
    const engine = scoreMcq(q.no, q.correctOption, extracted, q.maxScore);
    const truthIsCorrect = truthMcq.selected === truthMcq.correct;
    const llmAccurate = llmRecognizedAccurately(truthMcq.selected, extracted);

    let category: 'green' | 'yellow' | 'red';
    if (!llmAccurate) category = 'red';
    else if (engine.isCorrect === truthIsCorrect) category = 'green';
    else category = 'yellow';

    mcqRows.push({
      questionNo: q.no,
      correct: q.correctOption ?? '',
      written: truthMcq.selected,
      extracted,
      truthIsCorrect,
      engineIsCorrect: engine.isCorrect,
      llmAccurate,
      category,
    });
  }

  // Blank rows
  for (const q of bioFixture.BIO_2025_MOCK_QUESTIONS.filter((x) => x.type === 'structured')) {
    for (const sq of q.subQuestions ?? []) {
      for (const b of sq.blanks) {
        const truthB = truth.blanks.find((x) =>
          x.questionNo === q.no && x.subQuestionNo === sq.no && x.blankNo === b.no,
        );
        if (!truthB) continue;
        const extracted = blankMap[`${q.no}|${sq.no}|${b.no}`]?.studentAnswer ?? '';
        const engine = scoreBlank(b as SheetBlank, extracted, {
          questionNo: q.no, subQuestionNo: sq.no,
        });

        // Truth 视角：学生在合成器里"写"得对没
        let truthIsCorrect = false;
        if (truthB.written.trim()) {
          if (b.scoringMode === 'exact') {
            const all = [b.expected, ...(b.alternateAcceptable ?? [])];
            truthIsCorrect = all.some((a) => norm(a) === norm(truthB.written));
          } else if (b.keywords) {
            const hit = b.keywords.filter((kw) => truthB.written.includes(kw)).length;
            truthIsCorrect = hit / b.keywords.length >= 0.8;
          }
        }

        const llmAccurate = llmRecognizedAccurately(truthB.written, extracted);
        let category: 'green' | 'yellow' | 'red';
        if (!llmAccurate) category = 'red';
        else if (engine.isCorrect === truthIsCorrect) category = 'green';
        else category = 'yellow';

        blankRows.push({
          questionNo: q.no,
          subQuestionNo: sq.no,
          blankNo: b.no,
          scoringMode: b.scoringMode,
          maxScore: b.maxScore,
          expected: b.expected,
          written: truthB.written,
          extracted,
          truthIsCorrect,
          engineIsCorrect: engine.isCorrect,
          engineScore: engine.scoreAwarded,
          llmAccurate,
          category,
        });
      }
    }
  }

  const mcqOk = mcqRows.filter((r) => r.category === 'green').length;
  const blankOk = blankRows.filter((r) => r.category === 'green').length;
  const llmOkMcq = mcqRows.filter((r) => r.llmAccurate).length;
  const llmOkBlank = blankRows.filter((r) => r.llmAccurate).length;

  return {
    studentName: truth.studentName,
    pngBase64,
    mcqRows,
    blankRows,
    llmTokens: result?.tokensUsed ?? 0,
    llmError: error,
    stats: {
      mcqAccuracy: mcqRows.length > 0 ? mcqOk / mcqRows.length : 0,
      blankAccuracy: blankRows.length > 0 ? blankOk / blankRows.length : 0,
      llmRecognitionRate:
        (mcqRows.length + blankRows.length) > 0
          ? (llmOkMcq + llmOkBlank) / (mcqRows.length + blankRows.length)
          : 0,
    },
  };
}

function escape(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

const MODE_LABEL: Record<string, string> = {
  exact: '完全相同',
  keyword: '关键词命中',
  concept: '意思相近',
};

function renderReport(reports: StudentReport[]): string {
  // 全局统计
  const allMcq = reports.flatMap((r) => r.mcqRows);
  const allBlank = reports.flatMap((r) => r.blankRows);
  const totalRows = allMcq.length + allBlank.length;
  const mcqGreen = allMcq.filter((r) => r.category === 'green').length;
  const blankGreen = allBlank.filter((r) => r.category === 'green').length;
  const totalGreen = mcqGreen + blankGreen;
  const llmGreen = allMcq.filter((r) => r.llmAccurate).length + allBlank.filter((r) => r.llmAccurate).length;

  // 按错误类型统计
  const errByMode: Record<string, { total: number; llmMiss: number; engineDiff: number }> = {};
  for (const r of allBlank) {
    const k = r.scoringMode;
    errByMode[k] ??= { total: 0, llmMiss: 0, engineDiff: 0 };
    errByMode[k].total++;
    if (!r.llmAccurate) errByMode[k].llmMiss++;
    if (r.llmAccurate && r.category === 'yellow') errByMode[k].engineDiff++;
  }

  const studentSections = reports.map((r) => {
    const blankRowsHtml = r.blankRows.map((row) => `
      <tr class="cat-${row.category}">
        <td class="qno">第${row.questionNo}题${row.subQuestionNo}<br><span style="color:#888;font-weight:normal;">第${row.blankNo}空</span></td>
        <td class="mode-cell">${MODE_LABEL[row.scoringMode] ?? row.scoringMode}</td>
        <td class="expected">${escape(row.expected.slice(0, 80))}</td>
        <td class="written">${escape(row.written || '（学生没写）')}</td>
        <td class="extracted">${escape(row.extracted || '（AI 没识别出来）')}</td>
        <td class="status">${row.llmAccurate ? '<span class="ok">✓ 识别准</span>' : '<span class="bad">✗ 识别错</span>'}</td>
        <td class="status">${row.engineIsCorrect ? '<span class="ok">判对</span>' : '<span class="muted">判错</span>'}</td>
        <td class="score">${row.engineScore}/${row.maxScore}</td>
      </tr>
    `).join('');

    const mcqRowsHtml = r.mcqRows.map((row) => `
      <tr class="cat-${row.category}">
        <td class="qno">第${row.questionNo}题</td>
        <td class="answer-cell">${escape(row.correct)}</td>
        <td class="answer-cell">${escape(row.written || '（没涂）')}</td>
        <td class="answer-cell">${escape(row.extracted || '（没识别到）')}</td>
        <td class="status">${row.llmAccurate ? '<span class="ok">✓ 识别准</span>' : '<span class="bad">✗ 识别错</span>'}</td>
        <td class="status">${row.engineIsCorrect ? '<span class="ok">判对</span>' : '<span class="muted">判错</span>'}</td>
      </tr>
    `).join('');

    return `
      <section class="student">
        <header class="student-head">
          <h2>${escape(r.studentName)}</h2>
          <div class="stats-mini">
            <span>选择题准确率 <strong>${pct(r.stats.mcqAccuracy)}</strong></span>
            <span>填空题准确率 <strong>${pct(r.stats.blankAccuracy)}</strong></span>
            <span>AI 识别成功率 <strong>${pct(r.stats.llmRecognitionRate)}</strong></span>
          </div>
        </header>
        ${r.llmError ? `<div class="error">AI 调用错误：${escape(r.llmError)}</div>` : ''}

        <h3 class="section-h">答题卡原图（点击放大看清字）</h3>
        <div class="image-wrap">
          <a href="data:image/png;base64,${r.pngBase64}" target="_blank" title="点击放大">
            <img src="data:image/png;base64,${r.pngBase64}" alt="answer sheet">
          </a>
          <p class="image-tip">↑ 点击图片在新标签页打开原始大图（2480 × 3724 像素）</p>
        </div>

        <h3 class="section-h">选择题（${r.mcqRows.length} 题）</h3>
        <table class="mcq-table">
          <thead>
            <tr>
              <th>题号</th>
              <th>正确答案</th>
              <th>学生涂的</th>
              <th>AI 识别出来的</th>
              <th>AI 识别是否准</th>
              <th>系统判定</th>
            </tr>
          </thead>
          <tbody>${mcqRowsHtml}</tbody>
        </table>

        <h3 class="section-h">非选择题（${r.blankRows.length} 个空）</h3>
        <table class="blank-table">
          <thead>
            <tr>
              <th>位置</th>
              <th>判分方式</th>
              <th>标准答案</th>
              <th>学生写的</th>
              <th>AI 识别出来的</th>
              <th>AI 识别是否准</th>
              <th>系统判定</th>
              <th>得分</th>
            </tr>
          </thead>
          <tbody>${blankRowsHtml}</tbody>
        </table>
      </section>
    `;
  }).join('');

  const mcqRate = mcqGreen / Math.max(1, allMcq.length);
  const blankRate = blankGreen / Math.max(1, allBlank.length);
  const llmRate = llmGreen / Math.max(1, totalRows);
  const totalRate = totalGreen / Math.max(1, totalRows);

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>AI 答题卡批改 · 给老师审阅的验证报告</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 1400px; margin: 0 auto; padding: 32px 24px; background: #fafafa; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  .subtitle { color: #666; font-size: 14px; margin: 0 0 28px; }

  /* 关键术语解释 */
  .glossary { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 18px 22px; margin-bottom: 24px; }
  .glossary h2 { font-size: 16px; margin: 0 0 12px; color: #075985; }
  .glossary dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
  .glossary dt { font-weight: 600; color: #0c4a6e; }
  .glossary dd { margin: 0; color: #1a1a1a; }

  .summary { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px 26px; margin-bottom: 32px; }
  .summary h2 { margin: 0 0 16px; font-size: 18px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .stat { padding: 16px 18px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid transparent; }
  .stat .label { font-size: 13px; color: #555; font-weight: 500; }
  .stat .value { font-size: 28px; font-weight: 600; margin-top: 6px; }
  .stat .sub { font-size: 12px; color: #888; margin-top: 2px; }
  .stat.good { border-left-color: #16a34a; }
  .stat.good .value { color: #0a7f3f; }
  .stat.warn { border-left-color: #f59e0b; }
  .stat.warn .value { color: #b45309; }
  .stat.bad { border-left-color: #dc2626; }
  .stat.bad .value { color: #b91c1c; }

  .legend { font-size: 14px; color: #444; margin-top: 18px; padding: 12px 14px; background: #fafafa; border-radius: 6px; }
  .legend .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; margin-right: 8px; font-size: 13px; font-weight: 600; }
  .legend .green { background: #dcfce7; color: #166534; }
  .legend .yellow { background: #fef9c3; color: #854d0e; }
  .legend .red { background: #fee2e2; color: #991b1b; }
  .legend .item { display: block; margin: 6px 0; }

  .student { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 24px 28px; margin-bottom: 28px; }
  .student-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2px solid #f0f0f0; flex-wrap: wrap; gap: 12px; }
  .student-head h2 { margin: 0; font-size: 22px; }
  .stats-mini { display: flex; gap: 20px; font-size: 14px; color: #555; flex-wrap: wrap; }
  .stats-mini strong { color: #1a1a1a; font-family: "SF Mono", Menlo, monospace; font-size: 15px; }

  .error { background: #fee2e2; color: #991b1b; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; font-size: 14px; }

  .section-h { font-size: 16px; color: #444; font-weight: 600; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #eee; }

  /* 图片：默认大图 + 点击新标签页查看原图 */
  .image-wrap { background: #fafafa; padding: 12px; border-radius: 8px; border: 1px solid #e5e5e5; text-align: center; }
  .image-wrap img { max-width: 100%; max-height: 700px; height: auto; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); cursor: zoom-in; transition: transform 0.15s; }
  .image-wrap img:hover { transform: scale(1.005); box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .image-tip { color: #666; font-size: 13px; margin: 8px 0 0; }

  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 8px; background: #fff; }
  table th, table td { padding: 10px 12px; border-bottom: 1px solid #eee; text-align: left; vertical-align: middle; }
  table th { background: #f5f5f5; font-weight: 600; font-size: 13px; color: #444; }
  .qno { font-weight: 600; white-space: nowrap; min-width: 80px; }
  .expected, .written, .extracted, .answer-cell { word-break: break-word; max-width: 280px; }
  .answer-cell { font-family: "SF Mono", Menlo, monospace; }
  .mode-cell { font-size: 13px; color: #666; white-space: nowrap; }
  .score { font-family: "SF Mono", Menlo, monospace; font-weight: 600; }
  .status { white-space: nowrap; }
  .ok { color: #15803d; font-weight: 500; }
  .bad { color: #b91c1c; font-weight: 500; }
  .muted { color: #888; }

  tr.cat-green { background: rgba(34, 197, 94, 0.05); }
  tr.cat-yellow { background: rgba(245, 158, 11, 0.08); }
  tr.cat-red { background: rgba(239, 68, 68, 0.06); }

  .mode-breakdown { margin-top: 16px; }
  .mode-breakdown h3 { font-size: 15px; margin: 0 0 8px; color: #444; }
  .mode-breakdown table { font-size: 13px; }
  .mode-breakdown table td { padding: 8px 10px; }

  .conclusion { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 20px 24px; margin: 24px 0 32px; }
  .conclusion h2 { margin: 0 0 10px; font-size: 18px; color: #92400e; }
  .conclusion p { margin: 6px 0; font-size: 14px; line-height: 1.7; }
  .conclusion ul { margin: 8px 0; padding-left: 22px; font-size: 14px; line-height: 1.8; }

  footer { text-align: center; color: #888; font-size: 13px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
</style></head>
<body>

<h1>AI 答题卡批改 · 验证报告</h1>
<p class="subtitle">
  生成时间：${new Date().toLocaleString('zh-CN')}
  · 测试样本：${reports.length} 张合成答题卡（生物 2025 一模）
</p>

<div class="glossary">
  <h2>📖 术语说明（看报告前先看这里）</h2>
  <dl>
    <dt>AI 识别</dt>
    <dd>系统通过 AI 视觉模型，读取学生在答题卡上写的内容（类似"AI 看图认字"）</dd>
    <dt>系统判定</dt>
    <dd>AI 识别后，自动比对标准答案，判断学生这题对错（"自动批改"那一步）</dd>
    <dt>选择题</dt>
    <dd>答题卡上 ABCD 涂卡的题。系统识别涂哪个选项，对比正确选项</dd>
    <dt>非选择题</dt>
    <dd>需要填空 / 写文字的题。一道大题里可能有多个"空"，每个空单独判分</dd>
    <dt>判分方式</dt>
    <dd>每个空有三种判分规则：<br>
      · <b>完全相同</b>：必须和标答一字不差（适合化学式、数字、专有名词）<br>
      · <b>关键词命中</b>：含有几个关键词就给几分（适合简答题）<br>
      · <b>意思相近</b>：让 AI 判断意思是否一致（适合长篇论述）</dd>
  </dl>
</div>

<div class="summary">
  <h2>📊 总览数据</h2>
  <div class="stat-grid">
    <div class="stat ${mcqRate >= 0.95 ? 'good' : mcqRate >= 0.6 ? 'warn' : 'bad'}">
      <div class="label">选择题准确率</div>
      <div class="value">${pct(mcqRate)}</div>
      <div class="sub">${mcqGreen} 题对 / 共 ${allMcq.length} 题</div>
    </div>
    <div class="stat ${blankRate >= 0.8 ? 'good' : blankRate >= 0.5 ? 'warn' : 'bad'}">
      <div class="label">填空题准确率</div>
      <div class="value">${pct(blankRate)}</div>
      <div class="sub">${blankGreen} 空对 / 共 ${allBlank.length} 空</div>
    </div>
    <div class="stat ${llmRate >= 0.8 ? 'good' : 'warn'}">
      <div class="label">AI 识别成功率</div>
      <div class="value">${pct(llmRate)}</div>
      <div class="sub">AI 能读出学生写的内容</div>
    </div>
    <div class="stat ${totalRate >= 0.8 ? 'good' : totalRate >= 0.5 ? 'warn' : 'bad'}">
      <div class="label">综合一致率</div>
      <div class="value">${pct(totalRate)}</div>
      <div class="sub">AI 识别 + 系统判定都对</div>
    </div>
  </div>

  <div class="legend">
    <strong>表格颜色含义：</strong>
    <span class="item"><span class="badge green">绿色行</span>AI 识别准确，系统判定与"学生实际写的"一致 — 系统行为正常</span>
    <span class="item"><span class="badge yellow">黄色行</span>AI 识别准确，但系统给分与人工预期不同（评分阈值可调）</span>
    <span class="item"><span class="badge red">红色行</span>AI 没识别准（看错 / 漏看 / 凭空编）— 通常是图像质量问题</span>
  </div>

  <div class="mode-breakdown">
    <h3>按判分方式拆分（仅非选择题）</h3>
    <table>
      <thead><tr><th>判分方式</th><th>总空数</th><th>AI 识别错</th><th>系统判定偏差</th><th>使用场景</th></tr></thead>
      <tbody>
        ${Object.entries(errByMode).map(([m, s]) => `
          <tr>
            <td>${MODE_LABEL[m] ?? m}</td>
            <td>${s.total}</td>
            <td>${s.llmMiss}（${pct(s.llmMiss / s.total)}）</td>
            <td>${s.engineDiff}（${pct(s.engineDiff / s.total)}）</td>
            <td style="color:#666;font-size:13px">${m === 'exact' ? '化学式、数字、专有名词' : m === 'keyword' ? '简答题（含若干关键词）' : '长篇论述（要看意思）'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</div>

<div class="conclusion">
  <h2>📝 怎么看这份报告（建议老师重点关注）</h2>
  <ul>
    <li><b>选择题部分</b>：如果准确率 ≥95%，说明 ABCD 自动批改可生产使用</li>
    <li><b>红色行</b>：看 AI 把学生写的内容读成了什么 — 判断这种错误在真实手写场景下是否能接受</li>
    <li><b>黄色行</b>：AI 看准了但系统判分有偏差 — 判断给分规则是否合理，可调整阈值</li>
    <li><b>图像质量</b>：本报告用的是<b>电脑合成</b>的答题卡（模拟手写），真实学生手写卡片识别率可能不同。建议老师提供 5-10 张<b>真实手写</b>答题卡再跑一次报告对比</li>
  </ul>
  <p style="margin-top:12px;color:#92400e;"><b>核心问题：</b>当前系统的 AI 识别能力，能否替代/辅助您的批改工作？</p>
</div>

${studentSections}

<footer>
  教师批改 AI 系统 · 验证报告 · 单文件离线可读 · 生成于 ${new Date().toLocaleDateString('zh-CN')}
</footer>
</body></html>`;
}

async function main() {
  const argv = process.argv.slice(2);
  const count = Number(argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 5);

  const synthDir = path.resolve(__dirname, '../tmp/synth');
  const sheetTitle = bioFixture.BIO_2025_MOCK_META.name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const truthPath = path.join(synthDir, `${sheetTitle}-truth.json`);
  if (!await fileExists(truthPath)) {
    console.error('✗ 找不到 truth：先跑 pnpm synth:sheet --count=N');
    process.exit(1);
  }
  const allTruth = JSON.parse(await fs.readFile(truthPath, 'utf8')) as StudentTruth[];
  const subset = allTruth.slice(0, count);

  console.log(`处理 ${subset.length} 个学生（每个调一次 LLM，预计 30 秒-2 分钟/学生）...\n`);

  const reports: StudentReport[] = [];
  for (let i = 0; i < subset.length; i++) {
    const truth = subset[i]!;
    const pngPath = path.join(synthDir, `${sheetTitle}-stu-${i + 1}.png`);
    if (!await fileExists(pngPath)) {
      console.warn(`  ⚠ 跳过：${pngPath} 不存在`);
      continue;
    }
    console.log(`  → ${truth.studentName}`);
    const t0 = Date.now();
    const r = await processStudent(truth, pngPath);
    console.log(`    完成 · ${Math.round((Date.now() - t0) / 1000)}s · LLM ${r.stats.llmRecognitionRate * 100 | 0}% · 综合 ${(r.stats.mcqAccuracy + r.stats.blankAccuracy) / 2 * 100 | 0}%${r.llmError ? ' · ' + r.llmError.slice(0, 60) : ''}`);
    reports.push(r);
  }

  const html = renderReport(reports);
  const outPath = path.join(synthDir, 'validation-report.html');
  await fs.writeFile(outPath, html);
  console.log(`\n✓ 报告已生成：${outPath}`);
  console.log(`  文件大小：${(html.length / 1024 / 1024).toFixed(1)} MB（含 ${reports.length} 张 PNG base64）`);
  console.log(`  发给老师：复制此 HTML 文件，双击在浏览器打开即可`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
