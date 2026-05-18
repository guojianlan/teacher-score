/**
 * Per-blank 评分引擎 · D8 (ROADMAP-2026-W20.md)
 *
 * 三种评分模式：
 *   exact   = 字面一致（含 alternateAcceptable），全对得满分，错或漏 0 分
 *   keyword = 命中 keywords 任一即给满分（命中数 / 关键词数 = 比例分，向下取整到 0.5）
 *   concept = 概念等价，本地引擎仅做"全包含关键词 = 满分"启发；真正的概念判定由 LLM 在批改时给
 *
 * 输入：SheetBlank（标答 + 模式）+ studentAnswer（OCR 结果）
 * 输出：BlankScoring（命中/分数/原因）
 *
 * 这里**只做规则判定**，不调 LLM。LLM 的部分由 prompts (D7) 在生成 studentAnswer 时
 * 就已经完成了"识别"工作；本引擎是"识别完了之后的客观比对"。
 */
import type { BlankScoring, SheetBlank } from '@teacher-score/types';

// ─── 文本归一化 ───────────────────────────────────────────────────────
// 目标：吃掉 OCR/学生答案里的"无关差异"
//   - 全角 → 半角
//   - 多空白 → 单空白 → trim
//   - 常见分隔符等价（、, ， ; ；）
//   - 大小写忽略（英文部分）
function normalize(s: string): string {
  if (!s) return '';
  return s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角ASCII → 半角
    .replace(/\s+/g, '')
    .replace(/[、,，;；]/g, '|')         // 列表分隔统一为 |
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .toLowerCase()
    .trim();
}

// 把答案当"集合"理解（"叶绿体、线粒体" ⇔ "线粒体、叶绿体"）
function asSet(s: string): Set<string> {
  return new Set(normalize(s).split('|').filter(Boolean));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ─── exact 模式 ───────────────────────────────────────────────────────
function scoreExact(blank: SheetBlank, studentAnswer: string): {
  isCorrect: boolean; scoreAwarded: number; reason: string;
} {
  const sStudent = asSet(studentAnswer);
  const candidates = [blank.expected, ...(blank.alternateAcceptable ?? [])];
  for (const cand of candidates) {
    const sCand = asSet(cand);
    if (setsEqual(sStudent, sCand)) {
      return { isCorrect: true, scoreAwarded: blank.maxScore, reason: `字面命中: "${cand}"` };
    }
  }
  return { isCorrect: false, scoreAwarded: 0, reason: `字面不匹配，期望: "${blank.expected}"` };
}

// ─── keyword 模式 ────────────────────────────────────────────────────
function scoreKeyword(blank: SheetBlank, studentAnswer: string): {
  isCorrect: boolean; scoreAwarded: number; reason: string; matchedKeywords?: string[];
} {
  const kws = blank.keywords ?? [];
  if (kws.length === 0) {
    // 没配 keywords 退化为 exact
    return scoreExact(blank, studentAnswer);
  }
  const normalized = normalize(studentAnswer);
  const matched = kws.filter((kw) => normalized.includes(normalize(kw)));
  const ratio = matched.length / kws.length;
  // 按比例给分，向下取整到 0.5
  const raw = blank.maxScore * ratio;
  const scoreAwarded = Math.floor(raw * 2) / 2;
  // Round 2 调优：阈值 60% → 80%。部分分继续给，但 isCorrect 更严。
  // 避免"写一两个关键词就判全对"的误判。
  const isCorrect = ratio >= 0.8;
  return {
    isCorrect,
    scoreAwarded,
    matchedKeywords: matched,
    reason: matched.length === kws.length
      ? `所有关键词命中 (${kws.length}/${kws.length})`
      : `命中 ${matched.length}/${kws.length}: [${matched.join(', ')}]`,
  };
}

// ─── concept 模式 ────────────────────────────────────────────────────
// 本地启发：所有关键词命中 = 满分；缺关键词 = LLM 应在批改时已给出 studentAnswer 含
// 概念意译，这里降级为 keyword 模式以避免双重 LLM 调用。
function scoreConcept(blank: SheetBlank, studentAnswer: string) {
  const result = scoreKeyword(blank, studentAnswer);
  return { ...result, reason: `concept (启发式): ${result.reason}` };
}

// ─── 入口 ────────────────────────────────────────────────────────────
export function scoreBlank(
  blank: SheetBlank,
  studentAnswer: string,
  ctx: { questionNo: string; subQuestionNo: string },
): BlankScoring {
  if (!studentAnswer || !studentAnswer.trim()) {
    return {
      questionNo: ctx.questionNo,
      subQuestionNo: ctx.subQuestionNo,
      blankNo: blank.no,
      studentAnswer,
      expected: blank.expected,
      isCorrect: false,
      scoreAwarded: 0,
      maxScore: blank.maxScore,
      reason: '空（未答）',
    };
  }

  const result =
    blank.scoringMode === 'exact'   ? scoreExact(blank, studentAnswer) :
    blank.scoringMode === 'keyword' ? scoreKeyword(blank, studentAnswer) :
                                      scoreConcept(blank, studentAnswer);

  return {
    questionNo: ctx.questionNo,
    subQuestionNo: ctx.subQuestionNo,
    blankNo: blank.no,
    studentAnswer,
    expected: blank.expected,
    isCorrect: result.isCorrect,
    scoreAwarded: result.scoreAwarded,
    maxScore: blank.maxScore,
    matchedKeywords: 'matchedKeywords' in result
      ? (result as { matchedKeywords?: string[] }).matchedKeywords
      : undefined,
    reason: result.reason,
  };
}

// ─── MCQ 评分（更简单，独立函数） ────────────────────────────────────
export function scoreMcq(
  questionNo: string,
  correctOption: string | undefined,
  studentOption: string,
  maxScore: number,
): BlankScoring {
  const isCorrect = !!correctOption && normalize(correctOption) === normalize(studentOption);
  return {
    questionNo,
    subQuestionNo: '',
    blankNo: '',
    studentAnswer: studentOption,
    expected: correctOption ?? '',
    isCorrect,
    scoreAwarded: isCorrect ? maxScore : 0,
    maxScore,
    reason: isCorrect
      ? `MCQ 正确: ${studentOption}`
      : `MCQ 错误: 学生 ${studentOption} ≠ 正确 ${correctOption}`,
  };
}
