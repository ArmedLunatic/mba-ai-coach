import { ENGLISH_SKILLS } from '@/db/curriculum';
import type { SessionState } from '@/domain/session';
import type { CoachContext } from './context';

export function coachSystem(ctx: CoachContext): string {
  const language =
    ctx.level === 'beginner'
      ? 'The student is still building English confidence. Use simple English, short sentences, and one idea per sentence. Avoid idioms.'
      : 'Use clear, professional MBA-level English.';
  const weaknesses = ctx.recentMistakes.length
    ? `Known weaknesses on this topic: ${ctx.recentMistakes.join('; ')}.`
    : 'No prior weaknesses recorded for this topic.';
  return [
    `You are ${ctx.studentName}'s personal MBA coach.`,
    `Topic: ${ctx.topic}${ctx.courseName ? ` (course: ${ctx.courseName})` : ''}.`,
    language,
    weaknesses,
    'You coach rather than answer: teach, challenge, correct, and make the student think.',
    'Be concise. Never use emoji. Never mention that you are an AI.',
  ].join('\n');
}

export function explainTopicPrompt(ctx: CoachContext): string {
  if (ctx.isLanguage) {
    return `Explain the language point ${ctx.topic} in under 150 words. Give exactly two example sentences drawn from MBA writing: first one sentence that gets ${ctx.topic} wrong, then the same sentence corrected. Label them "Wrong:" and "Corrected:". End with one sentence on why this matters in MBA writing. Do not ask a question.`;
  }
  return `Explain ${ctx.topic} in under 180 words. Include one concrete business example. End with one sentence on why this matters for an MBA student. Do not ask a question.`;
}

export function followupPrompt(question: string): string {
  return `The student asks a follow-up: "${question}". Answer in under 120 words.`;
}

export function askPracticePrompt(ctx: CoachContext, index: number, state: SessionState): string {
  const prev = state.practice.questions[index - 1] ?? '';
  const answer = state.practice.answers[index - 1] ?? '';

  if (ctx.isLanguage) {
    if (index === 0) {
      return `Ask the student to write one business sentence that uses ${ctx.topic} correctly. Return only the request, phrased as a single question.`;
    }
    return `Earlier you asked: "${prev}". The student wrote: "${answer}". Now give one business sentence that gets ${ctx.topic} wrong and ask the student to fix it. Return only the request, phrased as a single question.`;
  }

  if (index === 0) {
    return 'Ask one Socratic question that tests whether the student understands the core idea of the topic. Return only the question.';
  }
  return `Earlier you asked: "${prev}". The student answered: "${answer}". Now ask one Socratic question that requires applying the topic to a business situation. Return only the question.`;
}

export function gradePracticePrompt(index: number, answer: string, state: SessionState): string {
  const question = state.practice.questions[index] ?? '';
  return `Question: "${question}"\nStudent answer: "${answer}"\nDecide whether the answer shows correct understanding (isCorrect). Write feedback in under 80 words: confirm what is right, then correct or extend one thing. If wrong, give a hint, not the full answer.`;
}

export function critiquePrompt(text: string): string {
  return [
    `The student explained the topic in their own words:\n"""${text}"""`,
    'Write a critique in under 120 words: what is accurate, what is missing or wrong.',
    'List up to 3 conceptGaps as short phrases.',
    `List up to 2 englishNotes only for clear or recurring language errors. Each note names the exact fix. The skill must be one of: ${ENGLISH_SKILLS.join(', ')}. Return an empty list if the English is fine.`,
  ].join('\n');
}

export function generateTestPrompt(ctx: CoachContext, state: SessionState): string {
  const gaps = state.explain.conceptGaps.length ? `Target these gaps: ${state.explain.conceptGaps.join('; ')}.` : '';
  if (ctx.isLanguage) {
    return `Write exactly 3 short items that test ${ctx.topic}: sentence-correction or fill-in-the-blank, each answerable in one sentence. Draw every sentence from MBA business writing. ${gaps}`;
  }
  return `Write exactly 3 short-answer exam questions on the topic, each answerable in 1-3 sentences. Mix one definition, one calculation-or-reasoning, and one application question. ${gaps}`;
}

export function gradeTestPrompt(state: SessionState): string {
  const pairs = state.test.questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${state.test.answers[i] ?? '(no answer)'}`)
    .join('\n');
  return `${pairs}\nScore the three answers together from 0 to 100. List up to 3 mistakes as short phrases in the form "confused X with Y" or "missed Z". Return an empty list if there are none.`;
}

export function feedbackPrompt(state: SessionState): string {
  const score = state.test.score ?? 0;
  const mistakes = state.test.mistakes.join('; ') || 'none';
  return `The student scored ${score}/100 on the test. Mistakes: ${mistakes}. Practice: ${state.practice.correct}/${state.practice.questions.length} correct. Concept gaps: ${state.explain.conceptGaps.join('; ') || 'none'}.\nWrite a summary in under 80 words, second person: what went well, then the single most important thing to work on next.`;
}
