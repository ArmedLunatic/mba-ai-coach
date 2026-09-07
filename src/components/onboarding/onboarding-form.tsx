'use client';

import { useActionState } from 'react';
import { createStudentAction, type ActionState } from '@/app/onboarding/actions';
import { MAX_DEADLINES, STUDY_TIMES } from '@/app/onboarding/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COURSES } from '@/db/curriculum';

const COMFORT = [
  { value: 1, label: 'I struggle to follow lectures' },
  { value: 2, label: 'I understand, but speaking and writing are hard' },
  { value: 3, label: 'Comfortable, with frequent small mistakes' },
  { value: 4, label: 'Confident, occasional mistakes' },
  { value: 5, label: 'Fluent' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createStudentAction, {});

  return (
    <form action={action} className="grid gap-6">
      <Section title="About you">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={60} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="program">MBA program</Label>
            <Input id="program" name="program" placeholder="Full-time MBA" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="semester">Current semester</Label>
            <Input id="semester" name="semester" placeholder="Semester 1" required />
          </div>
        </div>
      </Section>

      <Section title="Courses this semester">
        <div className="grid gap-2 sm:grid-cols-2">
          {COURSES.map((c) => (
            <label key={c.slug} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="checkbox" name="courses" value={c.slug} className="size-4 accent-primary" />
              <span className="font-medium">{c.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{c.topics.length} topics</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="English comfort">
        <div className="grid gap-2">
          {COMFORT.map((c) => (
            <label key={c.value} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="radio" name="englishComfort" value={c.value} defaultChecked={c.value === 3} className="accent-primary" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Goals">
        <div className="grid gap-2">
          <Label htmlFor="academicGoals">Academic goals</Label>
          <Textarea id="academicGoals" name="academicGoals" rows={2} maxLength={300} placeholder="Top quartile in Finance; lead a case discussion" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="careerGoals">Career goals</Label>
          <Textarea id="careerGoals" name="careerGoals" rows={2} maxLength={300} placeholder="Strategy consulting" />
        </div>
        <div className="grid gap-2">
          <Label>When do you usually study?</Label>
          <div className="flex flex-wrap gap-2">
            {STUDY_TIMES.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm capitalize">
                <input type="checkbox" name="studyTimes" value={t} className="accent-primary" />
                {t}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Upcoming deadlines (optional)">
        {Array.from({ length: MAX_DEADLINES }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <Input name={`deadline.title.${i}`} placeholder="Finance midterm" aria-label={`Deadline ${i + 1} title`} />
            <select name={`deadline.course.${i}`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label={`Deadline ${i + 1} course`}>
              <option value="">No course</option>
              {COURSES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name={`deadline.kind.${i}`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" aria-label={`Deadline ${i + 1} kind`}>
              <option value="exam">Exam</option>
              <option value="assignment">Assignment</option>
              <option value="class">Class</option>
              <option value="presentation">Presentation</option>
            </select>
            <Input type="date" name={`deadline.date.${i}`} aria-label={`Deadline ${i + 1} date`} />
          </div>
        ))}
      </Section>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Setting up your coach…' : 'Build my dashboard'}
      </Button>
    </form>
  );
}
