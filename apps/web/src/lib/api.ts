import type {
  IndexStatus,
  ProjectDetail,
  ProjectListItem,
  SearchHit,
  SessionDetail,
  SessionListItem,
  SessionSummaryData,
  Settings,
  SystemStatus,
} from "@godeye/core";
import type { LanguageOption } from "@godeye/i18n";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Picks up the session cookie; call once before anything else. */
  bootstrap: () => request<{ ok: boolean }>("/api/session"),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  languages: () => request<LanguageOption[]>("/api/languages"),
  system: () => request<SystemStatus>("/api/system"),
  emergencyStop: () => request<{ stopped: number; stoppedAt: string }>("/api/emergency-stop", { method: "POST" }),
  indexStatus: () => request<IndexStatus>("/api/index/status"),
  projects: () => request<ProjectListItem[]>("/api/projects"),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  setProjectHidden: (id: string, hidden: boolean) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  projectSessions: (id: string) => request<SessionListItem[]>(`/api/projects/${id}/sessions`),
  projectContext: (id: string) => request<{ context: string }>(`/api/projects/${id}/context`),
  installHooks: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}/hooks`, { method: "POST" }),
  uninstallHooks: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}/hooks`, { method: "DELETE" }),
  session: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
  summarize: (id: string) => request<SessionSummaryData>(`/api/sessions/${id}/summarize`, { method: "POST" }),
  forget: (id: string) => request<{ ok: boolean }>(`/api/memory/${id}`, { method: "DELETE" }),
  search: (q: string) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
};
