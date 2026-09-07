import { z } from 'zod';
import { ENGLISH_SKILLS } from '@/db/curriculum';

export const practiceGradeSchema = z.object({
  isCorrect: z.boolean(),
  feedback: z.string().max(500),
});

export const critiqueSchema = z.object({
  critique: z.string().max(800),
  conceptGaps: z.array(z.string().max(120)).max(3),
  englishNotes: z
    .array(z.object({ skill: z.enum(ENGLISH_SKILLS), note: z.string().max(160) }))
    .max(2),
});

export const testQuestionsSchema = z.object({
  questions: z.array(z.string().max(300)).length(3),
});

export const testGradeSchema = z.object({
  score: z.number().int().min(0).max(100),
  mistakes: z.array(z.string().max(160)).max(3),
});

export const trendSchema = z.object({
  sentences: z.array(z.string().max(200)).min(1).max(3),
});
