import type { Checkpoint, FileEntry, GitChange, ProjectDetail } from "@godeye/core";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  File,
  FileDiff,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Replace,
  Save,
  Search,
  Sparkles,
  UserSearch,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { CheckpointRestore } from "../../components/CheckpointRestore";
import { EnhanceDialog } from "../../components/Enhance";
import { FilePreview } from "../../components/FilePreview";
import { Button } from "../../components/ui";
import { actions, type EnhanceCodeRequest } from "../../lib/actions";
import type { GitBranchInfo } from "../../lib/api";
import { api, fs } from "../../lib/api";
import { cn } from "../../lib/cn";
import { nameOf, previewKind } from "../../lib/files";
import { relativeTime } from "../../lib/format";
import type { EditorKeymap } from "../../lib/keymaps";
import { useSettings } from "../../lib/settings";

// Monaco is large; load it only when a file is opened.
const CodeEditor = lazy(() => import("../../components/CodeEditor"));
const DiffView = lazy(() => import("../../components/DiffView"));

interface Tab {
  path: string;
  mode: "file" | "diff";
  line?: number;
}

interface Buffer {
  content: string;
  saved: string;
  mtime: number;
  binary: boolean;
  conflict?: boolean;
}

function TreeNode({
  entry,
  depth,
  onOpen,
  active,
}: {
  entry: FileEntry;
  depth: number;
  onOpen: (path: string) => void;
  active?: string;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>();
  const toggle = async () => {
    if (entry.type === "file") return onOpen(entry.path);
    if (!children) setChildren(await fs.list(entry.path).catch(() => []));
    setOpen((v) => !v);
  };
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        data-nav-item
        style={{ paddingInlineStart: 8 + depth * 12 }}
        className={cn(
          "flex h-6 w-full items-center gap-1 pe-2 text-start text-[12.5px] hover:bg-bg-hover",
          active === entry.path && "bg-bg-active text-fg",
        )}
      >
        {entry.type === "dir" ? (
          <>
            {open ? (
              <ChevronDown size={12} className="shrink-0 text-fg-subtle" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-fg-subtle" />
            )}
            <Folder size={13} className="shrink-0 text-accent" />
          </>
        ) : (
          <File size={13} className="ms-3 shrink-0 text-fg-subtle" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {open &&
        children?.map((child) => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} onOpen={onOpen} active={active} />
        ))}
    </>
  );
}

const CHANGE_LABEL: Record<string, { label: string; className: string }> = {
  M: { label: "M", className: "text-warning" },
  A: { label: "A", className: "text-success" },
  D: { label: "D", className: "text-danger" },
  R: { label: "R", className: "text-accent" },
  "?": { label: "U", className: "text-success" },
};

