/** Lessons book (plan.md 7.2): every mistake is written down once, so it is not made twice. */

export type LessonKind = "test" | "build" | "revert" | "wrong" | "error" | "manual";

export interface Lesson {
  id: string;
  projectId: string | null;
  kind: LessonKind;
  title: string;
  /** What happened → why → how it was fixed → how to avoid it next time. */
  what: string;
  why: string;
  fix: string;
  prevent: string;
  /** Where it was caught: "session:<id>", "commit:<hash>", "tool:test", "checkpoint:<id>". */
  source?: string;
  /** The same mistake seen again (merged into this lesson). */
  repeats: number;
  /** Times it was put in front of an AI before similar work. */
  uses: number;
  status: "active" | "rule" | "dismissed";
  /** Where it became a rule: "project" or a persona id. */
  ruleTarget?: string;
  createdAt: number;
  lastSeen: number;
  lastUsed?: number;
}

/** Lessons for the AI's context, short. */
export function lessonLines(lessons: Pick<Lesson, "title" | "prevent">[]): string {
  return lessons.map((l) => `- ${l.title}: ${l.prevent}`).join("\n");
}
