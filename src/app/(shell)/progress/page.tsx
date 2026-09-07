import { redirect } from 'next/navigation';
import { generateTrendSentences } from '@/ai/planner-text';
import { SkillGroupCard } from '@/components/progress/skill-group';
import { getObservationsSince, getSkills, getStudent } from '@/db/queries';
import { summarizeSkills } from '@/domain/summary';
import { now } from '@/lib/today';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function ProgressPage() {
  const student = await getStudent();
  if (!student) redirect('/onboarding');

  const at = now();
  const [skills, recentObs, weekObs] = await Promise.all([
    getSkills(student.id),
    getObservationsSince(student.id, new Date(at.getTime() - 30 * DAY_MS)),
    getObservationsSince(student.id, new Date(at.getTime() - 7 * DAY_MS)),
  ]);

  const sentences = await generateTrendSentences({
    skills: skills.map((s) => ({ name: s.name, domain: s.domain, score: s.score, trend: s.trend })),
    observations: weekObs.map((o) => ({ skillName: o.skillName, kind: o.kind, note: o.note })),
  });

  const observationsBySkill = new Map<string, string[]>();
  for (const o of recentObs) observationsBySkill.set(o.skillId, [...(observationsBySkill.get(o.skillId) ?? []), o.note]);

  const groups = summarizeSkills(skills);
  const skillsFor = (label: string, domain: string) =>
    skills.filter((s) => (domain === 'english' || domain === 'communication' ? s.domain === domain : s.courseName === label));

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        {sentences.length > 0 && (
          <ul className="mt-3 grid max-w-2xl gap-1 text-sm">
            {sentences.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <SkillGroupCard key={g.label} label={g.label} score={g.score} skills={skillsFor(g.label, g.domain)} observationsBySkill={observationsBySkill} />
        ))}
      </div>
    </div>
  );
}
