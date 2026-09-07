import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { runEffect } from '@/ai/phases';
import {
  applySessionOutcome,
  getSessionMessages,
  getSkillObservations,
  getSkillPerformances,
  loadSession,
  saveSessionStep,
} from '@/db/queries';
import { now } from '@/lib/today';
import { sessionEventSchema } from './event-schema';
import { runSessionStep } from './run';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = sessionEventSchema.safeParse(body?.event);
  if (!parsed.success) return NextResponse.json({ error: 'That request could not be understood. Reload the page and try again.' }, { status: 400 });

  const loaded = await loadSession(id);
  if (!loaded) return NextResponse.json({ error: 'This session could not be found. Return to the dashboard to start a new one.' }, { status: 404 });

  const result = await runSessionStep(loaded, parsed.data, {
    runEffect,
    getSkillObservations,
    getSkillPerformances,
    saveSessionStep,
    applySessionOutcome,
    getSessionMessages,
    now,
  });

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.state.phase === 'done') {
    revalidatePath('/');
    revalidatePath('/progress');
  }
  return NextResponse.json({ state: result.state, messages: result.messages });
}
