import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SessionRunner } from '@/components/session/session-runner';
import { loadSession } from '@/db/queries';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadSession(id);
  if (!loaded) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{loaded.course?.name ?? 'English'}</p>
          <h1 className="text-xl font-semibold tracking-tight">{loaded.skill.name}</h1>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Exit
        </Link>
      </header>
      <SessionRunner
        sessionId={loaded.session.id}
        topic={loaded.skill.name}
        courseName={loaded.course?.name ?? null}
        initialState={loaded.session.phaseState}
        initialMessages={loaded.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
      />
    </main>
  );
}
