/**
 * Schema-driven student answer extractor · D7 (ROADMAP-2026-W20.md)
 *
 * 与旧 gradeExam 的区别：
 *   旧：LLM 同时识别题目结构 + 学生答案 + 判分。
 *   新：LLM 只做"按 schema 提取学生答案"。后续判分由本地 scoring 引擎（D8）做。
 *
 * 输出：BlankExtraction[]（每个空一个）+ MCQ 学生选择
 */
import { createLogger } from '@teacher-score/logger';
import type {
  BlankExtraction, SheetQuestion, SheetBlank,
  BlankScoring,
} from '@teacher-score/types';
import { scoreBlank, scoreMcq } from './scoring';

const log = createLogger({ scope: 'ai/extract' });

export interface ExtractInput {
  questions: SheetQuestion[];          // 答题卡 schema
  images: { buf: Buffer; contentType: string }[];
}

export interface McqExtraction {
  questionNo: string;
  selectedOption: string;              // 学生选的，如 'A'，未选 = ''
  confidence: 'low' | 'medium' | 'high';
}

export interface ExtractResult {
  mcqAnswers: McqExtraction[];
  blankAnswers: BlankExtraction[];
  unrecognizedRegions: string[];
  tokensUsed: number;
  model: string;
  raw: unknown;
}

/**
 * 按 schema 生成精准 prompt：列出每道题、每个子问、每个空，要 LLM 严格按结构输出。
 */
function buildExtractionPrompt(questions: SheetQuestion[]): string {
  const mcqs = questions.filter((q) => q.type === 'mcq');
  const structured = questions.filter((q) => q.type === 'structured');

  const mcqList = mcqs
    .map((q) => `- Q${q.no} (选项: ${(q.options ?? ['A', 'B', 'C', 'D']).join('/')})`)
    .join('\n');

  const structList = structured
    .map((q) => {
      const subs = (q.subQuestions ?? [])
        .map((sq) => {
          const blanks = sq.blanks.map((b) => `空${b.no}`).join(', ');
          return `  ${sq.no} (${sq.blanks.length} 个空: ${blanks})`;
        })
        .join('\n');
      return `- Q${q.no} (${q.maxScore} 分)\n${subs}`;
    })
    .join('\n');

  return `请按下面"答题卡结构"提取学生在每个位置写的内容。**只识别学生写了什么，不要评分**，
不要重新识别题目。如果某个位置学生没写，输出空字符串。

输出严格 JSON：
{
  "mcqAnswers": [
    { "questionNo": "1", "selectedOption": "D", "confidence": "high" }
  ],
  "blankAnswers": [
    { "questionNo": "16", "subQuestionNo": "(1)", "blankNo": "1",
      "studentAnswer": "PGA", "confidence": "high" }
  ],
  "unrecognizedRegions": []
}

答题卡结构：

【选择题】
${mcqList || '(无)'}

【非选择题】
${structList || '(无)'}

规则：
1. 选择题：识别填涂的字母（A/B/C/D）；如多选/无填涂 → selectedOption=""，confidence=low。
2. 非选择题：按 (questionNo, subQuestionNo, blankNo) 唯一定位每个空的答案。
3. 字迹不清：confidence=low 并在 unrecognizedRegions 标注（如 "Q16(2)空1"）。
4. 不要替学生猜。空着比错答好。`;
}

