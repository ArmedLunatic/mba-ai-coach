import { TEST_COUNT, type EffectResult, type SessionEvent, type SessionState } from './session';

export function studentMessageFor(event: SessionEvent): string | null {
  switch (event.type) {
    case 'learn.followup':
      return event.question;
    case 'practice.answer':
    case 'test.answer':
      return event.answer;
    case 'explain.submit':
      return event.text;
    default:
      return null;
  }
}

function testQuestionLabel(index: number, question: string): string {
  return `Question ${index + 1} of ${TEST_COUNT}: ${question}`;
}

export function coachMessagesFor(result: EffectResult): string[] {
  switch (result.kind) {
    case 'explanation':
    case 'followup-answer':
      return [result.text];
    case 'practice-question':
      return [result.question];
    case 'practice-grade':
      return [result.feedback];
    case 'critique':
      return [result.critique, ...result.englishNotes.map((n) => `English note (${n.skill}): ${n.note}`)];
    case 'test-questions':
      return result.questions.length ? [testQuestionLabel(0, result.questions[0])] : [];
    case 'feedback':
      return [result.summary];
    case 'test-grade':
    case 'finalized':
      return [];
  }
}

/** After a non-final test answer, the next question to show. */
export function pendingTestQuestion(before: SessionState, after: SessionState): string | null {
  const n = after.test.answers.length;
  if (after.phase !== 'test' || n === before.test.answers.length || n >= TEST_COUNT) return null;
  const q = after.test.questions[n];
  return q ? testQuestionLabel(n, q) : null;
}
