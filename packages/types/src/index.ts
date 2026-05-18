export const SUBJECTS = ['math', 'english', 'chinese', 'physics', 'chemistry'] as const;
export type Subject = (typeof SUBJECTS)[number];

export const QUESTION_TYPES = [
  'multiple_choice',
  'fill_in_blank',
  'short_answer',
  'essay',
  'calculation',
  'reading_comprehension',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface Question {
  no: string;
  type: QuestionType;
  stem: string;
  correctAnswer: string | null;
  maxScore: number;
  knowledgeTags: string[];
}

export interface QuestionResult extends Question {
  studentAnswer: string;
  isCorrect: boolean;
  score: number;
  comment: string;
  confidence: Confidence;
  teacherModified?: boolean;
}

export type GradingStatus =
  | 'pending'
  | 'queued'
  | 'recognizing'
  | 'scoring'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface GradingStatusResponse {
  gradingId: string;
  status: GradingStatus;
  progress?: 'queued' | 'recognizing' | 'scoring' | 'finalizing';
  totalScore?: number;
  maxScore?: number;
  errorCode?: string;
  retryable?: boolean;
}

export interface SubscriptionInfo {
  tier: 'free' | 'basic' | 'pro' | 'plus';
  monthlyQuota: number;
  gradingsUsed: number;
}

// ─── Answer Sheet schema (新模型，D1+) ───
export * from "./answer-sheet";
export * as bioFixture from "./fixtures/bio-2025-mock";
