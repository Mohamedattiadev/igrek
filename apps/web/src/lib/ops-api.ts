import type {
  AnalyticsSource,
  AnalyticsSummary,
  AppErrorGroup,
  ArenaMatch,
  ArenaStat,
  BackupJob,
  BackupRun,
  Board,
  BoardVersion,
  CalendarItem,
  CodeHostInfo,
  CostItem,
  CostSummary,
  DataAnomaly,
  DbConnection,
  DbResult,
  DbSuggestion,
  DbTable,
  DockerContainer,
  DomainWatch,
  HostIssue,
  HostPull,
  HostRun,
  LogGroup,
  LogLine,
  LogSource,
  PluginInfo,
  TimeReport,
  UptimeCheck,
  UptimeMonitor,
  VaultEntry,
  WikiPage,
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

/** Databases and backups (plan.md 12). */
export const dataApi = {
  databases: () => request<DbConnection[]>("/api/databases"),
  suggestions: (projectId: string) => request<DbSuggestion[]>(`/api/projects/${projectId}/database-suggestions`),
  addDatabase: (body: {
    name?: string;
    address?: string;
    projectId?: string;
    prod?: boolean;
    from?: DbSuggestion["source"];
  }) => post<DbConnection & { test: { ok: boolean; version?: string; error?: string } }>("/api/databases", body),
  updateDatabase: (id: string, patch: { name?: string; prod?: boolean; readOnly?: boolean }) =>
    request<DbConnection>(`/api/databases/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeDatabase: (id: string) => del(`/api/databases/${id}`),
  testDatabase: (id: string) => post<{ ok: boolean; version?: string; error?: string }>(`/api/databases/${id}/test`),
  tables: (id: string) => request<DbTable[]>(`/api/databases/${id}/tables`),
  diagram: (id: string) => request<{ mermaid: string }>(`/api/databases/${id}/diagram`),
  rows: (id: string, table: string, schema?: string, page = 0) =>
    request<DbResult>(
      `/api/databases/${id}/rows?table=${encodeURIComponent(table)}${schema ? `&schema=${encodeURIComponent(schema)}` : ""}&page=${page}`,
    ),
  /** A failed query keeps the server's code ("confirm", "read_only") on the error. */
  query: async (id: string, query: string, allowWrite = false): Promise<DbResult> => {
    const res = await fetch(`/api/databases/${id}/query`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, allowWrite }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { code: body.code });
    return body as DbResult;
  },
  anomalies: async (id: string, confirmProd = false): Promise<DataAnomaly[]> => {
    const res = await fetch(`/api/databases/${id}/anomalies`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmProd }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { code: body.code });
    return body as DataAnomaly[];
  },
  explainDraft: (id: string, query: string) =>
    post<{ kind: string; prod: boolean; query: string; schema: string; plan?: string; projectId?: string }>(
      `/api/databases/${id}/explain-draft`,
      { query },
    ),
  backups: () => request<BackupJob[]>("/api/backups"),
  addBackup: (job: Omit<BackupJob, "id" | "createdAt">) => post<BackupJob>("/api/backups", job),
  removeBackup: (id: string, files = false) => del(`/api/backups/${id}${files ? "?files=1" : ""}`),
  backupRuns: (id: string) => request<BackupRun[]>(`/api/backups/${id}/runs`),
  runBackup: (id: string) => post<BackupRun>(`/api/backups/${id}/run`),
  verifyBackup: (runId: string) => post<BackupRun>(`/api/backup-runs/${runId}/verify`),
  restoreBackup: (runId: string) => post<{ file: string }>(`/api/backup-runs/${runId}/restore`),
};

/** Project wiki and whiteboards (plan.md 12). */
export const docsApi = {
  pages: (projectId: string) => request<WikiPage[]>(`/api/projects/${projectId}/wiki`),
  savePage: (projectId: string, page: { id?: string; title: string; body: string }) =>
    post<WikiPage>(`/api/projects/${projectId}/wiki`, page),
  removePage: (id: string) => del(`/api/wiki/${id}`),
  pageContext: (id: string) =>
    request<{
      backlinks: { id: string; title: string }[];
      missing: string[];
      memory: { id: string; section: string; text: string }[];
    }>(`/api/wiki/${id}/context`),
  boards: (projectId: string, category?: string) =>
    request<Board[]>(`/api/projects/${projectId}/boards${category ? `?category=${category}` : ""}`),
  createBoard: (projectId: string, body: { title: string; category?: string }) =>
    post<Board>(`/api/projects/${projectId}/boards`, body),
  board: (id: string) => request<Board & { scene: string }>(`/api/boards/${id}`),
  saveBoard: (id: string, body: { scene?: string; title?: string; category?: string | null }) =>
    request<Board>(`/api/boards/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  removeBoard: (id: string) => del(`/api/boards/${id}`),
  versions: (id: string) => request<BoardVersion[]>(`/api/boards/${id}/versions`),
  restoreVersion: (id: string, version: string) => post<Board>(`/api/boards/${id}/versions/${version}/restore`),
  ask: (id: string, body: { mode: string; png?: string; elements?: unknown[]; language: string; question?: string }) =>
    post<{ answer: string; mermaid?: string }>(`/api/boards/${id}/ask`, body),
  draw: (
    projectId: string,
    body: { what: "schema" | "architecture" | "flow"; connectionId?: string; prompt?: string; language: string },
  ) => post<{ mermaid: string }>(`/api/projects/${projectId}/draw`, body),
};

/** GitHub / GitLab of a project (plan.md 12). */
export const hostApi = {
  info: (projectId: string) => request<CodeHostInfo>(`/api/projects/${projectId}/host`),
  issues: (projectId: string) => request<HostIssue[]>(`/api/projects/${projectId}/host/issues`),
  pulls: (projectId: string) => request<HostPull[]>(`/api/projects/${projectId}/host/pulls`),
  runs: (projectId: string) => request<HostRun[]>(`/api/projects/${projectId}/host/runs`),
  prDiff: async (projectId: string, number: number) => {
    const res = await fetch(`/api/projects/${projectId}/host/pulls/${number}/diff`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
    return res.text();
  },
  review: (projectId: string, number: number, action: "approve" | "changes" | "comment", body: string) =>
    post<{ ok: boolean }>(`/api/projects/${projectId}/host/pulls/${number}/review`, { action, body }),
  toTask: (projectId: string, number: number, start: boolean) =>
    post<{ taskId: string; runId?: string }>(`/api/projects/${projectId}/host/issues/${number}/task`, { start }),
};

export const calendarApi = {
  items: (from: number, to: number, projectId?: string) =>
    request<CalendarItem[]>(`/api/calendar?from=${from}&to=${to}${projectId ? `&projectId=${projectId}` : ""}`),
  add: (body: { kind: string; title: string; at: number; projectId?: string }) =>
    post<CalendarItem>("/api/calendar", body),
  remove: (id: string) => del(`/api/calendar/${id}`),
  setDone: (id: string, done: boolean) =>
    request<{ ok: boolean }>(`/api/calendar/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
};

export const vaultApi = {
  list: () => request<VaultEntry[]>("/api/vault"),
  add: (body: { name: string; value: string; note?: string; projectId?: string }) =>
    post<{ id: string }>("/api/vault/items", body),
  remove: (id: string) => del(`/api/vault/items/${id}`),
  rotation: (ref: string, days: number) => post("/api/vault/rotation", { ref, days }),
  rotated: (ref: string) => post("/api/vault/rotation", { ref, rotated: true }),
  reveal: (ref: string) => post<{ value: string }>("/api/vault/reveal", { ref }),
};

export const costApi = {
  list: () => request<CostItem[]>("/api/costs"),
  summary: (currency: string) => request<CostSummary>(`/api/costs/summary?currency=${currency}`),
  suggestions: () =>
    request<{ name: string; category: CostItem["category"]; period: CostItem["period"] }[]>("/api/costs/suggestions"),
  add: (item: Partial<CostItem>) => post<CostItem>("/api/costs", item),
  update: (id: string, item: Partial<CostItem>) =>
    request<CostItem>(`/api/costs/${id}`, { method: "PUT", body: JSON.stringify(item) }),
  remove: (id: string) => del(`/api/costs/${id}`),
};

export const analyticsApi = {
  summary: (projectId: string) => request<AnalyticsSummary & { draft: string }>(`/api/projects/${projectId}/analytics`),
  setSource: (projectId: string, source: AnalyticsSource | null) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/analytics/source`, {
      method: "PUT",
      body: JSON.stringify(source),
    }),
};

export const pluginApi = {
  list: () => request<PluginInfo[]>("/api/plugins"),
  install: (source: string) => post<PluginInfo>("/api/plugins", { source }),
  setEnabled: (id: string, enabled: boolean) => post(`/api/plugins/${id}/enabled`, { enabled }),
  remove: (id: string) => del(`/api/plugins/${id}`),
  run: (id: string, command: string, projectId: string) =>
    post<{ id: string }>(`/api/plugins/${id}/commands/${command}`, { projectId }),
};

export const arenaApi = {
  list: (projectId?: string) =>
    request<{ matches: ArenaMatch[]; stats: ArenaStat[]; models: string[] }>(
      `/api/arena${projectId ? `?projectId=${projectId}` : ""}`,
    ),
  start: (body: { projectId: string; request: string; models: string[] }) => post<ArenaMatch>("/api/arena", body),
  pick: (id: string, model: string) => post<ArenaMatch>(`/api/arena/${id}/pick`, { model }),
};

export const timeApi = {
  report: (from: number, to: number) => request<TimeReport>(`/api/time?from=${from}&to=${to}`),
};
