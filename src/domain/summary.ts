import { isLanguageDomain, type Domain } from '@/db/curriculum';

export type SkillGroup = { label: string; domain: Domain; score: number; count: number };

/** Average score per course (alphabetical), then English, then Communication. */
export function summarizeSkills(skills: { domain: Domain; courseName: string | null; score: number }[]): SkillGroup[] {
  const acc = new Map<string, { domain: Domain; total: number; count: number }>();
  for (const s of skills) {
    const label = isLanguageDomain(s.domain) ? (s.domain === 'english' ? 'English' : 'Communication') : (s.courseName ?? 'Other');
    const cur = acc.get(label) ?? { domain: s.domain, total: 0, count: 0 };
    acc.set(label, { domain: s.domain, total: cur.total + s.score, count: cur.count + 1 });
  }
  const groups = [...acc.entries()].map(([label, g]) => ({ label, domain: g.domain, score: Math.round(g.total / g.count), count: g.count }));
  const rank = (g: SkillGroup) => (g.domain === 'english' ? 1 : g.domain === 'communication' ? 2 : 0);
  return groups.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
