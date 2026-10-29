import type { FileEntry, TrashItem } from "@igrek/core";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Copy,
  Download,
  File,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePreview } from "../components/FilePreview";
import { ResizeHandle, usePanelSize } from "../components/Resizable";
import { Badge, Button, Card, Dialog, field, PageHeader } from "../components/ui";
import { actions } from "../lib/actions";
import { api, fs } from "../lib/api";
import { cn } from "../lib/cn";
import { fileSize, nameOf, parentOf, previewKind } from "../lib/files";
import { relativeTime } from "../lib/format";
import { useSettings } from "../lib/settings";

const CodeEditor = lazy(() => import("../components/CodeEditor"));

interface Root {
  label: string;
  path: string;
}

/** Asks for one line of text (folder name, new name). */
function Prompt({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the field every time the dialog opens
  useEffect(() => {
    setValue(initial ?? "");
    setError(undefined);
  }, [initial, open]);
  const submit = async () => {
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={title}>
      <div className="space-y-3 p-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <input
          value={value}
          aria-label={title}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className={cn(field, "w-full")}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("memory.cancel")}
          </Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>
            {t("project.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Viewer({ entry }: { entry: FileEntry }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [text, setText] = useState<{ content: string; mtime: number; binary: boolean }>();
  const [draft, setDraft] = useState<string>();
  const [status, setStatus] = useState<string>();
  const kind = previewKind(entry.path);

  useEffect(() => {
    setText(undefined);
    setDraft(undefined);
    setStatus(undefined);
    if (kind && !["markdown", "csv", "json", "tree"].includes(kind)) return;
    // A slow read of the previous file must not land in this one (and be saved over it).
    let live = true;
    fs.read(entry.path)
      .then((f) => live && setText({ content: f.content ?? "", mtime: f.mtime, binary: f.kind === "binary" }))
      .catch((err: Error) => live && setStatus(err.message));
    return () => {
      live = false;
    };
  }, [entry.path, kind]);

  const save = async () => {
    if (draft === undefined || !text) return;
    try {
      const saved = await fs.write(entry.path, draft, text.mtime);
      setText({ ...text, content: draft, mtime: saved.mtime });
      setDraft(undefined);
      setStatus(t("code.saved"));
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{entry.name}</span>
        {status && <span className="text-[11px] text-fg-muted">{status}</span>}
        {draft !== undefined && (
          <Button size="sm" variant="primary" onClick={save}>
            {t("code.save")}
          </Button>
        )}
        {text && !text.binary && (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={ScanSearch}
              onClick={() =>
                actions.quickAsk({
                  question: t("preview.explainAsk"),
                  attachment: { name: entry.name, text: text.content },
                })
              }
            >
              {t("preview.explain")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                actions.quickAsk({
                  question: t("preview.summarizeAsk"),
                  attachment: { name: entry.name, text: text.content },
                })
              }
            >
              {t("preview.summarize")}
            </Button>
          </>
        )}
        <a href={fs.rawUrl(entry.path, true)} aria-label={t("code.download")}>
          <Button size="sm" variant="ghost" icon={Download} />
        </a>
      </div>
      <div className="min-h-0 flex-1">
        {kind && !["markdown", "csv", "json", "tree"].includes(kind) ? (
          <FilePreview path={entry.path} kind={kind} />
        ) : !text ? null : text.binary ? (
          <FilePreview path={entry.path} kind="binary" />
        ) : kind && draft === undefined ? (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => setDraft(text.content)}
              className="self-end px-3 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              <Pencil size={11} className="me-1 inline" />
              {t("code.edit")}
            </button>
            <div className="min-h-0 flex-1">
              <FilePreview path={entry.path} kind={kind} text={text.content} />
            </div>
          </div>
        ) : (
          <Suspense fallback={<div className="h-full animate-pulse bg-bg-subtle" />}>
            <CodeEditor
              path={entry.path}
              value={text.content}
              keymap={settings.editorKeymap === "vscode" && settings.editorVim ? "vim" : settings.editorKeymap}
              onChange={(value) => setDraft(value === text.content ? undefined : value)}
              onSave={save}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * File manager (plan.md 2.4): only inside projects and folders you allowed,
 * deletes go to a trash you can restore from.
 */
export function FilesPage() {
  const { t } = useTranslation();
  const [placesWidth, setPlacesWidth] = usePanelSize("files-places", 208, 150, 420);
  const { settings, update } = useSettings();
  const [roots, setRoots] = useState<Root[]>([]);
  const [cwd, setCwd] = useState<string>();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry>();
  const [view, setView] = useState<"list" | "grid">("list");
  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<"mkdir" | "rename" | "addRoot">();
  const [trash, setTrash] = useState<TrashItem[]>();
  const [usage, setUsage] = useState<{ path: string; size: number }[]>();
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .projects()
      .then((projects) =>
        setRoots([
          ...projects.filter((p) => !p.hidden).map((p) => ({ label: p.name, path: p.path })),
          ...settings.allowedFolders.map((path) => ({ label: nameOf(path), path })),
        ]),
      )
      .catch(() => undefined);
  }, [settings.allowedFolders]);

  useEffect(() => {
    if (!cwd && roots[0]) setCwd(roots[0].path);
  }, [cwd, roots]);

  const load = useCallback(() => {
    if (!cwd) return;
    setError(undefined);
    fs.list(cwd, hidden)
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, [cwd, hidden]);
  useEffect(load, [load]);

  const root = roots.find((r) => cwd === r.path || cwd?.startsWith(`${r.path}/`));
  const crumbs = useMemo(() => {
    if (!cwd || !root) return [];
    const rest = cwd.slice(root.path.length).split("/").filter(Boolean);
    return [
      { label: root.label, path: root.path },
      ...rest.map((part, i) => ({ label: part, path: `${root.path}/${rest.slice(0, i + 1).join("/")}` })),
    ];
  }, [cwd, root]);

  const shown = entries.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));

  const open = (entry: FileEntry) => {
    if (entry.type === "dir") {
      setCwd(entry.path);
      setSelected(undefined);
      setUsage(undefined);
    } else setSelected(entry);
  };

  const act = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const upload = (list: FileList | null) => {
    if (list?.length && cwd) void act(() => fs.upload(cwd, list));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("files.title")}
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => setDialog("mkdir")}>
              {t("files.newFolder")}
            </Button>
            <Button size="sm" variant="ghost" icon={Upload} onClick={() => uploadRef.current?.click()}>
              {t("files.upload")}
            </Button>
            <input ref={uploadRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            <Button
              size="sm"
              variant="ghost"
              icon={HardDrive}
              onClick={() =>
                cwd &&
                fs
                  .usage(cwd)
                  .then(setUsage)
                  .catch((err: Error) => setError(err.message))
              }
            >
              {t("files.usage")}
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => fs.trashList().then(setTrash)}>
              {t("files.trash")}
            </Button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className="hidden shrink-0 overflow-y-auto border-e border-border bg-bg-subtle py-2 md:block"
          style={{ width: placesWidth }}
        >
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("files.roots")}
          </p>
          {roots.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => {
                setCwd(r.path);
                setSelected(undefined);
              }}
              className={cn(
                "flex h-7 w-full items-center gap-2 px-3 text-start text-[12.5px] hover:bg-bg-hover",
                root?.path === r.path && "bg-bg-active font-medium",
              )}
            >
              <FolderOpen size={13} className="shrink-0 text-accent" />
              <span className="truncate">{r.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDialog("addRoot")}
            className="mt-1 flex h-7 w-full items-center gap-2 px-3 text-start text-[12px] text-fg-subtle hover:text-fg"
          >
            <Plus size={13} />
            {t("files.addFolder")}
          </button>
          <p className="px-3 pt-3 text-[10.5px] leading-snug text-fg-subtle">{t("files.protected")}</p>
        </aside>
        <div className="hidden md:flex">
          <ResizeHandle size={placesWidth} onSize={setPlacesWidth} min={150} max={420} />
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone for uploads; the Upload button is the keyboard path */}
        <section
          className={cn(
            "relative min-w-0 flex-1 flex-col",
            // On a phone one panel at a time: an open file covers the list.
            selected?.type === "file" ? "hidden md:flex" : "flex",
            dragging && "ring-2 ring-inset ring-accent",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5 md:hidden">
            <select
              value={root?.path ?? ""}
              onChange={(e) => {
                if (e.target.value === "+") return setDialog("addRoot");
                setCwd(e.target.value);
                setSelected(undefined);
              }}
              aria-label={t("files.roots")}
              className={cn(field, "min-w-0 flex-1")}
            >
              {roots.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.label}
                </option>
              ))}
              <option value="+">{t("files.addFolder")}</option>
            </select>
          </div>
          <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
            <button
              type="button"
              aria-label={t("files.up")}
              disabled={!cwd || cwd === root?.path}
              onClick={() => cwd && setCwd(parentOf(cwd))}
              className="rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[12.5px]">
              {crumbs.map((crumb, i) => (
                <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
                  {i > 0 && <ChevronRight size={12} className="text-fg-subtle rtl:rotate-180" />}
                  <button type="button" onClick={() => setCwd(crumb.path)} className="rounded px-1 hover:bg-bg-hover">
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
            <label className="flex h-6 w-full items-center gap-1.5 rounded-md border border-border bg-bg px-2 sm:w-44">
              <Search size={11} className="text-fg-subtle" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("files.search")}
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-fg-subtle"
              />
            </label>
            <label className="flex items-center gap-1 px-1 text-[11px] text-fg-muted">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              {t("files.hidden")}
            </label>
            <button
              type="button"
              aria-label={t("files.list")}
              onClick={() => setView("list")}
              className={cn("rounded p-1", view === "list" ? "text-accent" : "text-fg-subtle")}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              aria-label={t("files.grid")}
              onClick={() => setView("grid")}
              className={cn("rounded p-1", view === "grid" ? "text-accent" : "text-fg-subtle")}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
          {error && <p className="border-b border-border bg-danger-soft px-3 py-1 text-xs text-danger">{error}</p>}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent-soft/60 text-[13px] font-medium text-accent">
              {t("files.dropHere")}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {usage ? (
              <div className="space-y-1 p-3">
                {usage.map((u) => (
                  <div key={u.path} className="flex items-center gap-3 text-[12.5px]">
                    <span className="w-40 truncate">{nameOf(u.path)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${(u.size / (usage[0]?.size || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-end font-mono text-[11px] text-fg-muted">{fileSize(u.size)}</span>
                  </div>
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="space-y-1 p-6 text-center text-[13px]">
                <p className="text-fg-subtle">{t("files.empty")}</p>
                <p className="text-xs text-fg-subtle">{t("files.emptyHint")}</p>
              </div>
            ) : view === "list" ? (
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-bg text-[11px] text-fg-subtle">
                  <tr className="border-b border-border">
                    <th className="px-3 py-1.5 text-start font-medium">{t("files.name")}</th>
                    <th className="w-24 px-3 py-1.5 text-end font-medium">{t("files.size")}</th>
                    <th className="w-32 px-3 py-1.5 text-end font-medium">{t("files.modified")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((entry) => (
                    <tr
                      key={entry.path}
                      data-nav-item
                      tabIndex={0}
                      onClick={() => setSelected(entry)}
                      onDoubleClick={() => open(entry)}
                      onKeyDown={(e) => e.key === "Enter" && open(entry)}
                      className={cn(
                        "cursor-default hover:bg-bg-hover",
                        selected?.path === entry.path && "bg-bg-active",
                      )}
                    >
                      <td className="flex items-center gap-2 px-3 py-1.5">
                        {entry.type === "dir" ? (
                          <FolderOpen size={14} className="text-accent" />
                        ) : (
                          <File size={14} className="text-fg-subtle" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </td>
                      <td className="px-3 py-1.5 text-end font-mono text-[11px] text-fg-muted">
                        {entry.type === "file" ? fileSize(entry.size) : ""}
                      </td>
                      <td className="px-3 py-1.5 text-end text-[11px] text-fg-muted">{relativeTime(entry.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-3">
                {shown.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    data-nav-item
                    onClick={() => setSelected(entry)}
                    onDoubleClick={() => open(entry)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-ui p-2 text-[11.5px] hover:bg-bg-hover",
                      selected?.path === entry.path && "bg-bg-active",
                    )}
                  >
                    {entry.type === "dir" ? (
                      <FolderOpen size={30} strokeWidth={1.25} className="text-accent" />
                    ) : previewKind(entry.path) === "image" ? (
                      <img src={fs.rawUrl(entry.path)} alt="" className="h-12 w-full rounded object-cover" />
                    ) : (
                      <File size={30} strokeWidth={1.25} className="text-fg-subtle" />
                    )}
                    <span className="w-full truncate text-center">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div className="flex h-9 shrink-0 items-center gap-1 border-t border-border bg-bg-subtle px-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDialog("rename")}>
                {t("files.rename")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={() => navigator.clipboard?.writeText(selected.path)}
              >
                {t("files.copyPath")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={() =>
                  act(async () => {
                    await fs.trash(selected.path);
                    setSelected(undefined);
                  })
                }
              >
                {t("files.delete")}
              </Button>
            </div>
          )}
        </section>

        {selected?.type === "file" && (
          <aside className="flex min-w-0 flex-1 flex-col md:w-[44%] md:min-w-80 md:flex-none md:shrink-0 md:border-s md:border-border">
            <button
              type="button"
              onClick={() => setSelected(undefined)}
              className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3 text-[13px] text-fg-muted hover:text-fg md:hidden"
            >
              <ArrowLeft size={14} className="rtl:rotate-180" />
              {t("files.backToList")}
            </button>
            <div className="min-h-0 flex-1">
              <Viewer entry={selected} />
            </div>
          </aside>
        )}
      </div>

      <Prompt
        open={dialog === "mkdir"}
        title={t("files.newFolder")}
        onClose={() => setDialog(undefined)}
        onSubmit={async (name) => {
          if (cwd) await fs.mkdir(`${cwd}/${name}`);
          load();
        }}
      />
      <Prompt
        open={dialog === "rename"}
        title={t("files.rename")}
        initial={selected?.name}
        onClose={() => setDialog(undefined)}
        onSubmit={async (name) => {
          if (!selected) return;
          const renamed = await fs.rename(selected.path, `${parentOf(selected.path)}/${name}`);
          setSelected(renamed);
          load();
        }}
      />
      <Prompt
        open={dialog === "addRoot"}
        title={t("files.addFolder")}
        initial=""
        onClose={() => setDialog(undefined)}
        onSubmit={async (path) => {
          await update({ allowedFolders: [...settings.allowedFolders, path] });
          setCwd(path);
        }}
      />
      <Dialog open={!!trash} onClose={() => setTrash(undefined)} label={t("files.trash")}>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t("files.trash")}</h2>
          {trash?.length === 0 && <p className="text-[13px] text-fg-muted">{t("files.emptyTrash")}</p>}
          <Card>
            <ul className="divide-y divide-border">
              {trash?.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate" title={item.path}>
                    {nameOf(item.path)}
                  </span>
                  <Badge>{relativeTime(item.deletedAt)}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RotateCcw}
                    onClick={() =>
                      act(async () => {
                        await fs.restore(item.id);
                        setTrash(await fs.trashList());
                      })
                    }
                  >
                    {t("files.restore")}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Dialog>
    </div>
  );
}
