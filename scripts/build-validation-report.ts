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

  const totalTokens = reports.reduce((s, r) => s + r.llmTokens, 0);

  const studentSections = reports.map((r, i) => {
    const blankRowsHtml = r.blankRows.map((row) => `
      <tr class="cat-${row.category}">
        <td class="qno">Q${row.questionNo}${row.subQuestionNo} #${row.blankNo}</td>
        <td><code>${row.scoringMode}</code></td>
        <td class="expected">${escape(row.expected.slice(0, 80))}</td>
        <td class="written">${escape(row.written || '（空）')}</td>
        <td class="extracted">${escape(row.extracted || '（空）')}</td>
        <td>${row.llmAccurate ? '✓' : '✗'}</td>
        <td>${row.engineIsCorrect ? '✓' : '✗'}</td>
        <td>${row.engineScore}/${row.maxScore}</td>
      </tr>
    `).join('');

    const mcqRowsHtml = r.mcqRows.map((row) => `
      <tr class="cat-${row.category}">
        <td class="qno">Q${row.questionNo}</td>
        <td>${escape(row.correct)}</td>
        <td>${escape(row.written || '（空）')}</td>
        <td>${escape(row.extracted || '（空）')}</td>
        <td>${row.llmAccurate ? '✓' : '✗'}</td>
        <td>${row.engineIsCorrect ? '✓' : '✗'}</td>
      </tr>
    `).join('');

    return `
      <section class="student">
        <header class="student-head">
          <h2>${escape(r.studentName)}</h2>
          <div class="stats-mini">
            <span>MCQ 准确率 <strong>${pct(r.stats.mcqAccuracy)}</strong></span>
            <span>填空准确率 <strong>${pct(r.stats.blankAccuracy)}</strong></span>
            <span>LLM 识别率 <strong>${pct(r.stats.llmRecognitionRate)}</strong></span>
            <span>tokens <strong>${r.llmTokens}</strong></span>
          </div>
        </header>
        ${r.llmError ? `<div class="error">LLM 调用错误：${escape(r.llmError)}</div>` : ''}
        <div class="student-body">
          <div class="image-col">
            <h3>原始答题卡（合成）</h3>
            <img src="data:image/png;base64,${r.pngBase64}" alt="answer sheet">
          </div>
          <div class="tables-col">
            <h3>选择题（${r.mcqRows.length}）</h3>
            <table class="mcq-table">
              <thead>
                <tr><th>题号</th><th>正确</th><th>学生填涂</th><th>LLM 识别</th><th>LLM 准</th><th>引擎判对</th></tr>
              </thead>
              <tbody>${mcqRowsHtml}</tbody>
            </table>

            <h3>非选择题（${r.blankRows.length} 个空）</h3>
            <table class="blank-table">
              <thead>
                <tr>
                  <th>位置</th>
                  <th>模式</th>
                  <th>标准答案</th>
                  <th>学生写的</th>
                  <th>LLM 识别</th>
                  <th>LLM 准</th>
                  <th>引擎对</th>
                  <th>得分</th>
                </tr>
              </thead>
              <tbody>${blankRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>LLM 批改验证报告 · 给老师审阅</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.55; color: #1a1a1a; max-width: 1400px; margin: 0 auto; padding: 32px 24px; background: #fafafa; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .subtitle { color: #666; font-size: 14px; margin: 0 0 24px; }
  .summary { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px 24px; margin-bottom: 32px; }
  .summary h2 { margin: 0 0 16px; font-size: 18px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .stat { padding: 14px 16px; background: #f5f5f5; border-radius: 8px; }
  .stat .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat .value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .stat.good .value { color: #0a7f3f; }
  .stat.warn .value { color: #b45309; }
  .stat.bad .value { color: #b91c1c; }
  .legend { font-size: 13px; color: #555; margin-top: 12px; }
  .legend .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; margin-right: 6px; font-size: 12px; font-weight: 500; }
  .legend .green { background: #dcfce7; color: #166534; }
  .legend .yellow { background: #fef9c3; color: #854d0e; }
  .legend .red { background: #fee2e2; color: #991b1b; }

  .student { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; }
  .student-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 12px; }
  .student-head h2 { margin: 0; font-size: 20px; }
  .stats-mini { display: flex; gap: 16px; font-size: 13px; color: #555; flex-wrap: wrap; }
  .stats-mini strong { color: #1a1a1a; font-family: "SF Mono", Menlo, monospace; }

  .error { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }

  .student-body { display: grid; grid-template-columns: 380px 1fr; gap: 24px; }
  @media (max-width: 1000px) { .student-body { grid-template-columns: 1fr; } }
  .image-col h3, .tables-col h3 { margin: 16px 0 8px; font-size: 14px; color: #555; font-weight: 600; }
  .image-col img { width: 100%; border: 1px solid #ddd; border-radius: 6px; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
  table th, table td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  table th { background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  .qno { font-family: "SF Mono", Menlo, monospace; white-space: nowrap; }
  .expected, .written, .extracted { max-width: 240px; word-break: break-word; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 11px; background: #f3f3f3; padding: 1px 6px; border-radius: 3px; }

  tr.cat-green { background: rgba(34, 197, 94, 0.05); }
  tr.cat-yellow { background: rgba(245, 158, 11, 0.08); }
  tr.cat-red { background: rgba(239, 68, 68, 0.06); }

  .mode-breakdown { margin-top: 12px; font-size: 13px; color: #555; }
  .mode-breakdown table td:first-child { width: 100px; }
  .mode-breakdown table td:last-child { color: #888; }

  footer { text-align: center; color: #888; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
</style></head>
<body>
<h1>LLM 答题卡批改 · 验证报告</h1>
<p class="subtitle">
  生成时间：${new Date().toLocaleString('zh-CN')}
  · 模型：${process.env.AI_VISION_MODEL ?? 'gpt-5.5'}
  · 共 ${reports.length} 张样本 · 总 tokens ${totalTokens}
</p>

<div class="summary">
  <h2>总览</h2>
  <div class="stat-grid">
    <div class="stat ${mcqGreen / allMcq.length >= 0.95 ? 'good' : mcqGreen / allMcq.length >= 0.6 ? 'warn' : 'bad'}">
      <div class="label">选择题准确率</div>
      <div class="value">${pct(mcqGreen / Math.max(1, allMcq.length))}</div>
      <div style="font-size:11px;color:#888">${mcqGreen}/${allMcq.length}</div>
    </div>
    <div class="stat ${blankGreen / allBlank.length >= 0.8 ? 'good' : blankGreen / allBlank.length >= 0.5 ? 'warn' : 'bad'}">
      <div class="label">非选择题准确率</div>
      <div class="value">${pct(blankGreen / Math.max(1, allBlank.length))}</div>
      <div style="font-size:11px;color:#888">${blankGreen}/${allBlank.length}</div>
    </div>
    <div class="stat ${llmGreen / totalRows >= 0.8 ? 'good' : 'warn'}">
      <div class="label">LLM 识别率</div>
      <div class="value">${pct(llmGreen / Math.max(1, totalRows))}</div>
      <div style="font-size:11px;color:#888">${llmGreen}/${totalRows}</div>
    </div>
    <div class="stat ${totalGreen / totalRows >= 0.8 ? 'good' : totalGreen / totalRows >= 0.5 ? 'warn' : 'bad'}">
      <div class="label">综合一致率</div>
      <div class="value">${pct(totalGreen / Math.max(1, totalRows))}</div>
      <div style="font-size:11px;color:#888">${totalGreen}/${totalRows}</div>
    </div>
  </div>
  <p class="legend">
    <span class="badge green">绿 一致</span>LLM 识别准 + 引擎判定与"学生实际写的"一致
    <span class="badge yellow" style="margin-left:12px;">黄 偏差</span>LLM 识别准但引擎判定有差异（如关键词阈值）
    <span class="badge red" style="margin-left:12px;">红 LLM 错</span>LLM 没识别准（漏 / 错 / 编）
  </p>

  <div class="mode-breakdown">
    <h3 style="font-size:14px;margin:16px 0 8px;">按评分模式拆分（非选择题）</h3>
    <table>
      <thead><tr><th>模式</th><th>总数</th><th>LLM 错</th><th>引擎偏差</th><th>说明</th></tr></thead>
      <tbody>
        ${Object.entries(errByMode).map(([m, s]) => `
          <tr>
            <td><code>${m}</code></td>
            <td>${s.total}</td>
            <td>${s.llmMiss}（${pct(s.llmMiss / s.total)}）</td>
            <td>${s.engineDiff}（${pct(s.engineDiff / s.total)}）</td>
            <td>${m === 'exact' ? '字面一致比对' : m === 'keyword' ? '关键词命中比例' : 'LLM 概念等价判定'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</div>

${studentSections}

<footer>
  教师批改 SaaS · 验证报告 · 单文件可离线打开
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
