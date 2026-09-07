import { startSessionAction } from '@/app/(shell)/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TodayPlan } from '@/lib/plan';

export function TodayPlanCard({ plan }: { plan: TodayPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended today</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {plan.items.map((item, i) => (
          <div key={item.skillId} className="flex items-center gap-4 rounded-md border border-border p-3">
            <span className="w-5 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {item.courseName ? `${item.courseName}: ` : ''}
                {item.skillName}
              </div>
              <div className="text-xs text-muted-foreground">
                {item.minutes} min · {item.reason}
              </div>
            </div>
            {item.done ? (
              <Badge variant="secondary">Done</Badge>
            ) : (
              <form action={startSessionAction.bind(null, item.skillId)}>
                <Button type="submit" size="sm">
                  Start
                </Button>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
