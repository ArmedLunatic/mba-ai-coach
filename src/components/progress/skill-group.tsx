import { SkillBar } from '@/components/skill-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SkillWithCourse } from '@/db/queries';
import { formatDate } from '@/lib/format';

export function SkillGroupCard({
  label,
  score,
  skills,
  observationsBySkill,
}: {
  label: string;
  score: number;
  skills: SkillWithCourse[];
  observationsBySkill: Map<string, string[]>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle>{label}</CardTitle>
        <span className="text-sm tabular-nums text-muted-foreground">{score}%</span>
      </CardHeader>
      <CardContent className="grid gap-5">
        {skills.map((s) => {
          const notes = observationsBySkill.get(s.id) ?? [];
          const meta = [
            `${s.attempts} ${s.attempts === 1 ? 'attempt' : 'attempts'}`,
            s.lastPracticedAt ? `last practiced ${formatDate(s.lastPracticedAt)}` : 'not practiced yet',
          ].join(' · ');
          return (
            <div key={s.id} className="grid gap-1">
              <SkillBar label={s.name} score={s.score} trend={s.trend} meta={meta} />
              {notes.length > 0 && (
                <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                  {notes.slice(0, 3).map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
