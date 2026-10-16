/** Category pages and evidence-based scores (plan.md Faz 5). */

export const CATEGORIES = [
  "architecture",
  "frontend",
  "uiux",
  "backend",
  "database",
  "devops",
  "security",
  "testing",
  "performance",
  "docs",
  "dependencies",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Evidence {
  path: string;
  line?: number;
  /** Short, safe detail (never a secret value). */
  note?: string;
}

export interface Finding {
  /** Stable id, also the i18n key: insight.check.<id>.title / .fix */
  id: string;
  category: Category;
  status: "pass" | "warn" | "fail";
  /** 0–1: how much of this check is satisfied. */
  value: number;
  weight: number;
  /** Points the category score would gain if this were fixed. */
  gain: number;
  /** Measured number for the text, e.g. "12%" or "4". */
  metric?: string;
  evidence: Evidence[];
}

export interface CategoryScore {
  category: Category;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: Finding[];
  /** Files that belong to this part of the project (first ones). */
  files: string[];
  fileCount: number;
}

export interface DiagramSet {
  architecture?: string;
  database?: string;
}

export interface InsightScan {
  projectId: string;
  at: number;
  overall: number;
  grade: CategoryScore["grade"];
  categories: CategoryScore[];
  diagrams: DiagramSet;
  fileCount: number;
}

export interface CategoryExplanation {
  /** "How does this part work?" in plain words. */
  how: string;
  parts: { name: string; what: string }[];
  /** Why the score is what it is, in one or two sentences. */
  score: string;
}

export interface CategoryDetail extends CategoryScore {
  explanation?: Record<string, CategoryExplanation>;
  explainedAt?: number;
  trend: { at: number; score: number }[];
  sessions: { id: string; title: string; updatedAt: number; author?: string }[];
}

export function gradeOf(score: number): CategoryScore["grade"] {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}