export async function extractStudentAnswers(input: ExtractInput): Promise<ExtractResult> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.AI_VISION_MODEL ?? 'gpt-5.5';

  if (!apiKey || input.images.length === 0) {
    log.warn('extract: no apiKey or no images → mock result');
    return mockExtract(input.questions);
  }

  const prompt = buildExtractionPrompt(input.questions);
  const imageContent = input.images.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.contentType};base64,${img.buf.toString('base64')}` },
  }));

  const body = {
    model,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system' as const, content: '你是一个精确的答题卡 OCR 助手。只提取，不评分。' },
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: prompt }, ...imageContent],
      },
    ],
    max_tokens: Number(process.env.AI_MAX_TOKENS ?? 4000),
    temperature: 0,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`LLM call failed: ${res.status} ${text.slice(0, 300)}`), {
      code: 'llm_error',
      retryable: res.status >= 500,
    });
  }
  const raw = await res.json();
  const content = raw?.choices?.[0]?.message?.content ?? '{}';
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;

  return {
    mcqAnswers: parsed.mcqAnswers ?? [],
    blankAnswers: parsed.blankAnswers ?? [],
    unrecognizedRegions: parsed.unrecognizedRegions ?? [],
    tokensUsed: raw?.usage?.total_tokens ?? 0,
    model,
    raw,
  };
}

/**
 * Mock extractor for dev / 无 LLM 环境：随机生成"约 70% 正确"的学生答案。
 * 不是真的 LLM，但能驱动整个 pipeline 跑通。
 */
function mockExtract(questions: SheetQuestion[]): ExtractResult {
  const mcqAnswers: McqExtraction[] = [];
  const blankAnswers: BlankExtraction[] = [];

  for (const q of questions) {
    if (q.type === 'mcq') {
      const correct = q.correctOption ?? 'A';
      // 75% 正确
      const selected = Math.random() < 0.75 ? correct
        : (q.options ?? ['A', 'B', 'C', 'D']).filter((o) => o !== correct)[0]!;
      mcqAnswers.push({ questionNo: q.no, selectedOption: selected, confidence: 'medium' });
    } else {
      for (const sq of q.subQuestions ?? []) {
        for (const b of sq.blanks) {
          // 70% 正确, 20% 错答, 10% 空
          const r = Math.random();
          const studentAnswer = r < 0.70 ? b.expected
            : r < 0.90 ? `（mock 错答 ${b.no}）`
            : '';
          blankAnswers.push({
            questionNo: q.no,
            subQuestionNo: sq.no,
            blankNo: b.no,
            studentAnswer,
            confidence: 'medium',
          });
        }
      }
    }
  }

  return {
    mcqAnswers,
    blankAnswers,
    unrecognizedRegions: [],
    tokensUsed: 0,
    model: 'mock',
    raw: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  顶层 API: 一次 extract → 完整批改结果
// ═══════════════════════════════════════════════════════════════════════

export interface SheetGradingResult {
  /** 每个 blank 的判定（含 MCQ 折算的"虚拟 blank"）*/
  blankScores: BlankScoring[];
  /** 每道题的得分汇总 */
  questionScores: Array<{
    no: string;
    type: 'mcq' | 'structured';
    scoreAwarded: number;
    maxScore: number;
  }>;
  totalScore: number;
  maxScore: number;
  unrecognizedRegions: string[];
  extraction: ExtractResult;
}

export async function gradeAnswerSheet(input: ExtractInput): Promise<SheetGradingResult> {
  const extraction = await extractStudentAnswers(input);
  const mcqById: Record<string, McqExtraction> = {};
  for (const m of extraction.mcqAnswers) mcqById[m.questionNo] = m;
  const blankByKey: Record<string, BlankExtraction> = {};
  for (const b of extraction.blankAnswers) {
    blankByKey[`${b.questionNo}|${b.subQuestionNo}|${b.blankNo}`] = b;
  }

  const blankScores: BlankScoring[] = [];
  const questionScores: SheetGradingResult['questionScores'] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const q of input.questions) {
    let qScore = 0;
    if (q.type === 'mcq') {
      const stu = mcqById[q.no];
      const r = scoreMcq(q.no, q.correctOption, stu?.selectedOption ?? '', q.maxScore);
      blankScores.push(r);
      qScore = r.scoreAwarded;
    } else {
      for (const sq of q.subQuestions ?? []) {
        for (const b of sq.blanks) {
          const stu = blankByKey[`${q.no}|${sq.no}|${b.no}`];
          const r = scoreBlank(b as SheetBlank, stu?.studentAnswer ?? '', {
            questionNo: q.no,
            subQuestionNo: sq.no,
          });
          blankScores.push(r);
          qScore += r.scoreAwarded;
        }
      }
      // 题目满分约束（题分≤题目 maxScore）
      qScore = Math.min(qScore, q.maxScore);
    }
    questionScores.push({ no: q.no, type: q.type, scoreAwarded: qScore, maxScore: q.maxScore });
    totalScore += qScore;
    maxScore += q.maxScore;
  }

  return {
    blankScores,
    questionScores,
    totalScore,
    maxScore,
    unrecognizedRegions: extraction.unrecognizedRegions,
    extraction,
  };
}
