export type CoachContext = {
  studentName: string;
  level: 'beginner' | 'mba';
  courseName: string | null;
  topic: string;
  /** Prior observations for this skill, newest first, max 5. */
  recentMistakes: string[];
};

export function levelFor(englishComfort: number): 'beginner' | 'mba' {
  return englishComfort <= 2 ? 'beginner' : 'mba';
}
