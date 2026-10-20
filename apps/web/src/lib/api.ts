import type {
  Account,
  AiTool,
  Approval,
  AskAnswer,
  BoardTask,
  Briefing,
  CatalogEntry,
  Category,
  CategoryDetail,
  ChatInfo,
  ChatMode,
  ChatTodo,
  Checkpoint,
  CommandRisk,
  CoverageMap,
  DeployCheck,
  DeployRecord,
  DevServerInfo,
  Digest,
  EmbedderStatus,
  EnhanceResult,
  EnhanceStats,
  EnvBackup,
  EnvChange,
  EnvironmentInfo,
  EnvironmentState,
  EnvOverview,
  ExpertsState,
  FileContent,
  FileEntry,
  FlowRun,
  GitChange,
  GitInfo,
  HttpResponse,
  HubAlertInfo,
  Idea,
  IdeaReview,
  IdeaStatus,
  ImportEstimate,
  ImportStatus,
  InboxNotice,
  IndexStatus,
  InsightConfig,
  InsightScan,
  KeyRequest,
  KnowledgeOverview,
  KnowledgeSources,
  Lesson,
  LibraryHit,
  LibraryItem,
  LibrarySuggestion,
  LimitsOverview,
  Meeting,
  MemorySection,
  MonthlyReport,
  PackageComparison,
  PackPreview,
  Persona,
  PersonaOpinion,
  PersonaScore,
  PickedElement,
  Presence,
  ProjectDetail,
  ProjectListItem,
  ProjectNeeds,
  QuickAnswer,
  QuickEdit,
  RecentChat,
  RemoteEntry,
  RemoteRun,
  SavedPrompt,
  Schedule,
  ScheduleWhen,
  SearchHit,
  ServerHealth,
  ServerInfo,
  SessionDetail,
  SessionListItem,
  SessionSummaryData,
  Settings,
  ShareLevel,
  SharePreview,
  SystemStatus,
  TaskStatus,
  TeamActivity,
  TeamAuditEntry,
  TeamDevice,
  TeamInvite,
  TeamStatus,
  TeamUser,
  TerminalInfo,
  TerminalTool,
  TesterProfile,
  TesterRun,
  TimelineEntry,
  TodaySummary,
  ToolKind,
  ToolPlan,
  ToolResult,
  TrashItem,
  VisualCheck,
  WeakPoint,
} from "@igrek/core";
import type { LanguageOption } from "@igrek/i18n";
import i18n from "./i18n";

export interface PackStatus {
  code: string;
  bundled: boolean;
  state: "bundled" | "none" | "ready" | "partial" | "generating" | "failed";
  done: number;
  total: number;
  error?: string;
}

export interface DependencyReport {
  projectId: string;
  at: number;
  deps: {
    name: string;
    ecosystem: "npm" | "PyPI";
    current: string;
    latest?: string;
    outdated: "major" | "minor" | "patch" | "none" | "unknown";
    vulns: { id: string; summary: string; severity?: string }[];
  }[];
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  upstream?: string;
  at: number;
  subject: string;
}

export interface BlameLine {
  line: number;
  hash: string;
  author: string;
  at: number;
  summary: string;
  session?: { id: string; title: string; tool: string; author?: string };
}

