import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const sessionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('learn.followup'), question: text(500) }),
  z.object({ type: z.literal('learn.done') }),
  z.object({ type: z.literal('practice.answer'), answer: text(2000) }),
  z.object({ type: z.literal('explain.submit'), text: text(3000) }),
  z.object({ type: z.literal('test.answer'), answer: text(2000) }),
  z.object({ type: z.literal('feedback.confirm'), selfConfidence: z.number().int().min(1).max(5) }),
]);