function ChangesPanel({ project, onOpenDiff }: { project: ProjectDetail; onOpenDiff: (path: string) => void }) {
  const { t } = useTranslation();
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string>();
  const load = useCallback(() => {
    fs.changes(project.id)
      .then(setChanges)
      .catch(() => setChanges([]));
  }, [project.id]);
  useEffect(load, [load]);

  const commit = async () => {
    setStatus(undefined);
    // Recommended flow: work on a branch, merge to main, deploy only main.
    const branch = project.git?.branch;
    if (
      project.gitFlow &&
      (branch === "main" || branch === "master") &&
      !window.confirm(t("code.mainWarning", { branch }))
    )
      return;
    try {
      await fs.commit(project.id, message.trim());
      setMessage("");
      setStatus(t("code.committed"));
      load();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-border p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("code.commitPlaceholder")}
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-bg p-1.5 text-[12px] outline-none focus:border-accent"
        />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="primary"
            icon={GitCommitHorizontal}
            disabled={!message.trim() || changes.length === 0}
            onClick={commit}
          >
            {t("code.commit")}
          </Button>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load} aria-label={t("project.fetch")} />
        </div>
        {status && <p className="text-[11px] text-fg-muted">{status}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {changes.length === 0 ? (
          <p className="p-3 text-xs text-fg-subtle">{t("code.noChanges")}</p>
        ) : (
          changes.map((change) => {
            const key = change.code.trim()[0] ?? "M";
            const label = CHANGE_LABEL[key] ?? CHANGE_LABEL.M;
            return (
              <button
                key={change.path}
                type="button"
                data-nav-item
                onClick={() => onOpenDiff(change.path)}
                className="flex h-6 w-full items-center gap-2 px-2 text-start text-[12.5px] hover:bg-bg-hover"
              >
                <span className={cn("w-3 shrink-0 font-mono text-[11px] font-semibold", label?.className)}>
                  {label?.label}
                </span>
                <span className="truncate">{nameOf(change.path)}</span>
                <span className="ms-auto truncate text-[10px] text-fg-subtle">
                  {change.path.split("/").slice(0, -1).join("/")}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function SnapshotsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Checkpoint[]>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    fs.checkpoints(projectId)
      .then(setList)
      .catch(() => setList([]));
  }, [projectId]);
  useEffect(load, [load]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-border p-2">
        <p className="text-[11px] leading-snug text-fg-subtle">{t("checkpoint.hint")}</p>
        <Button
          size="sm"
          icon={History}
          onClick={async () => {
            setError(undefined);
            try {
              await fs.checkpointNow(projectId);
              load();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {t("checkpoint.now")}
        </Button>
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list?.length === 0 && <p className="p-3 text-xs text-fg-subtle">{t("checkpoint.none")}</p>}
        {list?.map((cp) => (
          <div key={cp.id} className="space-y-0.5 border-b border-border px-2 py-1.5">
            <p className="truncate text-[12px]">{cp.label}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-fg-subtle">{relativeTime(cp.at)}</span>
              <span className="flex-1" />
              <CheckpointRestore compact projectId={projectId} checkpointId={cp.id} onDone={load} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Branches and worktrees (plan.md 2.3); switching refuses when there are uncommitted changes. */
function BranchesPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    branches: GitBranchInfo[];
    worktrees: { path: string; branch?: string; head: string }[];
  }>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const load = () => {
    api
      .gitBranches(projectId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [projectId]);
  const sw = (branch: string, create = false) => {
    setError(undefined);
    api
      .gitSwitch(projectId, branch, create)
      .then(() => {
        setName("");
        load();
      })
      .catch((err: Error) => setError(err.message));
  };
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
          placeholder={t("code.newBranch")}
          aria-label={t("code.newBranch")}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent"
        />
        <Button
          size="sm"
          icon={Plus}
          disabled={!name}
          onClick={() => sw(name, true)}
          aria-label={t("code.createBranch")}
        />
      </div>
      <ul>
        {data?.branches.map((b) => (
          <li key={b.name}>
            <button
              type="button"
              disabled={b.current}
              onClick={() => window.confirm(t("code.switchConfirm", { branch: b.name })) && sw(b.name)}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-start hover:bg-bg-hover disabled:cursor-default"
              data-tip={b.subject}
            >
              <GitBranch size={12} className={b.current ? "text-accent" : "text-fg-subtle"} aria-hidden="true" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[11.5px]",
                  b.current && "font-semibold text-accent",
                )}
              >
                {b.name}
              </span>
              <span className="text-[10px] text-fg-subtle">{relativeTime(b.at)}</span>
            </button>
          </li>
        ))}
      </ul>
      {data && data.worktrees.length > 1 && (
        <div>
          <p className="px-1.5 text-[10.5px] font-medium text-fg-subtle uppercase">{t("code.worktrees")}</p>
          {data.worktrees.map((w) => (
            <p key={w.path} className="truncate px-1.5 py-0.5 font-mono text-[11px] text-fg-muted" data-tip={w.path}>
              {w.branch ?? w.head} · {w.path.split("/").pop()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchPanel({
  root,
  projectId,
  onOpen,
}: {
  root: string;
  projectId: string;
  onOpen: (path: string, line?: number) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [opts, setOpts] = useState({ regex: false, caseSensitive: false });
  const [preview, setPreview] = useState<{
    files: { path: string; count: number; samples: { line: number; before: string; after: string }[] }[];
    total: number;
  }>();
  const [note, setNote] = useState<string>();
  const previewReplace = () =>
    api
      .replaceInProject(projectId, { find: query, replace: replacement, ...opts })
      .then((r) => setPreview(r as typeof preview))
      .catch((err: Error) => setNote(err.message));
  const [hits, setHits] = useState<{ path: string; line?: number; text?: string }[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      fs.search(root, query.trim(), true)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, root]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="m-2 space-y-1">
        <label className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg px-2">
          <Search size={12} className="text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPreview(undefined);
            }}
            placeholder={t("code.search")}
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-fg-subtle"
          />
          <button
            type="button"
            aria-label={t("code.replaceToggle")}
            onClick={() => setReplacing(!replacing)}
            className={cn("rounded p-0.5", replacing ? "text-accent" : "text-fg-subtle hover:text-fg")}
          >
            <Replace size={12} />
          </button>
        </label>
        {replacing && (
          <>
            <input
              value={replacement}
              onChange={(e) => {
                setReplacement(e.target.value);
                setPreview(undefined);
              }}
              placeholder={t("code.replaceWith")}
              aria-label={t("code.replaceWith")}
              className="h-7 w-full rounded-md border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={opts.regex}
                  onChange={(e) => setOpts({ ...opts, regex: e.target.checked })}
                />{" "}
                .*
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={opts.caseSensitive}
                  onChange={(e) => setOpts({ ...opts, caseSensitive: e.target.checked })}
                />{" "}
                Aa
              </label>
              <div className="flex-1" />
              <Button size="sm" disabled={!query} onClick={() => void previewReplace()}>
                {t("code.replacePreview")}
              </Button>
            </div>
            {preview && (
              <div className="space-y-1 rounded-md border border-border bg-bg p-2 text-[11px]">
                <p>{t("code.replaceSummary", { total: preview.total, files: preview.files.length })}</p>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!preview.total}
                  onClick={() =>
                    window.confirm(t("code.replaceConfirm", { total: preview.total, files: preview.files.length })) &&
                    void api
                      .replaceInProject(projectId, { find: query, replace: replacement, ...opts, apply: true })
                      .then(() => {
                        setNote(t("code.replaced", { total: preview.total }));
                        setPreview(undefined);
                      })
                  }
                >
                  {t("code.replaceAll")}
                </Button>
              </div>
            )}
            {note && <p className="text-[11px] text-fg-muted">{note}</p>}
          </>
        )}
      </div>
      {preview && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {preview.files.map((f) => (
            <div key={f.path} className="px-2 py-1">
              <button
                type="button"
                onClick={() => onOpen(`${root}/${f.path}`)}
                className="truncate text-[12px] font-medium hover:text-accent"
              >
                {f.path} <span className="text-fg-subtle">({f.count})</span>
              </button>
              {f.samples.map((s) => (
                <p key={s.line} className="truncate font-mono text-[10.5px]">
                  <span className="text-danger line-through">{s.before}</span>{" "}
                  <span className="text-success">{s.after}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", preview && "hidden")}>
        {hits.map((hit) => (
          <button
            key={`${hit.path}:${hit.line}`}
            type="button"
            data-nav-item
            onClick={() => onOpen(hit.path, hit.line)}
            className="block w-full px-2 py-1 text-start hover:bg-bg-hover"
          >
            <p className="truncate text-[12px] font-medium">
              {nameOf(hit.path)}
              {hit.line && <span className="ms-1 text-fg-subtle">:{hit.line}</span>}
            </p>
            {hit.text && <p className="truncate font-mono text-[11px] text-fg-muted">{hit.text}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** VS Code-like code view for a project (plan.md 2.3). */
/** Editor → "write a prompt for this": opens the enhancer with the file and selection, then a chat with it waiting. */
function CodeEnhance({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [request, setRequest] = useState<EnhanceCodeRequest>();
  useEffect(() => actions.onEnhanceCode(setRequest), []);
  return (
    <EnhanceDialog
      open={!!request}
      onClose={() => setRequest(undefined)}
      target={{
        projectId,
        file: request && {
          path: request.file,
          selection: request.selection,
          startLine: request.startLine,
          endLine: request.endLine,
        },
      }}
      onUse={async (prompt) => {
        const chat = await api.startChat({ projectId });
        navigate(`/c/${chat.id}?draft=${encodeURIComponent(prompt)}`);
      }}
    />
  );
}

export function CodeTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  // Older settings only had a Vim switch.
  const keymap: EditorKeymap =
    settings.editorKeymap === "vscode" && settings.editorVim ? "vim" : (settings.editorKeymap ?? "vscode");
  const [panel, setPanel] = useState<"files" | "changes" | "branches" | "snapshots" | "search">("files");
  const [root, setRoot] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<Tab>();
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [diffs, setDiffs] = useState<Record<string, { original: string; modified: string }>>({});
  /** "Who wrote this" notes for the open file, when switched on. */
  const [blame, setBlame] = useState<{ line: number; text: string; hover?: string }[]>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: notes belong to one file
  useEffect(() => setBlame(undefined), [active?.path]);
  const [showPreview, setShowPreview] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fs.list(project.path)
      .then(setRoot)
      .catch((err: Error) => setError(err.message));
  }, [project.path]);

  const openFile = useCallback(
    async (path: string, line?: number) => {
      const tab: Tab = { path, mode: "file", line };
      setTabs((list) => (list.some((x) => x.path === path && x.mode === "file") ? list : [...list, tab]));
      setActive(tab);
      if (!buffers[path]) {
        const file = await fs.read(path).catch((err: Error) => {
          setError(err.message);
          return undefined;
        });
        if (!file) return;
        setBuffers((all) => ({
          ...all,
          [path]: {
            content: file.content ?? "",
            saved: file.content ?? "",
            mtime: file.mtime,
            binary: file.kind === "binary",
          },
        }));
      }
    },
    [buffers],
  );

  // Links from elsewhere (e.g. a finding's evidence): ?tab=code&file=src/a.ts&line=12
  const [params] = useSearchParams();
  const linked = params.get("file");
  const linkedLine = Number(params.get("line")) || undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: open once per link
  useEffect(() => {
    if (linked) void openFile(linked.startsWith("/") ? linked : `${project.path}/${linked}`, linkedLine);
  }, [linked, linkedLine]);

  const openDiff = async (relative: string) => {
    const path = `${project.path}/${relative}`;
    const tab: Tab = { path, mode: "diff" };
    setTabs((list) => (list.some((x) => x.path === path && x.mode === "diff") ? list : [...list, tab]));
    setActive(tab);
    const diff = await fs.diff(project.id, relative).catch(() => undefined);
    if (diff) setDiffs((all) => ({ ...all, [path]: diff }));
  };

  const closeTab = (tab: Tab) => {
    setTabs((list) => {
      const next = list.filter((x) => !(x.path === tab.path && x.mode === tab.mode));
      if (active?.path === tab.path && active.mode === tab.mode) setActive(next[next.length - 1]);
      return next;
    });
  };

  const buffer = active ? buffers[active.path] : undefined;
  const dirty = !!buffer && buffer.content !== buffer.saved;

  const save = useCallback(async () => {
    if (!active || !buffer || buffer.content === buffer.saved) return;
    try {
      const entry = await fs.write(active.path, buffer.content, buffer.mtime);
      setBuffers((all) => ({
        ...all,
        [active.path]: { ...buffer, saved: buffer.content, mtime: entry.mtime, conflict: false },
      }));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("changed on disk"))
        setBuffers((all) => ({ ...all, [active.path]: { ...buffer, conflict: true } }));
      else setError(message);
    }
  }, [active, buffer]);

  const reload = async () => {
    if (!active) return;
    const file = await fs.read(active.path);
    setBuffers((all) => ({
      ...all,
      [active.path]: {
        content: file.content ?? "",
        saved: file.content ?? "",
        mtime: file.mtime,
        binary: file.kind === "binary",
      },
    }));
  };

  const kind = active ? previewKind(active.path) : undefined;
  const textual = kind === "markdown" || kind === "csv" || kind === "json" || kind === "tree" || kind === undefined;
  const editorEl = useMemo(() => {
    if (!active) return null;
    if (active.mode === "diff") {
      const diff = diffs[active.path];
      return diff ? <DiffView path={active.path} original={diff.original} modified={diff.modified} /> : null;
    }
    if (!buffer) return null;
    if (kind && !textual) return <FilePreview path={active.path} kind={kind} />;
    if (buffer.binary) return <FilePreview path={active.path} kind="binary" />;
    if (kind && showPreview) return <FilePreview path={active.path} kind={kind} text={buffer.content} />;
    return (
      <CodeEditor
        path={active.path}
        value={buffer.saved}
        line={active.line}
        keymap={keymap}
        annotations={blame}
        onChange={(value) =>
          setBuffers((all) => ({ ...all, [active.path]: { ...(all[active.path] as Buffer), content: value } }))
        }
        onSave={save}
      />
    );
  }, [active, buffer, diffs, kind, textual, showPreview, keymap, save, blame]);

  return (
    <div className="flex min-h-96 min-w-0 flex-1">
      <CodeEnhance projectId={project.id} />
      <aside className="flex w-64 shrink-0 flex-col border-e border-border bg-bg-subtle">
        <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border px-1">
          {(["files", "changes", "branches", "snapshots", "search"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setPanel(name)}
              className={cn(
                "h-6 rounded px-2 text-[11.5px]",
                panel === name ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {name === "files" ? (
                t("code.files")
              ) : name === "changes" ? (
                t("code.changes")
              ) : name === "branches" ? (
                <GitBranch size={12} aria-label={t("code.branches")} />
              ) : name === "snapshots" ? (
                <History size={12} aria-label={t("checkpoint.title")} />
              ) : (
                <Search size={12} />
              )}
            </button>
          ))}
        </div>
        {panel === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {root.map((entry) => (
              <TreeNode key={entry.path} entry={entry} depth={0} onOpen={openFile} active={active?.path} />
            ))}
          </div>
        ) : panel === "changes" ? (
          <ChangesPanel project={project} onOpenDiff={openDiff} />
        ) : panel === "branches" ? (
          <BranchesPanel projectId={project.id} />
        ) : panel === "snapshots" ? (
          <SnapshotsPanel projectId={project.id} />
        ) : (
          <SearchPanel root={project.path} projectId={project.id} onOpen={openFile} />
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-bg-subtle">
          {tabs.map((tab) => {
            const isActive = active?.path === tab.path && active.mode === tab.mode;
            const tabDirty =
              tab.mode === "file" && buffers[tab.path] && buffers[tab.path]?.content !== buffers[tab.path]?.saved;
            return (
              <div
                key={`${tab.mode}:${tab.path}`}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 border-e border-border px-3 text-[12px]",
                  isActive ? "bg-bg text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-fg-muted hover:bg-bg-hover",
                )}
              >
                <button type="button" onClick={() => setActive(tab)} className="flex items-center gap-1.5">
                  {tab.mode === "diff" ? <FileDiff size={12} className="text-warning" /> : <File size={12} />}
                  {nameOf(tab.path)}
                  {tabDirty && <span className="size-1.5 rounded-full bg-accent" />}
                </button>
                <button
                  type="button"
                  aria-label={t("code.closeTab")}
                  onClick={() => closeTab(tab)}
                  className="text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
          <div className="flex-1" />
          {active?.mode === "file" && (kind === "markdown" || kind === "csv" || kind === "json" || kind === "tree") && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1 px-2 text-[11.5px] text-fg-muted hover:text-fg"
            >
              {showPreview ? <Pencil size={12} /> : <Eye size={12} />}
              {showPreview ? t("code.edit") : t("code.preview")}
            </button>
          )}
          {active?.mode === "file" && buffer && !buffer.binary && (
            <button
              type="button"
              onClick={() => {
                if (blame) return setBlame(undefined);
                void api.gitBlame(project.id, active.path).then((lines) => {
                  // One note per block of lines from the same change.
                  const notes: { line: number; text: string; hover?: string }[] = [];
                  let last = "";
                  for (const l of lines) {
                    const key = `${l.hash}|${l.session?.id ?? ""}`;
                    if (key === last) continue;
                    last = key;
                    const who = l.session
                      ? `${l.session.author ?? t("team.you")} · ${l.session.tool} · ${l.session.title}`
                      : l.author || t("code.notCommitted");
                    notes.push({
                      line: l.line,
                      text: `${who}${l.at ? ` · ${relativeTime(l.at)}` : ""}`,
                      hover: [
                        l.hash ? `${l.hash} ${l.summary}` : t("code.notCommitted"),
                        l.session
                          ? `[${t("code.openSession")}](${location.origin}/p/${project.id}/s/${l.session.id})`
                          : "",
                      ]
                        .filter(Boolean)
                        .join("\n\n"),
                    });
                  }
                  setBlame(notes);
                });
              }}
              className={cn(
                "flex items-center gap-1 px-2 text-[11.5px] hover:text-accent",
                blame ? "text-accent" : "text-fg-muted",
              )}
              data-tip={t("code.blameTip")}
            >
              <UserSearch size={12} aria-hidden="true" />
              {t("code.blame")}
            </button>
          )}
          {active?.mode === "file" && buffer && !buffer.binary && (
            <button
              type="button"
              onClick={() =>
                actions.quickAsk({
                  question: t("quick.explainFile"),
                  attachment: { name: nameOf(active.path), text: buffer.content },
                })
              }
              className="flex items-center gap-1 px-2 text-[11.5px] text-fg-muted hover:text-accent"
            >
              <Sparkles size={12} />
              {t("quick.explain")}
            </button>
          )}
          <select
            value={keymap}
            onChange={(e) => {
              const next = e.target.value as EditorKeymap;
              void update({ editorKeymap: next, editorVim: next === "vim" });
            }}
            aria-label={t("code.keymap")}
            data-tip={t("code.keymapTip")}
            className="h-6 bg-transparent px-1 font-mono text-[11px] text-fg-subtle outline-none hover:text-fg"
          >
            {(["vscode", "jetbrains", "vim", "emacs"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`code.keymap_${k}`)}
              </option>
            ))}
          </select>
          {active?.mode === "file" && buffer && !buffer.binary && (
            <button
              type="button"
              onClick={save}
              disabled={!dirty}
              className="flex items-center gap-1 px-3 text-[11.5px] text-fg-muted hover:text-fg disabled:opacity-40"
            >
              <Save size={12} />
              {dirty ? t("code.save") : t("code.saved")}
            </button>
          )}
        </div>
        {buffer?.conflict && (
          <div className="flex items-center gap-3 border-b border-warning bg-warning-soft px-3 py-1.5 text-xs text-warning">
            {t("code.conflict")}
            <Button size="sm" onClick={reload}>
              {t("code.reload")}
            </Button>
          </div>
        )}
        {error && (
          <button
            type="button"
            onClick={() => setError(undefined)}
            className="border-b border-border bg-danger-soft px-3 py-1 text-start text-xs text-danger"
          >
            {error}
          </button>
        )}
        <div className="min-h-0 flex-1">
          {active ? (
            <Suspense fallback={<div className="h-full animate-pulse bg-bg-subtle" />}>{editorEl}</Suspense>
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-fg-subtle">
              {t("code.pickFile")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
