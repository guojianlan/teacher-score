import type {
  QuestionResult, Subject,
  AnswerSheet, SheetQuestion, SheetSubQuestion,
} from '@teacher-score/types';

// Phase 3 PDF generation skeleton.
//
// At MVP, generating a real PDF requires a font-aware renderer (e.g. @react-pdf/renderer,
// puppeteer, or pdfkit). All have native deps that we don't want to commit at scaffold
// time. This module defines the stable interface and emits a fallback HTML representation
// that the generate-pdf worker can either:
//   (a) print to PDF via headless Chromium when added later, or
//   (b) save as .html for the time being so the UI can still link to a viewable artifact.

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

export interface GradingReportInput {
  studentName: string; // sanitized for display only — never persisted to LLM logs
  subject: Subject;
  totalScore: number;
  maxScore: number;
  overallComment: string;
  createdAt: string;
  results: QuestionResult[];
  /** Pre-signed image URLs for the answer sheets, in display order. Optional. */
  imageUrls?: string[];
}

export function renderGradingReportHtml(input: GradingReportInput): string {
  const correctRate = input.maxScore > 0 ? Math.round((input.totalScore / input.maxScore) * 100) : 0;
  const wrong = input.results.filter((q) => !q.isCorrect).length;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><title>批改报告</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #1a202c; padding: 24px; }
  h1 { margin: 0 0 8px; }
  .meta { color: #4a5568; font-size: 13px; margin-bottom: 16px; }
  .stat { display: flex; gap: 24px; padding: 12px 16px; background: #f7fafc; border-radius: 8px; margin-bottom: 16px; }
  .stat .item { font-size: 14px; }
  .stat strong { font-size: 22px; display: block; }
  .img-row { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px; }
  .img-row img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; }
  .q { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .q .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .q .head .no { font-weight: 600; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  .ok { background: #c6f6d5; color: #22543d; }
  .bad { background: #fed7d7; color: #742a2a; }
  .conf-low { background: #feebc8; color: #7b341e; }
  .conf-medium { background: #faf089; color: #5f370e; }
  .conf-high { background: #c6f6d5; color: #22543d; }
  .field { font-size: 13px; margin: 2px 0; }
  .label { color: #718096; margin-right: 6px; }
  .comment { font-size: 13px; color: #4a5568; margin-top: 8px; font-style: italic; }
</style></head>
<body>
  <h1>${escapeHtml(input.studentName)} · ${SUBJECT_LABELS[input.subject] ?? input.subject} 批改报告</h1>
  <div class="meta">生成时间：${new Date(input.createdAt).toLocaleString('zh-CN')}</div>
  <div class="stat">
    <div class="item"><span class="label">总分</span><strong>${input.totalScore} / ${input.maxScore}</strong></div>
    <div class="item"><span class="label">正确率</span><strong>${correctRate}%</strong></div>
    <div class="item"><span class="label">错题数</span><strong>${wrong}</strong></div>
  </div>
  ${
    input.imageUrls && input.imageUrls.length > 0
      ? `<div class="img-row">${input.imageUrls
          .map((u) => `<img src="${escapeAttr(u)}" alt="answer sheet" />`)
          .join('')}</div>`
      : ''
  }
  ${input.results
    .map(
      (q) => `<div class="q">
    <div class="head">
      <span class="no">第 ${escapeHtml(q.no)} 题</span>
      <span class="badge ${q.isCorrect ? 'ok' : 'bad'}">${q.isCorrect ? '正确' : '错误'} · ${q.score}/${q.maxScore}</span>
      <span class="badge conf-${q.confidence}">信心 ${q.confidence}</span>
      ${q.teacherModified ? '<span class="badge ok">老师改分</span>' : ''}
    </div>
    <div class="field"><span class="label">题干</span>${escapeHtml(q.stem)}</div>
    <div class="field"><span class="label">学生答</span>${escapeHtml(q.studentAnswer || '（空）')}</div>
    <div class="field"><span class="label">参考答</span>${escapeHtml(q.correctAnswer ?? '-')}</div>
    ${q.comment ? `<div class="comment">${escapeHtml(q.comment)}</div>` : ''}
  </div>`,
    )
    .join('')}
  ${input.overallComment ? `<div class="comment"><strong>总评：</strong>${escapeHtml(input.overallComment)}</div>` : ''}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

export interface RenderOutput {
  body: Buffer;
  contentType: 'application/pdf' | 'text/html';
  extension: 'pdf' | 'html';
}

/**
 * renderGradingReport: prints HTML → PDF via puppeteer if available
 * (PUPPETEER_EXECUTABLE_PATH or CHROMIUM_PATH set, OR `puppeteer` installed).
 * Falls back to HTML so the pipeline never blocks on missing Chromium.
 */
export async function renderGradingReport(input: GradingReportInput): Promise<RenderOutput> {
  const html = renderGradingReportHtml(input);

  if (process.env.PDF_RENDERER !== 'html') {
    const pdf = await tryRenderPdf(html);
    if (pdf) return { body: pdf, contentType: 'application/pdf', extension: 'pdf' };
  }
  return { body: Buffer.from(html, 'utf8'), contentType: 'text/html', extension: 'html' };
}

async function tryRenderPdf(html: string): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('puppeteer' as any).catch(() => null);
    if (!mod) return null;
    const launchOpts: Record<string, unknown> = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    const exe = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROMIUM_PATH;
    if (exe) launchOpts.executablePath = exe;
    const browser = await mod.default.launch(launchOpts);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
      });
      return Buffer.from(buf);
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Answer Sheet Renderer · D4 (ROADMAP-2026-W20.md)
//  schema-driven A4 PDF · 老师打印给学生填写
// ════════════════════════════════════════════════════════════════════════

const HEADER_FIELD_LABELS: Record<'name' | 'examId' | 'class' | 'date', string> = {
  name: '姓名',
  examId: '准考证号',
  class: '班级',
  date: '日期',
};

/**
 * 把 SheetQuestion[] 切成两段：MCQ 在前（多列网格），结构化在后（每题一块）。
 */
function partitionQuestions(questions: SheetQuestion[]) {
  const mcq: SheetQuestion[] = [];
  const structured: SheetQuestion[] = [];
  for (const q of questions) {
    if (q.type === 'mcq') mcq.push(q);
    else structured.push(q);
  }
  return { mcq, structured };
}

/**
 * MCQ 一题的渲染（参照真实样本：`1.[ A ] [ B ] [ C ] [ D ]`）
 */
function renderMcqCell(q: SheetQuestion): string {
  const opts = q.options ?? ['A', 'B', 'C', 'D'];
  return `<div class="mcq-cell">
    <span class="mcq-no">${escapeHtml(q.no)}.</span>
    ${opts.map((o) => `<span class="mcq-opt">[ ${escapeHtml(o)} ]</span>`).join('')}
  </div>`;
}

/**
 * 结构化题的子问 → 多空，每空渲染一段下划线。
 * 空之间用 nbsp 分隔，超出会换行（CSS flex-wrap）。
 */
function renderSubQuestion(sub: SheetSubQuestion): string {
  const blanks = sub.blanks
    .map((b) => {
      // 空的宽度按 maxScore 简单缩放：基线 240px，每分多 40px，上限 480
      const widthPx = Math.min(480, 200 + Math.round(b.maxScore * 40));
      return `<span class="blank" style="min-width:${widthPx}px"></span>`;
    })
    .join('<span class="blank-sep"> </span>');
  return `<div class="sub-question">
    <span class="sub-no">（${escapeHtml(sub.no.replace(/^[（(]|[）)]$/g, ''))}）</span>
    ${blanks}
  </div>`;
}

function renderStructuredQuestion(q: SheetQuestion): string {
  const subs = q.subQuestions ?? [];
  return `<section class="structured-block">
    <div class="structured-head">
      <span class="q-no">${escapeHtml(q.no)}.</span>
      <span class="q-score">(${q.maxScore} 分)</span>
    </div>
    ${subs.map(renderSubQuestion).join('')}
  </section>`;
}

export interface AnswerSheetRenderInput {
  sheet: Pick<AnswerSheet, 'name' | 'subject' | 'grade' | 'totalScore' | 'questions' | 'layout'>;
}

const SUBJECT_ZH: Record<Subject | string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
};

export function renderAnswerSheetHtml({ sheet }: AnswerSheetRenderInput): string {
  const { mcq, structured } = partitionQuestions(sheet.questions);
  const cols = sheet.layout?.mcqColumns ?? 3;
  const subjectZh = SUBJECT_ZH[sheet.subject] ?? sheet.subject;
  const headerFields = sheet.layout?.headerFields ?? ['name', 'examId'];

  const headerRows = headerFields
    .map((f) => `<div class="header-field">
      <span class="header-label">${HEADER_FIELD_LABELS[f]}：</span>
      <span class="header-line"></span>
    </div>`)
    .join('');

  const mcqRows = mcq.length > 0
    ? `<section class="mcq-section">
        <h3 class="section-h">一、选择题（共 ${mcq.length} 题）</h3>
        <div class="mcq-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
          ${mcq.map(renderMcqCell).join('')}
        </div>
      </section>`
    : '';

  const structuredRows = structured.length > 0
    ? `<section class="structured-section">
        <h3 class="section-h">二、非选择题（共 ${structured.length} 题）</h3>
        ${structured.map(renderStructuredQuestion).join('')}
      </section>`
    : '';

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>${escapeHtml(sheet.name)} · 答题卡</title>
<style>
  @page { size: ${sheet.layout?.pageSize ?? 'A4'}; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    color: #1a1a1a;
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc { width: 100%; }
  .title {
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .subtitle {
    text-align: center;
    font-size: 14px;
    margin: 0 0 16px;
    color: #4a4a4a;
  }
  .header-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 24px;
    margin-bottom: 16px;
    border: 1px solid #999;
    padding: 12px 16px;
  }
  .header-field {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .header-label {
    font-weight: 500;
    white-space: nowrap;
  }
  .header-line {
    flex: 1;
    border-bottom: 1px solid #1a1a1a;
    height: 1.2em;
  }
  .notes {
    border: 1px solid #999;
    padding: 8px 12px;
    font-size: 11px;
    color: #4a4a4a;
    margin-bottom: 16px;
    line-height: 1.6;
  }
  .notes ol { margin: 0; padding-left: 18px; }

  .section-h {
    margin: 16px 0 8px;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid #1a1a1a;
    padding-bottom: 4px;
  }

  /* MCQ */
  .mcq-grid {
    display: grid;
    gap: 10px 24px;
  }
  .mcq-cell {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  .mcq-no { font-weight: 500; min-width: 22px; }
  .mcq-opt { font-family: 'SF Mono', Menlo, monospace; }

  /* 结构化 */
  .structured-block {
    border: 1px solid #1a1a1a;
    padding: 10px 14px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .structured-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .q-no { font-weight: 600; font-size: 14px; }
  .q-score { color: #4a4a4a; font-size: 12px; }
  .sub-question {
    margin: 6px 0 10px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }
  .sub-no { font-weight: 500; flex-shrink: 0; }
  .blank {
    display: inline-block;
    height: 1.5em;
    border-bottom: 1px solid #1a1a1a;
    margin: 0 4px;
    flex: 0 0 auto;
  }
  .blank-sep { flex: 0 0 8px; }

  footer {
    margin-top: 20px;
    font-size: 10px;
    color: #999;
    text-align: center;
    border-top: 1px solid #ccc;
    padding-top: 6px;
  }
</style></head>
<body>
<div class="doc">
  <h1 class="title">${escapeHtml(sheet.name)}</h1>
  <p class="subtitle">${escapeHtml(subjectZh)}${sheet.grade ? ` · ${escapeHtml(sheet.grade)}` : ''} · 总分 ${sheet.totalScore}</p>

  <div class="header-block">${headerRows}</div>

  <div class="notes">
    <ol>
      <li>选择题用 2B 铅笔填涂选项框，非选择题用 0.5mm 黑色签字笔答题。</li>
      <li>请在题号顺序对应的答题区域内作答，超出区域无效。</li>
      <li>保持卡面清洁，不要折叠、不要弄破。</li>
    </ol>
  </div>

  ${mcqRows}
  ${structuredRows}

  <footer>${escapeHtml(sheet.name)} · 由 teacher-score 生成</footer>
</div>
</body></html>`;
}

export async function renderAnswerSheet(
  input: AnswerSheetRenderInput,
): Promise<RenderOutput> {
  const html = renderAnswerSheetHtml(input);
  if (process.env.PDF_RENDERER !== 'html') {
    const pdf = await tryRenderPdf(html);
    if (pdf) return { body: pdf, contentType: 'application/pdf', extension: 'pdf' };
  }
  return { body: Buffer.from(html, 'utf8'), contentType: 'text/html', extension: 'html' };
}
