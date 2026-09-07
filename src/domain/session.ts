export type Phase = 'learn' | 'practice' | 'explain' | 'test' | 'feedback' | 'done';

export type EnglishNote = { skill: string; note: string };

export type SessionState = {
  phase: Phase;
  learn: { followUpUsed: boolean };
  practice: { questions: string[]; answers: string[]; correct: number };
  explain: { conceptGaps: string[]; englishNotes: EnglishNote[] };
  test: { questions: string[]; answers: string[]; score: number | null; mistakes: string[] };
  feedback: { summary: string | null; selfConfidence: number | null };
};

export type SessionEvent =
  | { type: 'start' }
  | { type: 'learn.followup'; question: string }
  | { type: 'learn.done' }
  | { type: 'practice.answer'; answer: string }
  | { type: 'explain.submit'; text: string }
  | { type: 'test.answer'; answer: string }
  | { type: 'feedback.confirm'; selfConfidence: number };

export type Effect =
  | { kind: 'explain-topic' }
  | { kind: 'answer-followup'; question: string }
  | { kind: 'ask-practice'; index: number }
  | { kind: 'grade-practice'; index: number; answer: string }
  | { kind: 'critique-explanation'; text: string }
  | { kind: 'generate-test' }
  | { kind: 'grade-test' }
  | { kind: 'write-feedback' }
  | { kind: 'finalize' };

export type EffectResult =
  | { kind: 'explanation'; text: string }
  | { kind: 'followup-answer'; text: string }
  | { kind: 'practice-question'; question: string }
  | { kind: 'practice-grade'; isCorrect: boolean; feedback: string }
  | { kind: 'critique'; critique: string; conceptGaps: string[]; englishNotes: EnglishNote[] }
  | { kind: 'test-questions'; questions: string[] }
  | { kind: 'test-grade'; score: number; mistakes: string[] }
  | { kind: 'feedback'; summary: string }
  | { kind: 'finalized' };

export const PRACTICE_COUNT = 2;
export const TEST_COUNT = 3;

export class InvalidTransition extends Error {
  constructor(phase: Phase, event: SessionEvent['type']) {
    super(`Event "${event}" is not valid in phase "${phase}"`);
    this.name = 'InvalidTransition';
  }
}

export function initialState(): SessionState {
  return {
    phase: 'learn',
    learn: { followUpUsed: false },
    practice: { questions: [], answers: [], correct: 0 },
    explain: { conceptGaps: [], englishNotes: [] },
    test: { questions: [], answers: [], score: null, mistakes: [] },
    feedback: { summary: null, selfConfidence: null },
  };
}

export function next(state: SessionState, event: SessionEvent): { state: SessionState; effects: Effect[] } {
  const fail = () => new InvalidTransition(state.phase, event.type);

  switch (event.type) {
    case 'start':
      if (state.phase !== 'learn') throw fail();
      return { state, effects: [{ kind: 'explain-topic' }] };

    case 'learn.followup':
      if (state.phase !== 'learn' || state.learn.followUpUsed) throw fail();
      return {
        state: { ...state, learn: { followUpUsed: true } },
        effects: [{ kind: 'answer-followup', question: event.question }],
      };

    case 'learn.done':
      if (state.phase !== 'learn') throw fail();
      return { state: { ...state, phase: 'practice' }, effects: [{ kind: 'ask-practice', index: 0 }] };

    case 'practice.answer': {
      if (state.phase !== 'practice') throw fail();
      const index = state.practice.answers.length;
      if (index >= state.practice.questions.length) throw fail();
      const isLast = index === PRACTICE_COUNT - 1;
      const effects: Effect[] = [{ kind: 'grade-practice', index, answer: event.answer }];
      if (!isLast) effects.push({ kind: 'ask-practice', index: index + 1 });
      return {
        state: {
          ...state,
          phase: isLast ? 'explain' : 'practice',
          practice: { ...state.practice, answers: [...state.practice.answers, event.answer] },
        },
        effects,
      };
    }

    case 'explain.submit':
      if (state.phase !== 'explain') throw fail();
      return {
        state: { ...state, phase: 'test' },
        effects: [{ kind: 'critique-explanation', text: event.text }, { kind: 'generate-test' }],
      };

    case 'test.answer': {
      if (state.phase !== 'test') throw fail();
      const answers = [...state.test.answers, event.answer];
      if (answers.length > TEST_COUNT) throw fail();
      const complete = answers.length === TEST_COUNT;
      return {
        state: { ...state, phase: complete ? 'feedback' : 'test', test: { ...state.test, answers } },
        effects: complete ? [{ kind: 'grade-test' }, { kind: 'write-feedback' }] : [],
      };
    }

    case 'feedback.confirm':
      if (state.phase !== 'feedback') throw fail();
      return {
        state: { ...state, phase: 'done', feedback: { ...state.feedback, selfConfidence: event.selfConfidence } },
        effects: [{ kind: 'finalize' }],
      };
  }
}

export function apply(state: SessionState, result: EffectResult): SessionState {
  switch (result.kind) {
    case 'explanation':
    case 'followup-answer':
    case 'finalized':
      return state;
    case 'practice-question':
      return { ...state, practice: { ...state.practice, questions: [...state.practice.questions, result.question] } };
    case 'practice-grade':
      return {
        ...state,
        practice: { ...state.practice, correct: state.practice.correct + (result.isCorrect ? 1 : 0) },
      };
    case 'critique':
      return { ...state, explain: { conceptGaps: result.conceptGaps, englishNotes: result.englishNotes } };
    case 'test-questions':
      return { ...state, test: { ...state.test, questions: result.questions } };
    case 'test-grade':
      return { ...state, test: { ...state.test, score: result.score, mistakes: result.mistakes } };
    case 'feedback':
      return { ...state, feedback: { ...state.feedback, summary: result.summary } };
  }
}
