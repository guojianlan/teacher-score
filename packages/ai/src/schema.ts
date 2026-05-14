import { z } from 'zod';
import { CONFIDENCE_LEVELS, QUESTION_TYPES } from '@teacher-score/types';

export const QuestionResultSchema = z.object({
  no: z.string(),
  type: z.enum(QUESTION_TYPES),
  stem: z.string(),
  studentAnswer: z.string(),
  correctAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  score: z.number().min(0),
  maxScore: z.number().min(0),
  knowledgeTags: z.array(z.string()).default([]),
  comment: z.string().default(''),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export const GradeExamSchema = z.object({
  totalScore: z.number().min(0),
  maxScore: z.number().min(0),
  overallComment: z.string().default(''),
  unrecognizedRegions: z.array(z.string()).default([]),
  results: z.array(QuestionResultSchema),
});

export type GradeExamSchemaT = z.infer<typeof GradeExamSchema>;
export type QuestionResultSchemaT = z.infer<typeof QuestionResultSchema>;
