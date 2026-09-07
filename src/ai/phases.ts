import { generateText, Output } from 'ai';
import type { Effect, EffectResult, SessionState } from '@/domain/session';
import type { CoachContext } from './context';
import {
  askPracticePrompt,
  coachSystem,
  critiquePrompt,
  explainTopicPrompt,
  feedbackPrompt,
  followupPrompt,
  generateTestPrompt,
  gradePracticePrompt,
  gradeTestPrompt,
} from './prompts';
import { modelFor, type TaskKind } from './router';
import { critiqueSchema, practiceGradeSchema, testGradeSchema, testQuestionsSchema } from './schemas';

async function text(kind: TaskKind, ctx: CoachContext, prompt: string): Promise<string> {
  const result = await generateText({ model: modelFor(kind), system: coachSystem(ctx), prompt });
  return result.text.trim();
}

/** Runs one effect from the session state machine as a single model call. */
export async function runEffect(effect: Effect, ctx: CoachContext, state: SessionState): Promise<EffectResult> {
  const system = coachSystem(ctx);

  switch (effect.kind) {
    case 'explain-topic':
      return { kind: 'explanation', text: await text('learn', ctx, explainTopicPrompt(ctx)) };

    case 'answer-followup':
      return { kind: 'followup-answer', text: await text('learn', ctx, followupPrompt(effect.question)) };

    case 'ask-practice':
      return { kind: 'practice-question', question: await text('socratic', ctx, askPracticePrompt(ctx, effect.index, state)) };

    case 'grade-practice': {
      const { output } = await generateText({
        model: modelFor('socratic'),
        system,
        prompt: gradePracticePrompt(effect.index, effect.answer, state),
        output: Output.object({ schema: practiceGradeSchema }),
      });
      return { kind: 'practice-grade', isCorrect: output.isCorrect, feedback: output.feedback };
    }

    case 'critique-explanation': {
      const { output } = await generateText({
        model: modelFor('critique'),
        system,
        prompt: critiquePrompt(effect.text),
        output: Output.object({ schema: critiqueSchema }),
      });
      return { kind: 'critique', critique: output.critique, conceptGaps: output.conceptGaps, englishNotes: output.englishNotes };
    }

    case 'generate-test': {
      const { output } = await generateText({
        model: modelFor('test-gen'),
        system,
        prompt: generateTestPrompt(ctx, state),
        output: Output.object({ schema: testQuestionsSchema }),
      });
      return { kind: 'test-questions', questions: output.questions };
    }

    case 'grade-test': {
      const { output } = await generateText({
        model: modelFor('grade'),
        system,
        prompt: gradeTestPrompt(state),
        output: Output.object({ schema: testGradeSchema }),
      });
      return { kind: 'test-grade', score: output.score, mistakes: output.mistakes };
    }

    case 'write-feedback':
      return { kind: 'feedback', summary: await text('feedback', ctx, feedbackPrompt(state)) };

    case 'finalize':
      return { kind: 'finalized' };
  }
}
