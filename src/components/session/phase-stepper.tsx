import type { Phase } from '@/domain/session';
import { cn } from '@/lib/utils';

const STEPS: { phase: Phase; label: string }[] = [
  { phase: 'learn', label: 'Learn' },
  { phase: 'practice', label: 'Practice' },
  { phase: 'explain', label: 'Explain' },
  { phase: 'test', label: 'Test' },
  { phase: 'feedback', label: 'Feedback' },
];

export function PhaseStepper({ phase }: { phase: Phase }) {
  const current = phase === 'done' ? STEPS.length : STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Session progress">
      {STEPS.map((s, i) => (
        <li key={s.phase} className="grid gap-1 text-center text-xs" aria-current={i === current ? 'step' : undefined}>
          <span className={cn('h-1 rounded-full', i < current ? 'bg-primary' : i === current ? 'bg-primary/60' : 'bg-muted')} />
          <span className={cn(i === current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
