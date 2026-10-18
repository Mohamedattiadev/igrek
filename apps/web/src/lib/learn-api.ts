import type {
  ApiVersionIssue,
  LatestInfo,
  LearnHit,
  LearnState,
  ProjectTech,
  RoadmapInfo,
  ServedRoadmap,
  ServedSheet,
  SheetInfo,
  Stage,
  Text,
} from "@godeye/learn";
import { request } from "./api";

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const q = (lang: string) => `?lang=${encodeURIComponent(lang)}`;

export interface StageCheck {
  stage: Stage;
  state: "done" | "missing" | "unknown";
  reason: string;
  link?: string;
}

export const learnApi = {
  apiVersions: (sessionId: string) => request<ApiVersionIssue[]>(`/api/sessions/${sessionId}/api-versions`),
  index: (lang: string) =>
    request<{ sheets: SheetInfo[]; roadmaps: RoadmapInfo[]; latest: LatestInfo[]; state: LearnState; errors: number }>(
      `/api/learn${q(lang)}`,
    ),
  search: (query: string, lang: string) =>
    request<LearnHit[]>(`/api/learn/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`),
  sheet: (id: string, lang: string) =>
    request<{ sheet: ServedSheet; translation?: Record<string, string> }>(`/api/learn/sheets/${id}${q(lang)}`),
  roadmap: (id: string, lang: string) =>
    request<{ roadmap: ServedRoadmap; translation?: Record<string, string> }>(`/api/learn/roadmaps/${id}${q(lang)}`),
  translate: (kind: "sheet" | "roadmap", id: string, lang: string) =>
    post<Record<string, string>>("/api/learn/translate", { kind, id, lang }),
  mark: (kind: "favorite" | "note" | "report" | "done", key: string, value: string | boolean) =>
    post<LearnState>("/api/learn/mark", { kind, key, value }),
  checkLatest: () => post<LatestInfo[]>("/api/learn/latest", {}),
  what: (code: string, fileLang: string | undefined, explain: boolean) =>
    post<{ hits: LearnHit[]; answer?: string }>("/api/learn/what", { code, fileLang, explain }),
  techs: (projectId: string) => request<ProjectTech[]>(`/api/projects/${projectId}/learn`),
  stages: (projectId: string) => request<StageCheck[]>(`/api/projects/${projectId}/learn/stages`),
  practice: (roadmap: string) => post<{ projectId: string; path: string }>("/api/learn/practice", { roadmap }),
  doStep: (roadmap: string, step: string, projectId: string) =>
    post<{ runId: string }>("/api/learn/do", { roadmap, step, projectId }),
};

/**
 * Text in the reader's language: Turkish and English are written by hand; any other language
 * uses the cached machine translation by path, falling back to English.
 */
export function textIn(lang: string, translation?: Record<string, string>) {
  return (text: Text | undefined, path: string): string => {
    if (!text) return "";
    if (lang === "tr") return text.tr;
    if (lang === "en") return text.en;
    return translation?.[path] ?? text.en;
  };
}

/** Options of a quiz question in the reader's language. */
export function optionsIn(
  lang: string,
  options: { en: string[]; tr: string[] },
  path: string,
  translation?: Record<string, string>,
): string[] {
  if (lang === "tr") return options.tr;
  if (lang === "en") return options.en;
  return options.en.map((o, i) => translation?.[`${path}.en.${i}`] ?? o);
}

/** Where a search hit lives in the learning center. */
export function hitLink(h: Pick<LearnHit, "kind" | "sheet" | "roadmap" | "id">): string {
  if (h.kind === "sheet") return `/learn/s/${h.id}`;
  if (h.kind === "step") return `/learn/r/${h.roadmap}?step=${h.id}`;
  return `/learn/s/${h.sheet}#${h.id}`;
}
