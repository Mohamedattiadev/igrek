import type {
  Approval,
  AskAnswer,
  ChatInfo,
  ChatMode,
  Checkpoint,
  CommandRisk,
  Digest,
  FileContent,
  FileEntry,
  GitChange,
  GitInfo,
  Idea,
  IdeaStatus,
  IndexStatus,
  MemorySection,
  ProjectDetail,
  ProjectListItem,
  QuickAnswer,
  RemoteRun,
  SavedPrompt,
  SearchHit,
  ServerHealth,
  ServerInfo,
  SessionDetail,
  SessionListItem,
  SessionSummaryData,
  Settings,
  SystemStatus,
  TerminalInfo,
  TerminalTool,
  TimelineEntry,
  TrashItem,
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
  terminalInput: (id: string, text: string) =>
    request<{ ok: boolean }>(`/api/terminals/${id}/input`, { method: "POST", body: JSON.stringify({ text }) }),
  ideas: () => request<Idea[]>("/api/ideas"),
  addIdea: (text: string, projectId?: string) =>
    request<Idea>("/api/ideas", { method: "POST", body: JSON.stringify({ text, projectId }) }),
  updateIdea: (id: string, patch: { status?: IdeaStatus; projectId?: string | null; text?: string }) =>
    request<{ ok: boolean }>(`/api/ideas/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteIdea: (id: string) => request<{ ok: boolean }>(`/api/ideas/${id}`, { method: "DELETE" }),
  triageIdeas: () => request<Idea[]>("/api/ideas/triage", { method: "POST" }),
  prompts: () => request<SavedPrompt[]>("/api/prompts"),
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
  startChat: (body: { projectId: string; resume?: string; model?: string; mode?: ChatMode }) =>
    request<ChatInfo>("/api/chats", { method: "POST", body: JSON.stringify(body) }),
  chatModel: (id: string, model: string) =>
    request<ChatInfo>(`/api/chats/${id}/model`, { method: "POST", body: JSON.stringify({ model }) }),
  closeChat: (id: string) => request<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  inbox: () => request<{ conflicts: { projectId: string; projectName: string; count: number }[] }>("/api/inbox"),
  terminals: () => request<TerminalInfo[]>("/api/terminals"),
  startTerminal: (body: { projectId: string; tool: TerminalTool; resume?: string; fork?: boolean }) =>
    request<TerminalInfo>("/api/terminals", { method: "POST", body: JSON.stringify(body) }),
  handoff: (sessionId: string, tool?: TerminalTool) =>
    request<TerminalInfo>(`/api/sessions/${sessionId}/handoff`, { method: "POST", body: JSON.stringify({ tool }) }),
  closeTerminal: (id: string) => request<{ ok: boolean }>(`/api/terminals/${id}`, { method: "DELETE" }),
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
