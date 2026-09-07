export type CoachContext = {
  studentName: string;
  level: 'beginner' | 'mba';
  courseName: string | null;
  topic: string;
  /** Prior observations for this skill, newest first, max 5. */
  recentMistakes: string[];
  /** True for English and Communication skills, which are taught as language points rather than MBA concepts. */
  isLanguage: boolean;
};

export function levelFor(englishComfort: number): 'beginner' | 'mba' {
  return englishComfort <= 2 ? 'beginner' : 'mba';
}
