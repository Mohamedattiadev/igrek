import type {
  Account,
  AiTool,
  Approval,
  AskAnswer,
  Category,
  CategoryDetail,
  ChatInfo,
  ChatMode,
  Checkpoint,
  CommandRisk,
  DeployCheck,
  DeployRecord,
  Digest,
  EnhanceResult,
  EnhanceStats,
  EnvBackup,
  EnvChange,
  EnvironmentInfo,
  EnvironmentState,
  EnvOverview,
  FileContent,
  FileEntry,
  GitChange,
  GitInfo,
  HttpResponse,
  Idea,
  IdeaStatus,
  ImportEstimate,
  ImportStatus,
  InboxNotice,
  IndexStatus,
  InsightConfig,
  InsightScan,
  LimitsOverview,
  MemorySection,
  MonthlyReport,
  Presence,
  ProjectDetail,
  ProjectListItem,
  QuickAnswer,
  RemoteEntry,
  RemoteRun,
  SavedPrompt,
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
  TeamAuditEntry,
  TeamDevice,
  TeamInvite,
  TeamStatus,
  TeamUser,
  TerminalInfo,
  TerminalTool,
  TimelineEntry,
  TodaySummary,
  ToolKind,
  ToolPlan,
  ToolResult,
  TrashItem,
} from "@godeye/core";
import type { LanguageOption } from "@godeye/i18n";

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
  setGitFlow: (id: string, gitFlow: boolean) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ gitFlow }) }),
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
  addProject: (path: string) =>
    request<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify({ path }) }),
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
  startChat: (body: { projectId: string; resume?: string; model?: string; mode?: ChatMode; accountId?: string }) =>
    request<ChatInfo>("/api/chats", { method: "POST", body: JSON.stringify(body) }),
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
  deploy: (id: string, confirmations: number) =>
    request<DeployRecord>(`/api/environments/${id}/deploy`, {
      method: "POST",
      body: JSON.stringify({ confirmations }),
    }),
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
  teamConnect: (body: { hub?: string; username?: string; password?: string; invite?: string; newPassword?: string }) =>
    request<{ status: TeamStatus; recoveryKey?: string }>("/api/team/connect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  teamDisconnect: () => request<{ ok: boolean }>("/api/team/disconnect", { method: "POST" }),
  teamRecoveryKey: () => request<{ key: string }>("/api/team/recovery-key"),
  teamInvite: (body: { username: string; displayName?: string; role: string }) =>
    request<TeamInvite>("/api/team/invite", { method: "POST", body: JSON.stringify(body) }),
  teamPresence: (projectId?: string) =>
    request<Presence[]>(`/api/team/presence${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`),
  teamUsers: () => request<TeamUser[]>("/api/team/admin/users"),
  teamDevices: () => request<TeamDevice[]>("/api/team/admin/devices"),
  teamAudit: () => request<TeamAuditEntry[]>("/api/team/admin/audit"),
  teamStats: () =>
    request<{ users: number; events: number; bytes: number; online: number; rssMb: number }>("/api/team/admin/stats"),
  teamUpdateUser: (id: string, patch: { role?: string; disabled?: boolean; displayName?: string }) =>
    request<TeamUser>(`/api/team/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  teamResetUser: (id: string) => request<TeamInvite>(`/api/team/admin/users/${id}/reset`, { method: "POST" }),
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
    request<{ ok: boolean }>(`/api/projects/${projectId}/checkpoints/${id}/restore`, { method: "POST" }),
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
