import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

export function SkillBar({ label, score, trend, meta }: { label: string; score: number; trend?: 'up' | 'flat' | 'down'; meta?: string }) {
  const Icon = trend ? TREND_ICON[trend] : null;
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 font-medium">
          {label}
          {Icon && <Icon className="size-4 text-muted-foreground" aria-label={`trend ${trend}`} />}
        </span>
        <span className="tabular-nums text-muted-foreground">{score}%</span>
      </div>
      <Progress value={score} aria-label={`${label} ${score} percent`} />
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
    </div>
  );
}
