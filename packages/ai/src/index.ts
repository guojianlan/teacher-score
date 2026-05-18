import { createLogger } from '@teacher-score/logger';
import { GradeExamSchema, type GradeExamSchemaT } from './schema';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import type { QuestionResult, Subject } from '@teacher-score/types';

const log = createLogger({ scope: 'ai' });

export interface GradeExamInput {
  subject: Subject;
  images: { buf: Buffer; contentType: string }[];
  /** Optional template: when provided, model should NOT re-extract questions —
   * it grades student answers against these reference questions/answers (§九.4). */
  template?: {
    questions: Array<{
      no: string;
      type: string;
      stem: string;
      correctAnswer: string | null;
      maxScore: number;
      knowledgeTags?: string[];
    }>;
  };
}

export interface GradeExamResult {
  results: QuestionResult[];
  totalScore: number;
  maxScore: number;
  overallComment: string;
  unrecognizedRegions: string[];
  tokensUsed: number;
  costCents: number;
  model: string;
  raw: unknown;
}

/**
 * gradeExam — multimodal grading.
 *
 * If AI_API_KEY is unset, returns a deterministic mock that the rest of the
 * pipeline can flow through (used in tests + local dev). Real call goes to an
 * OpenAI-compatible vision model.
 */
export async function gradeExam(input: GradeExamInput): Promise<GradeExamResult> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.AI_VISION_MODEL ?? 'gpt-5.5-vision';

  if (!apiKey) {
    log.warn('AI_API_KEY not set — returning mock grading result');
    return mockResult(input);
  }

  const sys = buildSystemPrompt(input.subject);
  const schemaInstruction = `
必须严格按以下 JSON schema 输出（字段名一字不差，不要加额外字段）：
{
  "totalScore": number,
  "maxScore": number,
  "overallComment": string,
  "unrecognizedRegions": string[],
  "results": [
    {
      "no": string,
      "type": "multiple_choice" | "fill_in_blank" | "short_answer" | "essay" | "calculation" | "reading_comprehension",
      "stem": string,
      "studentAnswer": string,
      "correctAnswer": string,
      "isCorrect": boolean,
      "score": number,
      "maxScore": number,
      "knowledgeTags": string[],
      "comment": string,
      "confidence": "low" | "medium" | "high"
    }
  ]
}`.trim();

  const user = input.template
    ? `${buildUserPrompt(input.subject)}\n\n${schemaInstruction}\n\n以下是参考题目和正确答案（请勿重新识别题目，只对照判分）：\n${JSON.stringify(
        input.template.questions,
      )}`
    : `${buildUserPrompt(input.subject)}\n\n${schemaInstruction}`;

  const imageContent = input.images.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.contentType};base64,${img.buf.toString('base64')}` },
  }));

  const body = {
    model,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system' as const, content: sys },
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: user }, ...imageContent],
      },
    ],
    max_tokens: Number(process.env.AI_MAX_TOKENS ?? 4000),
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`AI call failed: ${res.status} ${txt}`) as Error & {
      code?: string;
      retryable?: boolean;
    };
    err.code = res.status >= 500 ? 'llm_5xx' : `llm_${res.status}`;
    err.retryable = res.status >= 500 || res.status === 429;
    throw err;
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? '{}';
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    const err = new Error('LLM returned non-JSON content') as Error & {
      code?: string;
      retryable?: boolean;
    };
    err.code = 'llm_bad_json';
    err.retryable = true;
    throw err;
  }
  const parsed = GradeExamSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const err = new Error(`LLM JSON failed schema: ${parsed.error.message}`) as Error & {
      code?: string;
      retryable?: boolean;
    };
    err.code = 'llm_bad_schema';
    err.retryable = true;
    throw err;
  }
  const tokensUsed = json.usage?.total_tokens ?? 0;
  return buildResult(parsed.data, model, tokensUsed, json);
}

function buildResult(
  parsed: GradeExamSchemaT,
  model: string,
  tokensUsed: number,
  raw: unknown,
): GradeExamResult {
  // Heuristic cost estimate (USD cents). Real numbers come from the provider's pricing.
  const centsPer1k = Number(process.env.AI_COST_CENTS_PER_1K ?? 1.5);
  const costCents = Math.ceil((tokensUsed / 1000) * centsPer1k);
  return {
    results: parsed.results as QuestionResult[],
    totalScore: parsed.totalScore,
    maxScore: parsed.maxScore,
    overallComment: parsed.overallComment,
    unrecognizedRegions: parsed.unrecognizedRegions,
    tokensUsed,
    costCents,
    model,
    raw,
  };
}

function mockResult(input: GradeExamInput): GradeExamResult {
  const result: GradeExamSchemaT = {
    totalScore: 80,
    maxScore: 100,
    overallComment: `[mock] ${input.subject} 试卷批改完成（开发模拟数据）`,
    unrecognizedRegions: [],
    results: [
      {
        no: '1',
        type: 'multiple_choice',
        stem: '示例题目 1',
        studentAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
        score: 5,
        maxScore: 5,
        knowledgeTags: ['mock'],
        comment: '[mock]',
        confidence: 'high',
      },
      {
        no: '2',
        type: 'fill_in_blank',
        stem: '示例题目 2',
        studentAnswer: '错的',
        correctAnswer: '对的',
        isCorrect: false,
        score: 0,
        maxScore: 5,
        knowledgeTags: ['mock'],
        comment: '[mock] 该题为模拟错题',
        confidence: 'medium',
      },
    ],
  };
  return buildResult(result, 'mock-vision', 0, { mock: true });
}

export { GradeExamSchema, buildSystemPrompt, buildUserPrompt };
export { scoreBlank, scoreMcq } from './scoring';
export {
  extractStudentAnswers,
  gradeAnswerSheet,
  type ExtractInput,
  type ExtractResult,
  type McqExtraction,
  type SheetGradingResult,
} from './extract';
