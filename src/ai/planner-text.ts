import { generateText, Output } from 'ai';
import type { Domain } from '@/db/curriculum';
import type { PlanItem } from '@/db/schema';
import { relativeDays } from '@/lib/format';
import { daysBetween } from '@/lib/today';
import { modelFor } from './router';
import { trendSchema } from './schemas';

export type GreetingInput = {
  name: string;
  items: PlanItem[];
  deadlines: { title: string; dueAt: Date }[];
  todayISO: string;
};

function nextDeadline(input: GreetingInput): string | null {
  const upcoming = input.deadlines
    .map((d) => ({ ...d, days: daysBetween(input.todayISO, d.dueAt) }))
    .filter((d) => d.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  return upcoming ? `${upcoming.title} is ${relativeDays(upcoming.days)}` : null;
}

export function fallbackGreeting(input: GreetingInput): string {
  const parts = [`Good morning, ${input.name}.`];
  const dl = nextDeadline(input);
  if (dl) parts.push(`${dl}.`);
  if (input.items[0]) parts.push(`Start with ${input.items[0].skillName} today.`);
  return parts.join(' ');
}

export async function generateGreeting(input: GreetingInput): Promise<string> {
  try {
    const dl = nextDeadline(input);
    const { text } = await generateText({
      model: modelFor('greeting'),
      system: 'You write a two-sentence morning note for an MBA student from their personal coach. Calm, specific, second person. No emoji, no exclamation marks, no bullet points.',
      prompt: [
        `Student: ${input.name}.`,
        dl ? `Next deadline: ${dl}.` : 'No upcoming deadlines.',
        `Today's plan: ${input.items.map((i) => `${i.skillName} (${i.minutes} min, ${i.reason})`).join('; ')}.`,
        'Write the note. Mention the deadline if there is one and the first task.',
      ].join('\n'),
    });
    const out = text.trim();
    return out.length > 0 ? out : fallbackGreeting(input);
  } catch {
    return fallbackGreeting(input);
  }
}

export type TrendInput = {
  skills: { name: string; domain: Domain; score: number; trend: 'up' | 'flat' | 'down' }[];
  observations: { skillName: string; kind: string; note: string }[];
};

export function fallbackTrend(input: TrendInput): string[] {
  const weakest = [...input.skills].sort((a, b) => a.score - b.score)[0];
  return weakest ? [`Your biggest current weakness is ${weakest.name}.`] : [];
}

export async function generateTrendSentences(input: TrendInput): Promise<string[]> {
  if (input.skills.length === 0) return [];
  try {
    const { output } = await generateText({
      model: modelFor('trend'),
      system: 'You summarise an MBA student\'s learning trends for their personal coach dashboard. Second person, calm, specific. No emoji.',
      prompt: [
        'Skills (name, domain, score /100, trend):',
        ...input.skills.map((s) => `- ${s.name} | ${s.domain} | ${s.score} | ${s.trend}`),
        'Observations from the last 7 days:',
        ...(input.observations.length ? input.observations.map((o) => `- ${o.skillName} (${o.kind}): ${o.note}`) : ['- none']),
        'Write 2 or 3 sentences: one clear improvement if any, the biggest current weakness, and one recurring mistake if any.',
      ].join('\n'),
      output: Output.object({ schema: trendSchema }),
    });
    return output.sentences;
  } catch {
    return fallbackTrend(input);
  }
}
