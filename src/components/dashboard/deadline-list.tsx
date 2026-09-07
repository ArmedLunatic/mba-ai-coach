import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Deadline } from '@/db/schema';
import { formatDate, relativeDays } from '@/lib/format';
import { daysBetween } from '@/lib/today';

export function DeadlineList({ deadlines, todayISO }: { deadlines: Deadline[]; todayISO: string }) {
  const upcoming = deadlines.filter((d) => daysBetween(todayISO, d.dueAt) >= 0).slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming</CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deadlines yet.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {upcoming.map((d) => {
              const days = daysBetween(todayISO, d.dueAt);
              return (
                <li key={d.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{d.title}</span>
                    <span className="ml-2 text-xs capitalize text-muted-foreground">{d.kind}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(d.dueAt)} · {relativeDays(days)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
