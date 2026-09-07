import { SkillBar } from '@/components/skill-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SkillGroup } from '@/domain/summary';

export function SkillSnapshot({ groups }: { groups: SkillGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.map((g) => (
          <SkillBar key={g.label} label={g.label} score={g.score} />
        ))}
      </CardContent>
    </Card>
  );
}
