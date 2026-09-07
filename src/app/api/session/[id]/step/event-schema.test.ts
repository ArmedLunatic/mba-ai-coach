import { describe, expect, it } from 'vitest';
import { sessionEventSchema } from './event-schema';

describe('sessionEventSchema', () => {
  it('accepts every event type', () => {
    for (const e of [
      { type: 'start' },
      { type: 'learn.followup', question: 'why' },
      { type: 'learn.done' },
      { type: 'practice.answer', answer: 'a' },
      { type: 'explain.submit', text: 't' },
      { type: 'test.answer', answer: 'x' },
      { type: 'feedback.confirm', selfConfidence: 3 },
    ]) {
      expect(sessionEventSchema.safeParse(e).success).toBe(true);
    }
  });
  it('rejects empty answers, long text, and out-of-range confidence', () => {
    expect(sessionEventSchema.safeParse({ type: 'practice.answer', answer: '   ' }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'explain.submit', text: 'x'.repeat(3001) }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'feedback.confirm', selfConfidence: 6 }).success).toBe(false);
    expect(sessionEventSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
