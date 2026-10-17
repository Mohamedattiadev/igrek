import type {
  AppErrorGroup,
  DockerContainer,
  DomainWatch,
  LogGroup,
  LogLine,
  LogSource,
  UptimeCheck,
  UptimeMonitor,
} from "@godeye/core";
import { request } from "./api";

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const del = (path: string) => request<{ ok: boolean }>(path, { method: "DELETE" });
const server = (serverId?: string) => (serverId ? `?server=${encodeURIComponent(serverId)}` : "");

export interface SavedLogSource {
  id: string;
  projectId?: string;
  source: LogSource;
}

export interface LogResult {
  lines: LogLine[];
  groups: LogGroup[];
  failed: { source: string; error: string }[];
}

/** The suite's operations tools (plan.md 12). */
export const opsApi = {
  uptime: () => request<UptimeMonitor[]>("/api/uptime"),
  addUptime: (body: { url: string; name?: string; projectId?: string; interval?: number }) =>
    post<UptimeMonitor>("/api/uptime", body),
  removeUptime: (id: string) => del(`/api/uptime/${id}`),
  checkUptime: (id: string) => post<UptimeMonitor | null>(`/api/uptime/${id}/check`),
  uptimeHistory: (id: string, hours = 24) => request<UptimeCheck[]>(`/api/uptime/${id}/history?hours=${hours}`),
  domains: () => request<DomainWatch[]>("/api/domains"),
  addDomain: (body: { host: string; projectId?: string }) => post<DomainWatch>("/api/domains", body),
  removeDomain: (id: string) => del(`/api/domains/${id}`),
  checkDomain: (id: string) => post<DomainWatch | null>(`/api/domains/${id}/check`),
  containers: (serverId?: string) => request<DockerContainer[]>(`/api/docker${server(serverId)}`),
  containerLogs: async (name: string, serverId?: string, tail = 300) => {
    const res = await fetch(
      `/api/docker/${encodeURIComponent(name)}/logs?tail=${tail}${serverId ? `&server=${encodeURIComponent(serverId)}` : ""}`,
      {
        credentials: "same-origin",
      },
    );
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
    return res.text();
  },
  containerAction: (name: string, action: "restart" | "stop" | "start", serverId?: string) =>
    post<{ output: string }>(`/api/docker/${encodeURIComponent(name)}/${action}${server(serverId)}`),
  logSources: (projectId?: string) =>
    request<SavedLogSource[]>(`/api/logs/sources${projectId ? `?projectId=${projectId}` : ""}`),
  logSuggestions: (projectId: string) => request<LogSource[]>(`/api/projects/${projectId}/log-suggestions`),
  addLogSource: (source: LogSource, projectId?: string) =>
    post<SavedLogSource>("/api/logs/sources", { source, projectId }),
  removeLogSource: (id: string) => del(`/api/logs/sources/${id}`),
  searchLogs: (body: { sources: LogSource[]; query?: string; level?: LogLine["level"]; tail?: number }) =>
    post<LogResult>("/api/logs/search", body),
  fixLogError: (body: { projectId: string; sample: string; sources: string[]; count: number }) =>
    post<{ runId: string }>("/api/logs/fix", body),
  appErrors: (projectId: string) => request<AppErrorGroup[]>(`/api/projects/${projectId}/errors`),
  errorSnippet: (projectId: string) =>
    request<{ browser: string; server: string }>(`/api/projects/${projectId}/errors/snippet`),
  setErrorStatus: (id: string, status: AppErrorGroup["status"]) => post(`/api/errors/${id}/status`, { status }),
  fixAppError: (id: string) => post<{ runId: string }>(`/api/errors/${id}/fix`),
};
