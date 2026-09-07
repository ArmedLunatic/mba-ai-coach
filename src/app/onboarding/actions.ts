'use server';

import { redirect } from 'next/navigation';
import { createStudent, getStudent } from '@/db/queries';
import { parseOnboarding } from './schema';

export type ActionState = { error?: string };

export async function createStudentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (await getStudent()) redirect('/');
  const parsed = parseOnboarding(form);
  if (!parsed.ok) return { error: parsed.error };
  await createStudent(parsed.value);
  redirect('/');
}
