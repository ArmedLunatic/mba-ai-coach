'use server';

import { redirect } from 'next/navigation';
import { createSession } from '@/db/queries';

export async function startSessionAction(skillId: string, _form: FormData): Promise<void> {
  const session = await createSession(skillId);
  redirect(`/session/${session.id}`);
}
