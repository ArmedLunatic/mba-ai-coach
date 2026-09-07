import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { levelFor, type CoachContext } from '@/ai/context';
import { runEffect } from '@/ai/phases';
import {
  applySessionOutcome,
  countEnglishNotesSince,
  getEnglishSkillByName,
  getSessionMessages,
  getSkillObservations,
  getSkillPerformances,
  loadSession,
  saveSessionStep,
  type NewMessage,
} from '@/db/queries';
import { computeOutcome } from '@/domain/outcome';
import { apply, InvalidTransition, next } from '@/domain/session';
import { englishPenalty } from '@/domain/skills';
import { coachMessagesFor, pendingTestQuestion, studentMessageFor } from '@/domain/transcript';
import { now } from '@/lib/today';
import { sessionEventSchema } from './event-schema';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sessionEventSchema.safeParse(body?.event);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  const event = parsed.data;

  const loaded = await loadSession(id);
  if (!loaded) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const { session, skill, course, student } = loaded;

  const before = session.phaseState;
  let transition: ReturnType<typeof next>;
  try {
    transition = next(before, event);
  } catch (e) {
    if (e instanceof InvalidTransition) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  const observations = await getSkillObservations(skill.id, 5);
  const ctx: CoachContext = {
    studentName: student.name,
    level: levelFor(student.englishComfort),
    courseName: course?.name ?? null,
    topic: skill.name,
    recentMistakes: observations.map((o) => o.note),
  };

  let state = transition.state;
  const newMessages: NewMessage[] = [];
  const studentText = studentMessageFor(event);
  if (studentText) newMessages.push({ phase: before.phase, role: 'student', content: studentText });

  try {
    for (const effect of transition.effects) {
      if (effect.kind === 'finalize') continue;
      const result = await runEffect(effect, ctx, state);
      state = apply(state, result);
      for (const content of coachMessagesFor(result)) {
        newMessages.push({ phase: state.phase, role: 'coach', content });
      }
    }
  } catch (e) {
    console.error('session step failed', { id, event: event.type, error: e });
    return NextResponse.json({ error: 'The coach did not respond. Please try again.' }, { status: 502 });
  }

  const pending = pendingTestQuestion(before, state);
  if (pending) newMessages.push({ phase: 'test', role: 'coach', content: pending });

  await saveSessionStep(id, state, newMessages);

  if (state.phase === 'done') {
    const at = now();
    const prior = await getSkillPerformances(skill.id, 3);
    const outcome = computeOutcome(state, skill, prior);
    const englishPenalties = await Promise.all(
      state.explain.englishNotes.map(async (n) => {
        const englishSkill = await getEnglishSkillByName(student.id, n.skill);
        if (!englishSkill) return 0;
        return englishPenalty(await countEnglishNotesSince(englishSkill.id, new Date(at.getTime() - WEEK_MS)));
      }),
    );
    await applySessionOutcome({
      sessionId: id,
      skillId: skill.id,
      studentId: student.id,
      performance: outcome.performance,
      score: outcome.score,
      attempts: outcome.attempts,
      trend: outcome.trend,
      confidence: outcome.confidence,
      selfConfidence: state.feedback.selfConfidence ?? 3,
      summary: state.feedback.summary ?? '',
      mistakes: [...state.test.mistakes, ...state.explain.conceptGaps].slice(0, 5),
      englishNotes: state.explain.englishNotes,
      englishPenalties,
      now: at,
    });
    revalidatePath('/');
    revalidatePath('/progress');
  }

  const messages = await getSessionMessages(id);
  return NextResponse.json({ state, messages });
}