/** Errors that don't blame, and say what to do (plan.md 7.0). Specific server messages pass through. */
function friendly(status: number | undefined, message?: string): string {
  const t = i18n.t.bind(i18n);
  if (status === undefined) return t("errors.offline");
  if (status === 401) return t("errors.signedOut");
  if (status === 404 && (!message || /^not found$/i.test(message))) return t("errors.notFound");
  if (status === 429) return t("errors.tooMany");
  if (status >= 500 && !message) return t("errors.server");
  return message ?? t("errors.server");
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(friendly(undefined));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(friendly(res.status, body.error));
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
  translate: (texts: string[], force = false) =>
    request<{ to: string; texts: (string | undefined)[] }>("/api/translate", {
      method: "POST",
      body: JSON.stringify({ texts, force }),
    }),
  languagePack: (code: string) =>
    request<{ status: PackStatus; messages: Record<string, unknown> }>(`/api/i18n/${code}`),
  generatePack: (code: string) => request<PackStatus>(`/api/i18n/${code}/generate`, { method: "POST" }),
  packRows: (code: string) =>
    request<{ key: string; en: string; text: string; corrected: boolean }[]>(`/api/i18n/${code}/rows`),
  fixTranslation: (code: string, key: string, text: string | null) =>
    request<{ ok: boolean }>(`/api/i18n/${code}/override`, { method: "PUT", body: JSON.stringify({ key, text }) }),
  system: () => request<SystemStatus>("/api/system"),
  emergencyStop: () => request<{ stopped: number; stoppedAt: string }>("/api/emergency-stop", { method: "POST" }),
  indexStatus: () => request<IndexStatus>("/api/index/status"),
  projects: () => request<ProjectListItem[]>("/api/projects"),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  setGitFlow: (id: string, gitFlow: boolean) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ gitFlow }) }),
  setProjectHidden: (id: string, hidden: boolean) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  setProjectStatus: (id: string, status: "active" | "paused" | "archived") =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  projectSessions: (id: string) => request<SessionListItem[]>(`/api/projects/${id}/sessions`),
  projectContext: (id: string) => request<{ context: string }>(`/api/projects/${id}/context`),
  projectTrust: (id: string) =>
    request<{
      extensions: { hooks: string[]; mcpServers: string[]; skills: string[]; fingerprint: string } | null;
      trusted: boolean;
    }>(`/api/projects/${id}/trust`),
  setProjectTrust: (id: string, trust: boolean) =>
    request<{ ok: boolean }>(`/api/projects/${id}/trust`, { method: "POST", body: JSON.stringify({ trust }) }),
  commitHook: (id: string) =>
    request<{ state: "none" | "ours" | "other" | "noGit"; commands: string[] }>(`/api/projects/${id}/commit-hook`),
  setCommitHook: (id: string, on: boolean) =>
    request<{ state: "none" | "ours" | "other" | "noGit"; commands: string[] }>(`/api/projects/${id}/commit-hook`, {
      method: "POST",
      body: JSON.stringify({ on }),
    }),
  toolRules: (id: string) => request<string[]>(`/api/projects/${id}/tool-rules`),
  removeToolRule: (id: string, rule: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}/tool-rules?rule=${encodeURIComponent(rule)}`, { method: "DELETE" }),
  installHooks: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}/hooks`, { method: "POST" }),
  uninstallHooks: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}/hooks`, { method: "DELETE" }),
  session: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
  summarize: (id: string) => request<SessionSummaryData>(`/api/sessions/${id}/summarize`, { method: "POST" }),
  forget: (id: string) => request<{ ok: boolean }>(`/api/memory/${id}`, { method: "DELETE" }),
  search: (q: string) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  /** "one": the folder is one project; "folder": each folder inside it is a project. */
  addProject: (path: string, as: "one" | "folder" = "one") =>
    request<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify({ path, as }) }),
  renameProject: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  fetchRemote: (id: string) => request<{ git: GitInfo }>(`/api/projects/${id}/fetch`, { method: "POST" }),
  timeline: (id: string) => request<TimelineEntry[]>(`/api/projects/${id}/timeline`),
  digests: (id: string) => request<Digest[]>(`/api/projects/${id}/digests`),
  writeDigest: (id: string, period: "day" | "week", day?: string) =>
    request<Digest>(`/api/projects/${id}/digests`, { method: "POST", body: JSON.stringify({ period, day }) }),
  addMemory: (projectId: string, section: MemorySection, text: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/memory`, {
      method: "POST",
      body: JSON.stringify({ section, text }),
    }),
  editMemory: (id: string, text: string) =>
    request<{ ok: boolean }>(`/api/memory/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  resolveMemory: (id: string, keep: "new" | "old" | "both") =>
    request<{ ok: boolean }>(`/api/memory/${id}/resolve`, { method: "POST", body: JSON.stringify({ keep }) }),
  ask: (question: string, projectId?: string) =>
    request<AskAnswer>("/api/ask", { method: "POST", body: JSON.stringify({ question, projectId }) }),
  mcpStatus: () => request<{ installed: boolean; command: string; inContainer: boolean }>("/api/mcp"),
  installMcp: () => request<{ ok: boolean }>("/api/mcp", { method: "POST" }),
  removeMcp: () => request<{ ok: boolean }>("/api/mcp", { method: "DELETE" }),
  quickAsk: (body: {
    question: string;
    projectId?: string;
    sessionId?: string;
    mode: "quick" | "full";
    history?: { q: string; a: string }[];
    attachment?: { name: string; text: string };
  }) => request<QuickAnswer>("/api/quick-ask", { method: "POST", body: JSON.stringify(body) }),
  terminalInput: (id: string, text: string, paste = false) =>
    request<{ ok: boolean }>(`/api/terminals/${id}/input`, { method: "POST", body: JSON.stringify({ text, paste }) }),
  personas: () => request<Persona[]>("/api/personas"),
  personaScores: () => request<PersonaScore[]>("/api/personas/scores"),
  createPersona: (persona: Partial<Persona>) =>
    request<Persona>("/api/personas", { method: "POST", body: JSON.stringify(persona) }),
  updatePersona: (id: string, persona: Partial<Persona>) =>
    request<Persona>(`/api/personas/${id}`, { method: "PUT", body: JSON.stringify(persona) }),
  /** Own persona: deleted. Built-in: reset to how it shipped. */
  removePersona: (id: string) => request<{ ok: boolean }>(`/api/personas/${id}`, { method: "DELETE" }),
  draftPersona: (description: string) =>
    request<Persona>("/api/personas/draft", { method: "POST", body: JSON.stringify({ description }) }),
  personaPrompt: (id: string, projectId?: string) =>
    request<{ prompt: string }>(`/api/personas/${id}/prompt${projectId ? `?projectId=${projectId}` : ""}`),
  personaOpinions: (id: string, projectId?: string, all = false) =>
    request<PersonaOpinion[]>(
      `/api/personas/${id}/opinions?${new URLSearchParams({ ...(projectId ? { projectId } : {}), ...(all ? { all: "1" } : {}) })}`,
    ),
  projectExperts: (projectId: string) => request<ExpertsState>(`/api/projects/${projectId}/experts`),
  /** Starts in the background; "experts-changed" says when a view is written. */
  refreshExpertView: (projectId: string, personaId: string) =>
    request<ExpertsState>(`/api/projects/${projectId}/experts/${personaId}`, { method: "POST" }),
  /** The core panel (or the named experts) looks at the project, a few at a time. */
  askAllExperts: (projectId: string, personas?: string[]) =>
    request<ExpertsState>(`/api/projects/${projectId}/experts`, {
      method: "POST",
      body: JSON.stringify(personas ? { personas } : {}),
    }),
  deleteOpinion: (id: string) => request<{ ok: boolean }>(`/api/persona-opinions/${id}`, { method: "DELETE" }),
  packFlows: () => request<string[]>("/api/packs/flows"),
  packCatalog: () =>
    request<CatalogEntry[]>("/api/packs/catalog", {
      method: "POST",
    }),
  previewPack: (source: { pack?: unknown; url?: string }) =>
    request<{ preview: PackPreview; pack: unknown }>("/api/packs/preview", {
      method: "POST",
      body: JSON.stringify(source),
    }),
  installPack: (pack: unknown, pick: { personas: string[]; flows: string[] }) =>
    request<{ personas: string[]; flows: string[] }>("/api/packs/install", {
      method: "POST",
      body: JSON.stringify({ pack, ...pick }),
    }),
  buildPack: (body: { name: string; description?: string; author?: string; personas: string[]; flows: string[] }) =>
    request<unknown>("/api/packs/build", { method: "POST", body: JSON.stringify(body) }),
  exportPersonas: (body: { target: "claude" | "codex"; projectId?: string; ids?: string[] }) =>
    request<{ files: string[] }>("/api/personas/export", { method: "POST", body: JSON.stringify(body) }),
  meetings: (projectId?: string) => request<Meeting[]>(`/api/meetings${projectId ? `?projectId=${projectId}` : ""}`),
  meeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  suggestTeam: (question: string) =>
    request<{ personaIds: string[] }>("/api/meetings/suggest", { method: "POST", body: JSON.stringify({ question }) }),
  startMeeting: (body: { question: string; projectId?: string; personaIds?: string[] }) =>
    request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(body) }),
  commitMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}/commit`, { method: "POST" }),
  meetingProject: (id: string, projectId: string) =>
    request<Meeting>(`/api/meetings/${id}/project`, { method: "POST", body: JSON.stringify({ projectId }) }),
  meetingWeakPoints: (id: string) => request<Meeting>(`/api/meetings/${id}/weak-points`, { method: "POST" }),
  deleteMeeting: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}`, { method: "DELETE" }),
  weakPoints: (text: string, projectId?: string) =>
    request<{ points: WeakPoint[] }>("/api/weak-points", { method: "POST", body: JSON.stringify({ text, projectId }) }),
  secrets: (projectId: string) =>
    request<{
      findings: { projectId: string; hash: string; file: string; line: number; hint: string; at: number }[];
      guard: boolean;
    }>(`/api/projects/${projectId}/secrets`),
  scanSecrets: (projectId: string) =>
    request<{ found: number }>(`/api/projects/${projectId}/secrets/scan`, { method: "POST" }),
  dismissSecret: (projectId: string, f: { hash: string; file: string; line: number }) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/secrets/dismiss`, { method: "POST", body: JSON.stringify(f) }),
  installSecretGuard: (projectId: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/secret-guard`, { method: "POST" }),
  deps: (projectId: string) => request<DependencyReport | null>(`/api/projects/${projectId}/deps`),
  checkDeps: (projectId: string) => request<DependencyReport>(`/api/projects/${projectId}/deps`, { method: "POST" }),
  templates: () =>
    request<{ templates: string[]; practices: { conventions: string[]; lessons: string[] } }>("/api/templates"),
  newProject: (body: { name: string; parent: string; template: string; details?: string; needs?: ProjectNeeds }) =>
    request<{ projectId: string; path: string; runId?: string }>("/api/projects/new", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStatus: (check = false) =>
    request<{
      mode: "git" | "docker" | "none";
      behind: number;
      commits: string[];
      dirty: boolean;
      branch?: string;
      checkedAt: number;
      error?: string;
    }>(`/api/update${check ? "?check=1" : ""}`),
  runUpdate: () => request<{ ok: boolean; log: string }>("/api/update", { method: "POST" }),
  restartApp: () => request<{ ok: boolean }>("/api/update/restart", { method: "POST" }),
  exportBackup: async (password?: string) => {
    const res = await fetch("/api/backup/export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(friendly(res.status));
    return res.blob();
  },
  importBackup: async (file: File, password?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (password) form.set("password", password);
    const res = await fetch("/api/backup/import", { method: "POST", body: form, credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendly(res.status, body.error));
    return body as { added: Record<string, number> };
  },
  moveStatus: () => request<{ waiting: boolean }>("/api/move"),
  exportMove: async (password: string) => {
    const res = await fetch("/api/move/export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(friendly(res.status, (await res.json().catch(() => ({}))).error));
    return res.blob();
  },
  importMove: async (file: File, password: string) => {
    const form = new FormData();
    form.set("file", file);
    form.set("password", password);
    const res = await fetch("/api/move/import", { method: "POST", body: form, credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendly(res.status, body.error));
    return body as { waiting: boolean };
  },
  briefing: (refresh = false) => request<Briefing | null>(`/api/briefing${refresh ? "?refresh=1" : ""}`),
  preview: (projectId: string) =>
    request<{ server: DevServerInfo | null; plan: { script: string; framework: string; vite: boolean } | null }>(
      `/api/projects/${projectId}/preview`,
    ),
  previewLogs: (projectId: string) => request<string[]>(`/api/projects/${projectId}/preview/logs`),
  startPreview: (projectId: string, url?: string) =>
    request<DevServerInfo>(`/api/projects/${projectId}/preview/start`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  stopPreview: (projectId: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/preview/stop`, { method: "POST" }),
  previewEdit: (
    projectId: string,
    body: { instruction: string; element: PickedElement; personaId?: string; model?: string },
  ) => request<QuickEdit>(`/api/projects/${projectId}/preview/edit`, { method: "POST", body: JSON.stringify(body) }),
  previewVisual: (projectId: string, path: string, action: "baseline" | "compare") =>
    request<VisualCheck>(`/api/projects/${projectId}/preview/visual`, {
      method: "POST",
      body: JSON.stringify({ path, action }),
    }),
  schedules: () => request<Schedule[]>("/api/schedules"),
  scheduleRuns: (id: string) => request<FlowRun[]>(`/api/schedules/${id}/runs`),
  proposeSchedule: (sentence: string, projectId: string) =>
    request<Schedule>("/api/schedules/propose", { method: "POST", body: JSON.stringify({ sentence, projectId }) }),
  scheduleFromTemplate: (projectId: string, template: string, title: string, text: string) =>
    request<Schedule>("/api/schedules", {
      method: "POST",
      body: JSON.stringify({ projectId, template, title, request: text }),
    }),
  updateSchedule: (
    id: string,
    patch: { title?: string; request?: string; when?: ScheduleWhen; maxMinutes?: number; maxTurns?: number },
  ) => request<Schedule>(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  scheduleAction: (id: string, action: "activate" | "pause" | "run" | "skip") =>
    request<Schedule | FlowRun>(`/api/schedules/${id}/${action}`, { method: "POST" }),
  removeSchedule: (id: string) => request<{ ok: boolean }>(`/api/schedules/${id}`, { method: "DELETE" }),
  projectFlows: (projectId: string) =>
    request<{
      flows: {
        name: string;
        description: string;
        source?: string;
        nodes: { id: string; title?: string; persona?: string }[];
      }[];
      archon: { installed: boolean; workflows: { name: string; description: string }[] };
    }>(`/api/projects/${projectId}/flows`),
  flowRuns: (projectId?: string) => request<FlowRun[]>(`/api/flows${projectId ? `?projectId=${projectId}` : ""}`),
  flowRun: (id: string) => request<FlowRun>(`/api/flows/${id}`),
  startFlow: (body: { projectId: string; flow: string; request: string; persona?: string }) =>
    request<FlowRun>("/api/flows", { method: "POST", body: JSON.stringify(body) }),
  respondFlow: (id: string, node: string, decision: "approve" | "reject", text?: string) =>
    request<FlowRun>(`/api/flows/${id}/respond`, { method: "POST", body: JSON.stringify({ node, decision, text }) }),
  flowAction: (id: string, action: "stop" | "retry" | "merge" | "discard") =>
    request<FlowRun>(`/api/flows/${id}/${action}`, { method: "POST" }),
  reviseFlow: (id: string, text: string) =>
    request<FlowRun>(`/api/flows/${id}/revise`, { method: "POST", body: JSON.stringify({ text }) }),
  flowDiff: (id: string) =>
    request<{ files: { path: string; added: number; removed: number }[]; patch: string }>(`/api/flows/${id}/diff`),
  board: (projectId: string) => request<BoardTask[]>(`/api/projects/${projectId}/board`),
  addCard: (projectId: string, card: { title: string; description?: string; origin?: string }) =>
    request<BoardTask>(`/api/projects/${projectId}/board`, { method: "POST", body: JSON.stringify(card) }),
  updateCard: (id: string, patch: { title?: string; description?: string }) =>
    request<BoardTask>(`/api/board/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  moveCard: (id: string, status: TaskStatus, order?: number, flow?: string) =>
    request<BoardTask>(`/api/board/${id}/move`, { method: "POST", body: JSON.stringify({ status, order, flow }) }),
  removeCard: (id: string) => request<{ ok: boolean }>(`/api/board/${id}`, { method: "DELETE" }),
  assignCard: (id: string, assignee: BoardTask["assignee"] | null) =>
    request<BoardTask>(`/api/board/${id}/assign`, { method: "POST", body: JSON.stringify(assignee ?? {}) }),
  claimCard: (id: string, take: boolean) =>
    request<BoardTask>(`/api/board/${id}/claim`, { method: "POST", body: JSON.stringify({ take }) }),
  knowledge: (persona?: string) => request<KnowledgeOverview>(`/api/knowledge${persona ? `?persona=${persona}` : ""}`),
  knowledgeSources: (persona: string) => request<KnowledgeSources>(`/api/knowledge/sources/${persona}`),
  setKnowledgeSources: (persona: string, sources: KnowledgeSources) =>
    request<KnowledgeSources>(`/api/knowledge/sources/${persona}`, { method: "PUT", body: JSON.stringify(sources) }),
  scanKnowledge: () => request<{ ok: boolean }>("/api/knowledge/scan", { method: "POST" }),
  comparePackages: (names: string[]) =>
    request<PackageComparison[]>(`/api/knowledge/compare?packages=${encodeURIComponent(names.join(","))}`),
  lessons: (opts: { projectId?: string; q?: string } = {}) =>
    request<Lesson[]>(
      `/api/lessons?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v) as [string, string][])}`,
    ),
  addLesson: (lesson: {
    title: string;
    prevent: string;
    what?: string;
    why?: string;
    fix?: string;
    projectId?: string;
  }) => request<Lesson>("/api/lessons", { method: "POST", body: JSON.stringify(lesson) }),
  updateLesson: (id: string, patch: Partial<Pick<Lesson, "title" | "what" | "why" | "fix" | "prevent" | "status">>) =>
    request<Lesson>(`/api/lessons/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeLesson: (id: string) => request<{ ok: boolean }>(`/api/lessons/${id}`, { method: "DELETE" }),
  lessonRule: (id: string, target: string) =>
    request<Lesson>(`/api/lessons/${id}/rule`, { method: "POST", body: JSON.stringify({ target }) }),
  scanLessons: () => request<{ written: number }>("/api/lessons/scan", { method: "POST" }),
  retrospective: (projectId: string) =>
    request<{ id: string }>(`/api/projects/${projectId}/retrospective`, { method: "POST" }),
  library: (persona?: string) => request<LibraryItem[]>(`/api/library${persona ? `?persona=${persona}` : ""}`),
  libraryStatus: () => request<EmbedderStatus>("/api/library/status"),
  librarySuggestions: () => request<LibrarySuggestion[]>("/api/library/suggestions"),
  downloadLibraryModel: () => request<EmbedderStatus>("/api/library/model", { method: "POST" }),
  addLibraryFile: async (file: File, opts: { personaIds?: string[]; title?: string; author?: string }) => {
    const form = new FormData();
    form.set("file", file);
    if (opts.personaIds) form.set("personaIds", JSON.stringify(opts.personaIds));
    if (opts.title) form.set("title", opts.title);
    if (opts.author) form.set("author", opts.author);
    const res = await fetch("/api/library/files", { method: "POST", body: form, credentials: "same-origin" }).catch(
      () => {
        throw new Error(friendly(undefined));
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendly(res.status, body.error));
    return body as LibraryItem;
  },
  addLibraryUrl: (url: string, personaIds?: string[]) =>
    request<LibraryItem>("/api/library/url", { method: "POST", body: JSON.stringify({ url, personaIds }) }),
  addLibraryNote: (title: string, text: string, personaIds?: string[]) =>
    request<LibraryItem>("/api/library/notes", { method: "POST", body: JSON.stringify({ title, text, personaIds }) }),
  updateLibraryItem: (id: string, patch: { personaIds?: string[]; title?: string; author?: string }) =>
    request<LibraryItem>(`/api/library/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeLibraryItem: (id: string) => request<{ ok: boolean }>(`/api/library/${id}`, { method: "DELETE" }),
  reindexLibraryItem: (id: string) => request<{ ok: boolean }>(`/api/library/${id}/reindex`, { method: "POST" }),
  searchLibrary: (q: string, persona?: string) =>
    request<LibraryHit[]>(`/api/library/search?${new URLSearchParams({ q, ...(persona ? { persona } : {}) })}`),
  coverageMap: (projectId: string) => request<CoverageMap>(`/api/projects/${projectId}/coverage-map`),
  testerStatus: () => request<{ browser: boolean; mcp: boolean; runtime: string }>("/api/testers/status"),
  testerProfiles: () => request<TesterProfile[]>("/api/testers/profiles"),
  saveTesterProfile: (profile: Partial<TesterProfile>) =>
    request<TesterProfile>("/api/testers/profiles", { method: "POST", body: JSON.stringify(profile) }),
  removeTesterProfile: (id: string) => request<{ ok: boolean }>(`/api/testers/profiles/${id}`, { method: "DELETE" }),
  draftTesterProfiles: (audience: string) =>
    request<TesterProfile[]>("/api/testers/profiles/draft", { method: "POST", body: JSON.stringify({ audience }) }),
  checkTesterUrl: (url: string) =>
    request<{ url: string; origin: string; local: boolean }>("/api/testers/check-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  testerRuns: (projectId?: string) =>
    request<TesterRun[]>(`/api/testers/runs${projectId ? `?projectId=${projectId}` : ""}`),
  testerRun: (id: string) => request<TesterRun>(`/api/testers/runs/${id}`),
  startTesterRun: (body: {
    url: string;
    task: string;
    profileIds: string[];
    copies?: number;
    parallel?: number;
    projectId?: string;
    model?: string;
  }) => request<TesterRun>("/api/testers/runs", { method: "POST", body: JSON.stringify(body) }),
  repeatTesterRun: (id: string) => request<TesterRun>(`/api/testers/runs/${id}/repeat`, { method: "POST" }),
  autoRepeatTesterRun: (id: string, on: boolean) =>
    request<TesterRun>(`/api/testers/runs/${id}/auto`, { method: "POST", body: JSON.stringify({ on }) }),
  stopTesterRun: (id: string) => request<{ ok: boolean }>(`/api/testers/runs/${id}/stop`, { method: "POST" }),
  deleteTesterRun: (id: string) => request<{ ok: boolean }>(`/api/testers/runs/${id}`, { method: "DELETE" }),
  reviewIdeas: () => request<IdeaReview>("/api/ideas/review", { method: "POST" }),
  ideas: () => request<Idea[]>("/api/ideas"),
  addIdea: (text: string, projectId?: string) =>
    request<Idea>("/api/ideas", { method: "POST", body: JSON.stringify({ text, projectId }) }),
  updateIdea: (id: string, patch: { status?: IdeaStatus; projectId?: string | null; text?: string }) =>
    request<{ ok: boolean }>(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteIdea: (id: string) => request<{ ok: boolean }>(`/api/ideas/${id}`, { method: "DELETE" }),
  triageIdeas: () => request<Idea[]>("/api/ideas/triage", { method: "POST" }),
  prompts: () => request<SavedPrompt[]>("/api/prompts"),
  slashCommands: (projectId: string) =>
    request<{ name: string; description: string; source: "project" | "user" }[]>(
      `/api/projects/${projectId}/slash-commands`,
    ),
  savePrompt: (prompt: { id?: string; title: string; body: string; tags: string[] }) =>
    request<SavedPrompt>("/api/prompts", { method: "POST", body: JSON.stringify(prompt) }),
  markPromptUsed: (id: string) => request<{ ok: boolean }>(`/api/prompts/${id}/use`, { method: "POST" }),
  deletePrompt: (id: string) => request<{ ok: boolean }>(`/api/prompts/${id}`, { method: "DELETE" }),
  servers: () => request<ServerInfo[]>("/api/servers"),
  sshConfigHosts: () =>
    request<{ alias: string; hostname?: string; user?: string; port?: number }[]>("/api/servers/ssh-config"),
  addServer: (server: { name: string; target: string; port?: number; tag: string }) =>
    request<ServerInfo>("/api/servers", { method: "POST", body: JSON.stringify(server) }),
  removeServer: (id: string) => request<{ ok: boolean }>(`/api/servers/${id}`, { method: "DELETE" }),
  checkServer: (id: string) => request<ServerHealth>(`/api/servers/${id}/health`, { method: "POST" }),
  classify: (command: string) =>
    request<{ risk: CommandRisk; reasons: string[] }>("/api/servers/classify", {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
  runOnServer: (id: string, command: string, confirmations: number) =>
    request<RemoteRun>(`/api/servers/${id}/run`, { method: "POST", body: JSON.stringify({ command, confirmations }) }),
  serverAudit: (id: string) => request<RemoteRun[]>(`/api/servers/${id}/audit`),
  sshTerminal: (serverId: string) =>
    request<TerminalInfo>("/api/terminals", { method: "POST", body: JSON.stringify({ tool: "ssh", serverId }) }),
  approvals: () => request<Approval[]>("/api/approvals"),
  decide: (id: string, approve: boolean) =>
    request<{ status: string; run?: RemoteRun }>(`/api/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ approve }),
    }),
  chats: () => request<ChatInfo[]>("/api/chats"),
  recentChats: () => request<RecentChat[]>("/api/chats/recent"),
  recentChat: (id: string) => request<RecentChat>(`/api/chats/recent/${id}`),
  forgetChat: (id: string) => request<{ ok: boolean }>(`/api/chats/recent/${id}`, { method: "DELETE" }),
  startChat: (body: {
    projectId: string;
    resume?: string;
    model?: string;
    mode?: ChatMode;
    personaId?: string;
    accountId?: string;
    isolate?: boolean;
  }) => request<ChatInfo>("/api/chats", { method: "POST", body: JSON.stringify(body) }),
  chatCopy: (id: string) =>
    request<{ files: { path: string; added: number; removed: number }[]; patch: string }>(`/api/chats/${id}/worktree`),
  chatCopyMerge: (id: string) =>
    request<{ merged: boolean; message: string }>(`/api/chats/${id}/worktree/merge`, { method: "POST" }),
  chatCopyDiscard: (id: string) => request<{ ok: boolean }>(`/api/chats/${id}/worktree`, { method: "DELETE" }),
  chatChanges: (id: string) => request<{ checkpointId?: string; files: string[] }>(`/api/chats/${id}/changes`),
  chatChangeDiff: (id: string, path: string) =>
    request<{ original: string; modified: string; binary: boolean; added: boolean; deleted: boolean }>(
      `/api/chats/${id}/changes/diff?path=${encodeURIComponent(path)}`,
    ),
  revertChatChange: (id: string, path: string) =>
    request<{ ok: boolean }>(`/api/chats/${id}/changes/revert`, { method: "POST", body: JSON.stringify({ path }) }),
  chatTodos: (id: string) => request<ChatTodo[]>(`/api/chats/${id}/todos`),
  addChatTodo: (id: string, text: string) =>
    request<ChatTodo[]>(`/api/chats/${id}/todos`, { method: "POST", body: JSON.stringify({ text }) }),
  updateChatTodo: (id: string, todo: string, patch: { done?: boolean; text?: string }) =>
    request<ChatTodo[]>(`/api/chats/${id}/todos/${todo}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeChatTodo: (id: string, todo: string) =>
    request<ChatTodo[]>(`/api/chats/${id}/todos/${todo}`, { method: "DELETE" }),
  chatModel: (id: string, model: string) =>
    request<ChatInfo>(`/api/chats/${id}/model`, { method: "POST", body: JSON.stringify({ model }) }),
  closeChat: (id: string) => request<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  accounts: () => request<Account[]>("/api/accounts"),
  addAccount: (provider: AiTool, label: string) =>
    request<Account>("/api/accounts", { method: "POST", body: JSON.stringify({ provider, label }) }),
  loginAccount: (id: string) => request<TerminalInfo>(`/api/accounts/${id}/login`, { method: "POST" }),
  refreshAccount: (id: string) => request<Account>(`/api/accounts/${id}/refresh`, { method: "POST" }),
  activateAccount: (id: string) => request<{ ok: boolean }>(`/api/accounts/${id}/activate`, { method: "POST" }),
  removeAccount: (id: string) => request<{ ok: boolean }>(`/api/accounts/${id}`, { method: "DELETE" }),
  setProjectAccount: (projectId: string, accountId: string | null) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/account`, {
      method: "PUT",
      body: JSON.stringify({ accountId }),
    }),
  limits: () => request<LimitsOverview>("/api/limits"),
  limitAlerts: () =>
    request<{ accountId: string; label: string; window: "fiveHour" | "week"; value: number; resetsAt?: number }[]>(
      "/api/limits/alerts",
    ),
  inbox: () => request<{ conflicts: { projectId: string; projectName: string; count: number }[] }>("/api/inbox"),
  terminals: () => request<TerminalInfo[]>("/api/terminals"),
  startTerminal: (body: { projectId: string; tool: TerminalTool; resume?: string; fork?: boolean }) =>
    request<TerminalInfo>("/api/terminals", { method: "POST", body: JSON.stringify(body) }),
  handoff: (sessionId: string, tool?: TerminalTool) =>
    request<TerminalInfo>(`/api/sessions/${sessionId}/handoff`, { method: "POST", body: JSON.stringify({ tool }) }),
  closeTerminal: (id: string) => request<{ ok: boolean }>(`/api/terminals/${id}`, { method: "DELETE" }),
  enhance: (body: {
    text: string;
    projectId?: string;
    sessionId?: string;
    tool?: string;
    file?: { path: string; selection?: string; startLine?: number; endLine?: number };
    answers?: { question: string; answer: string }[];
    exclude?: string[];
    template?: boolean;
    personaId?: string;
  }) => request<EnhanceResult & { id: string }>("/api/enhance", { method: "POST", body: JSON.stringify(body) }),
  enhanceUsed: (id: string, choice: "enhanced" | "edited" | "original", final?: string, sessionId?: string) =>
    request<{ ok: boolean }>(`/api/enhance/${id}/used`, {
      method: "POST",
      body: JSON.stringify({ choice, final, sessionId }),
    }),
  enhanceStats: () => request<EnhanceStats>("/api/enhance/stats"),
  insight: (projectId: string) =>
    request<
      (InsightScan & { scanning: boolean; trend: { at: number; overall: number }[] }) | { scanning: boolean; trend: [] }
    >(`/api/projects/${projectId}/insight`),
  insightScan: (projectId: string) =>
    request<InsightScan>(`/api/projects/${projectId}/insight/scan`, { method: "POST" }),
  insightCategory: (projectId: string, category: Category) =>
    request<CategoryDetail>(`/api/projects/${projectId}/insight/${category}`),
  insightExplain: (projectId: string, category: Category, force = false) =>
    request<CategoryDetail>(`/api/projects/${projectId}/insight/${category}/explain`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  envOverview: (projectId: string) => request<EnvOverview>(`/api/projects/${projectId}/env`),
  envReveal: (projectId: string, file: string, key: string) =>
    request<{ value: string }>(`/api/projects/${projectId}/env/reveal`, {
      method: "POST",
      body: JSON.stringify({ file, key }),
    }),
  envSet: (projectId: string, file: string, key: string, value: string) =>
    request<{ ok: boolean; remote?: boolean }>(`/api/projects/${projectId}/env`, {
      method: "PUT",
      body: JSON.stringify({ file, key, value }),
    }),
  envRemove: (projectId: string, file: string, key: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/env`, {
      method: "DELETE",
      body: JSON.stringify({ file, key }),
    }),
  envHistory: (projectId: string, file: string) =>
    request<EnvBackup[]>(`/api/projects/${projectId}/env/history?file=${encodeURIComponent(file)}`),
  envRestore: (projectId: string, file: string, id: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/env/restore`, {
      method: "POST",
      body: JSON.stringify({ file, id }),
    }),
  envSyncExample: (projectId: string) =>
    request<{ file: string; added: string[] }>(`/api/projects/${projectId}/env/example`, { method: "POST" }),
  insightTools: (projectId: string) =>
    request<{ plans: ToolPlan[]; results: ToolResult[]; running: boolean }>(`/api/projects/${projectId}/insight-tools`),
  insightRunTools: (projectId: string, kinds: ToolKind[]) =>
    request<ToolResult[]>(`/api/projects/${projectId}/insight-tools`, {
      method: "POST",
      body: JSON.stringify({ kinds }),
    }),
  insightConfig: (projectId: string) => request<InsightConfig>(`/api/projects/${projectId}/insight-config`),
  insightSetConfig: (projectId: string, config: InsightConfig) =>
    request<InsightConfig>(`/api/projects/${projectId}/insight-config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  importStatus: (projectId: string) =>
    request<{ estimate: ImportEstimate; status: ImportStatus | null }>(`/api/projects/${projectId}/import`),
  importStart: (projectId: string) => request<ImportStatus>(`/api/projects/${projectId}/import`, { method: "POST" }),
  importStop: (projectId: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/import`, { method: "DELETE" }),
  httpBase: (projectId: string) => request<{ base: string }>(`/api/projects/${projectId}/http-base`),
  http: (body: { method: string; url: string; headers?: Record<string, string>; body?: string }) =>
    request<HttpResponse>("/api/http", { method: "POST", body: JSON.stringify(body) }),
  envRemoteLinks: (projectId: string) =>
    request<{ serverId: string; path: string }[]>(`/api/projects/${projectId}/env/remote`),
  envLinkRemote: (projectId: string, serverId: string, path: string) =>
    request<{ ok: boolean; keys: number }>(`/api/projects/${projectId}/env/remote`, {
      method: "POST",
      body: JSON.stringify({ serverId, path }),
    }),
  envUnlinkRemote: (projectId: string, serverId: string, path: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/env/remote`, {
      method: "DELETE",
      body: JSON.stringify({ serverId, path }),
    }),
  envChanges: (projectId: string) => request<EnvChange[]>(`/api/projects/${projectId}/env/changes`),
  gitBranches: (projectId: string) =>
    request<{ branches: GitBranchInfo[]; worktrees: { path: string; branch?: string; head: string }[] }>(
      `/api/projects/${projectId}/git/branches`,
    ),
  gitSwitch: (projectId: string, branch: string, create = false) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/git/switch`, {
      method: "POST",
      body: JSON.stringify({ branch, create }),
    }),
  gitBlame: (projectId: string, path: string) =>
    request<BlameLine[]>(`/api/projects/${projectId}/git/blame?path=${encodeURIComponent(path)}`),
  replaceInProject: (
    projectId: string,
    body: {
      find: string;
      replace: string;
      regex?: boolean;
      caseSensitive?: boolean;
      paths?: string[];
      apply?: boolean;
    },
  ) => request<unknown>(`/api/projects/${projectId}/replace`, { method: "POST", body: JSON.stringify(body) }),
  today: () => request<TodaySummary>(`/api/today?since=${new Date().setHours(0, 0, 0, 0)}`),
  setSessionPrivate: (id: string, value: boolean) =>
    request<{ ok: boolean }>(`/api/sessions/${id}/private`, {
      method: "PATCH",
      body: JSON.stringify({ private: value }),
    }),
  sharePreview: (projectId: string) => request<SharePreview>(`/api/projects/${projectId}/share-preview`),
  inboxNotices: () => request<InboxNotice[]>("/api/inbox/notices"),
  limitsMonthly: () => request<MonthlyReport[]>("/api/limits/monthly"),
  environments: (projectId: string) => request<EnvironmentInfo[]>(`/api/projects/${projectId}/environments`),
  addEnvironment: (
    projectId: string,
    body: { name: string; serverId: string; path: string; branch: string; deployCommand: string },
  ) =>
    request<EnvironmentInfo>(`/api/projects/${projectId}/environments`, { method: "POST", body: JSON.stringify(body) }),
  updateEnvironment: (id: string, patch: { deployCommand?: string; branch?: string; name?: string }) =>
    request<{ ok: boolean }>(`/api/environments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  removeEnvironment: (id: string) => request<{ ok: boolean }>(`/api/environments/${id}`, { method: "DELETE" }),
  envChecks: (id: string) =>
    request<{ state: EnvironmentState; checks: DeployCheck[] }>(`/api/environments/${id}/checks`),
  envState: (id: string) =>
    request<{ state: EnvironmentState; checks: DeployCheck[] }>(`/api/environments/${id}/checks`),
  deploy: (id: string, confirmations: number, branch?: string) =>
    request<DeployRecord>(`/api/environments/${id}/deploy`, {
      method: "POST",
      body: JSON.stringify({ confirmations, ...(branch ? { branch } : {}) }),
    }),
  envBranches: (id: string) => request<string[]>(`/api/environments/${id}/branches`),
  createStaging: (id: string, body: { name: string; path: string; branch: string; confirmations: number }) =>
    request<EnvironmentInfo>(`/api/environments/${id}/staging`, { method: "POST", body: JSON.stringify(body) }),
  envWorkflow: (id: string) =>
    request<{ path: string; content: string; exists: boolean }>(`/api/environments/${id}/workflow`),
  writeEnvWorkflow: (id: string) => request<{ path: string }>(`/api/environments/${id}/workflow`, { method: "POST" }),
  projectDeploys: (projectId: string) => request<DeployRecord[]>(`/api/projects/${projectId}/deploys`),
  serverDeploys: (serverId: string) => request<DeployRecord[]>(`/api/servers/${serverId}/deploys`),
  serverFiles: (serverId: string, path: string) =>
    request<{ path: string; entries: RemoteEntry[] }>(
      `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
    ),
  serverFile: (serverId: string, path: string) =>
    request<{ text: string }>(`/api/servers/${serverId}/file?path=${encodeURIComponent(path)}`),
  saveServerFile: (serverId: string, path: string, text: string) =>
    request<{ backup: string }>(`/api/servers/${serverId}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, text }),
    }),
  team: () => request<TeamStatus>("/api/team"),
  teamConnect: (body: {
    hub?: string;
    username?: string;
    password?: string;
    invite?: string;
    newPassword?: string;
    code?: string;
    recovery?: string;
  }) =>
    request<{ status: TeamStatus; recoveryKey?: string; needs2fa?: boolean }>("/api/team/connect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  teamKeyRequests: () => request<{ keyEpoch: number; requests: KeyRequest[] }>("/api/team/key-requests"),
  teamApproveDevice: (deviceId: string) =>
    request<{ ok: boolean }>(`/api/team/key-requests/${deviceId}/approve`, { method: "POST" }),
  teamRotateKey: () => request<{ recoveryKey: string }>("/api/team/rotate-key", { method: "POST" }),
  teamAlerts: () => request<HubAlertInfo[]>("/api/team/alerts"),
  teamActivity: (since: number, user?: string) =>
    request<TeamActivity[]>(`/api/team/activity?since=${since}${user ? `&user=${encodeURIComponent(user)}` : ""}`),
  teamActivitySummary: (user: string) =>
    request<{ text: string }>("/api/team/activity/summary", { method: "POST", body: JSON.stringify({ user }) }),
  comments: (kind: string, id: string) =>
    request<{ id: string; author?: string; authorId?: string; mine: boolean; text: string; at: number }[]>(
      `/api/comments?kind=${kind}&id=${encodeURIComponent(id)}`,
    ),
  addComment: (body: { projectId: string; targetKind: string; targetId: string; text: string }) =>
    request<{ ok: boolean }>("/api/comments", { method: "POST", body: JSON.stringify(body) }),
  teamMessages: () =>
    request<
      {
        id: string;
        kind: "suggestion" | "handoff" | "dayend";
        projectId: string;
        from?: string;
        fromId?: string;
        sessionId?: string;
        title?: string;
        text: string;
        at: number;
      }[]
    >("/api/team/messages"),
  teamSuggest: (body: { projectId: string; toId: string; sessionId?: string; text: string }) =>
    request<{ ok: boolean }>("/api/team/messages", { method: "POST", body: JSON.stringify(body) }),
  teamMessageDone: (id: string, status: "accepted" | "dismissed") =>
    request<{ ok: boolean }>(`/api/team/messages/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  handoffTo: (sessionId: string, toId: string) =>
    request<{ ok: boolean }>(`/api/sessions/${sessionId}/handoff-to`, {
      method: "POST",
      body: JSON.stringify({ toId }),
    }),
  teamProjects: () => request<{ projectId: string; name: string; key: string }[]>("/api/team/projects"),
  teamAccess: () => request<{ project: string; userId: string; role: string }[]>("/api/team/admin/access"),
  teamSetAccess: (project: string, userId: string, role: string | null) =>
    request<{ ok: boolean }>("/api/team/admin/access", {
      method: "PUT",
      body: JSON.stringify({ project, userId, role }),
    }),
  teamPolicies: () =>
    request<{ minPassword: number; require2fa: boolean; sessionDays: number; ipAllow: string; retentionDays: number }>(
      "/api/team/admin/policies",
    ),
  teamSetPolicies: (p: object) =>
    request<unknown>("/api/team/admin/policies", { method: "PUT", body: JSON.stringify(p) }),
  teamWhoami: () =>
    request<{ user: { displayName: string; twoFactor: boolean; avatar?: string }; require2fa: boolean }>(
      "/api/team/whoami",
    ),
  teamUpdateMe: (patch: { displayName?: string; language?: string; avatar?: string }) =>
    request<unknown>("/api/team/me", { method: "PATCH", body: JSON.stringify(patch) }),
  team2fa: (step: "start" | "confirm" | "disable", body: { code?: string } = {}) =>
    request<unknown>(`/api/team/2fa/${step}`, { method: "POST", body: JSON.stringify(body) }),
  teamSignOutOthers: () => request<{ ok: boolean; count: number }>("/api/team/devices", { method: "DELETE" }),
  teamSignOutUser: (id: string) =>
    request<{ ok: boolean }>(`/api/team/admin/users/${id}/devices`, { method: "DELETE" }),
  teamClear2fa: (id: string) => request<{ ok: boolean }>(`/api/team/admin/users/${id}/2fa`, { method: "DELETE" }),
  teamDisconnect: () => request<{ ok: boolean }>("/api/team/disconnect", { method: "POST" }),
  teamRecoveryKey: () => request<{ key: string }>("/api/team/recovery-key"),
  teamMail: () => request<{ configured: boolean; from?: string }>("/api/team/admin/mail"),
  teamPasswordReset: (body: { hub: string; login: string }) =>
    request<{ ok: boolean; email: boolean }>("/api/team/password-reset", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  teamPasswordResetConfirm: (body: { hub: string; login: string; code: string; password: string }) =>
    request<{ ok: boolean; username: string }>("/api/team/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  teamInvite: (body: { username: string; displayName?: string; role: string; email?: string; sendEmail?: boolean }) =>
    request<TeamInvite>("/api/team/invite", { method: "POST", body: JSON.stringify(body) }),
  teamPresence: (projectId?: string) =>
    request<Presence[]>(`/api/team/presence${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`),
  teamUsers: () => request<TeamUser[]>("/api/team/admin/users"),
  teamDevices: () => request<TeamDevice[]>("/api/team/admin/devices"),
  teamAudit: () => request<TeamAuditEntry[]>("/api/team/admin/audit"),
  teamStats: () =>
    request<{ users: number; events: number; bytes: number; online: number; rssMb: number }>("/api/team/admin/stats"),
  teamUpdateUser: (id: string, patch: { role?: string; disabled?: boolean; displayName?: string; email?: string }) =>
    request<TeamUser>(`/api/team/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  teamResetUser: (id: string, sendEmail = false) =>
    request<TeamInvite>(`/api/team/admin/users/${id}/reset`, { method: "POST", body: JSON.stringify({ sendEmail }) }),
  teamDeleteUser: (id: string) => request<{ ok: boolean }>(`/api/team/admin/users/${id}`, { method: "DELETE" }),
  teamRevokeDevice: (id: string) => request<{ ok: boolean }>(`/api/team/admin/devices/${id}`, { method: "DELETE" }),
  setShare: (projectId: string, share: ShareLevel) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/share`, { method: "PUT", body: JSON.stringify({ share }) }),
};

export const fs = {
  list: (path: string, hidden = false) =>
    request<FileEntry[]>(`/api/fs/list?path=${encodeURIComponent(path)}${hidden ? "&hidden=1" : ""}`),
  read: (path: string) => request<FileContent>(`/api/fs/read?path=${encodeURIComponent(path)}`),
  rawUrl: (path: string, download = false) =>
    `/api/fs/raw?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`,
  write: (path: string, content: string, expectedMtime?: number) =>
    request<FileEntry>("/api/fs/write", { method: "PUT", body: JSON.stringify({ path, content, expectedMtime }) }),
  mkdir: (path: string) => request<FileEntry>("/api/fs/mkdir", { method: "POST", body: JSON.stringify({ path }) }),
  rename: (from: string, to: string) =>
    request<FileEntry>("/api/fs/rename", { method: "POST", body: JSON.stringify({ from, to }) }),
  copy: (from: string, to: string) =>
    request<FileEntry>("/api/fs/copy", { method: "POST", body: JSON.stringify({ from, to }) }),
  trash: (path: string) => request<TrashItem>("/api/fs/trash", { method: "POST", body: JSON.stringify({ path }) }),
  trashList: () => request<TrashItem[]>("/api/fs/trash"),
  restore: (id: string) => request<FileEntry>("/api/fs/restore", { method: "POST", body: JSON.stringify({ id }) }),
  upload: async (dir: string, list: FileList | File[]) => {
    const form = new FormData();
    for (const file of Array.from(list)) form.append("files", file);
    const res = await fetch(`/api/fs/upload?dir=${encodeURIComponent(dir)}`, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
    return res.json() as Promise<FileEntry[]>;
  },
  search: (root: string, q: string, content = false) =>
    request<{ path: string; line?: number; text?: string }[]>(
      `/api/fs/search?root=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}${content ? "&content=1" : ""}`,
    ),
  usage: (path: string) => request<{ path: string; size: number }[]>(`/api/fs/usage?path=${encodeURIComponent(path)}`),
  checkpoints: (projectId: string) => request<Checkpoint[]>(`/api/projects/${projectId}/checkpoints`),
  checkpointNow: (projectId: string) =>
    request<Checkpoint>(`/api/projects/${projectId}/checkpoints`, { method: "POST" }),
  checkpointChanges: (projectId: string, id: string) =>
    request<string[]>(`/api/projects/${projectId}/checkpoints/${id}/changes`),
  restoreCheckpoint: (projectId: string, id: string) =>
    request<{ ok: boolean; backup?: Checkpoint }>(`/api/projects/${projectId}/checkpoints/${id}/restore`, {
      method: "POST",
    }),
  tail: (path: string, bytes = 200_000) =>
    request<{ text: string; size: number }>(`/api/fs/tail?path=${encodeURIComponent(path)}&bytes=${bytes}`),
  changes: (projectId: string) => request<GitChange[]>(`/api/projects/${projectId}/git/changes`),
  diff: (projectId: string, path: string) =>
    request<{ original: string; modified: string; binary: boolean }>(
      `/api/projects/${projectId}/git/diff?path=${encodeURIComponent(path)}`,
    ),
  commit: (projectId: string, message: string, files?: string[]) =>
    request<{ ok: boolean; output: string }>(`/api/projects/${projectId}/git/commit`, {
      method: "POST",
      body: JSON.stringify({ message, files }),
    }),
};
