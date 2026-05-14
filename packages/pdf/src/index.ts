import type { QuestionResult, Subject } from '@teacher-score/types';

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
