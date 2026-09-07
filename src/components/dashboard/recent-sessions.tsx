import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RecentSession } from '@/db/queries';
import { formatDate } from '@/lib/format';

export function RecentSessions({ sessions }: { sessions: RecentSession[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet. Start one above.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>
                  {s.courseName ? `${s.courseName}: ` : ''}
                  {s.skillName}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.performance ?? '–'}% · {s.endedAt ? formatDate(s.endedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
