/**
 * 答题卡数据模型
 *
 * 一份 schema 驱动 3 个出口：
 *  - 设计器 UI（老师录入）
 *  - PDF 渲染（给学生打印）
 *  - LLM 批改（按结构提取每个空的答案）
 *
 * 三层嵌套：AnswerSheet → SheetQuestion → SheetSubQuestion → SheetBlank
 *
 * 命名说明：与现有 packages/types/src/index.ts 里的 Question/QuestionResult
 * （那是 LLM 批改输出格式）区分开，本文件类型一律加 Sheet 前缀。
 */

import type { Subject } from './index';

export const SCORING_MODES = ['exact', 'keyword', 'concept'] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

export const SHEET_QUESTION_TYPES = ['mcq', 'structured'] as const;
export type SheetQuestionType = (typeof SHEET_QUESTION_TYPES)[number];

export const SHEET_PAGE_SIZES = ['A4', 'A3'] as const;
export type SheetPageSize = (typeof SHEET_PAGE_SIZES)[number];

export const SHEET_HEADER_FIELDS = ['name', 'examId', 'class', 'date'] as const;
export type SheetHeaderField = (typeof SHEET_HEADER_FIELDS)[number];

/** 一个填空 = 评分的最小单元 */
export interface SheetBlank {
  /** 该子问内的编号，"1" / "2"，仅供展示 */
  no: string;
  /** 标准答案文本 */
  expected: string;
  /** 等价表达（"叶绿体、线粒体" ⇔ "线粒体和叶绿体"），命中任一即正确 */
  alternateAcceptable?: string[];
  /** 关键词命中模式用 */
  keywords?: string[];
  /** 该空满分 */
  maxScore: number;
  /** 评分模式：
   *   exact   = 字面一致（含 alternateAcceptable）
   *   keyword = 命中 keywords 任一即给满分
   *   concept = LLM 判断概念等价（不建议常用，慢且贵） */
  scoringMode: ScoringMode;
}

/** 子问 = 大题的某个 (1) (2) (3) */
export interface SheetSubQuestion {
  /** "(1)" / "(3)" */
  no: string;
  /** 题面文本（可选，仅辅助 LLM 理解；PDF 渲染时不打印）*/
  prompt?: string;
  /** 该子问下的所有空 */
  blanks: SheetBlank[];
}

/** 一道题 = MCQ（整道题一个 correctOption）或 structured（含子问）*/
export interface SheetQuestion {
  /** 全卷的题号，"1" / "16" */
  no: string;
  /** MCQ 还是结构化大题 */
  type: SheetQuestionType;
  /** 该题满分 */
  maxScore: number;
  /** 题目文本（可选）*/
  prompt?: string;
  /** 知识点 tag（如 "光合作用 · 光反应"），用于后续错题归集 */
  knowledgeTags?: string[];

  // ─── MCQ 字段 ───
  /** 选项标签，默认 ['A','B','C','D'] */
  options?: string[];
  /** 正确选项 */
  correctOption?: string;

  // ─── 结构化字段 ───
  /** 子问列表 */
  subQuestions?: SheetSubQuestion[];
}

/** PDF + 设计器布局参数 */
export interface SheetLayoutSpec {
  /** MCQ 排几列，参照样本是 3 */
  mcqColumns: number;
  /** 纸张大小 */
  pageSize: SheetPageSize;
  /** 顶部要哪些信息字段 */
  headerFields: SheetHeaderField[];
}

export const DEFAULT_LAYOUT: SheetLayoutSpec = {
  mcqColumns: 3,
  pageSize: 'A4',
  headerFields: ['name', 'examId'],
};

/** 答题卡的完整定义（DB exam_papers 表对应 row 的展开形态） */
export interface AnswerSheet {
  id: string;
  organizationId: string;
  name: string;
  subject: Subject;
  grade: string | null;
  totalScore: number;
  questions: SheetQuestion[];
  layout: SheetLayoutSpec;
  createdAt: string;
  updatedAt: string;
}

/** ─── 派生类型 ─────────────────────────────────────────
 *  LLM 批改输出 + per-blank 评分结果（D7/D8 用） */

/** LLM 对单个 blank 的提取结果 */
export interface BlankExtraction {
  questionNo: string;       // "16"
  subQuestionNo: string;    // "(2)"
  blankNo: string;          // "1"
  studentAnswer: string;    // OCR 出来的学生答案
  confidence: 'low' | 'medium' | 'high';
}

/** 评分引擎对单个 blank 的判定 */
export interface BlankScoring {
  questionNo: string;
  subQuestionNo: string;
  blankNo: string;
  studentAnswer: string;
  expected: string;
  isCorrect: boolean;
  scoreAwarded: number;
  maxScore: number;
  matchedKeywords?: string[];   // keyword 模式下命中的关键词
  reason: string;               // 判定依据，便于复核
}
