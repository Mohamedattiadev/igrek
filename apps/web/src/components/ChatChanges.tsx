import type { ChatEvent, ChatInfo } from "@igrek/core";
import { ChevronDown, ChevronRight, FileDiff, Undo2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { editedPath } from "../lib/why";
import { Button, Dialog } from "./ui";
import { WhyButton } from "./Why";

const DiffView = lazy(() => import("./DiffView"));

type FileDiffData = Awaited<ReturnType<typeof api.chatChangeDiff>>;

/** The last step that edited each file, by its path inside the chat's folder (for "Why?"). */
function lastEdits(events: ChatEvent[], cwd: string): Map<string, string> {
  const edits = new Map<string, string>();
  for (const event of events) {
    const path = editedPath(event);
    if (!path) continue;
    edits.set(path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path, event.id);
  }
  return edits;
}

/**
 * The files this chat changed (plan.md 2.2), above the box while it works: open one for its diff,
 * put one back as it was before the chat with one click, or ask why it changed. Measured against
 * the checkpoint taken before the first message, so changes made by commands count too.
 */
export function ChatChanges({ info, events }: { info: ChatInfo; events: ChatEvent[] }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<{ path: string; data: FileDiffData }>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  // Steps that finished: a file may have changed. Counting them keeps the list fresh while it works.
  const finished = events.filter((e) => e.kind === "tool" && e.status !== "running").length;
  const edits = useMemo(() => lastEdits(events, info.cwd), [events, info.cwd]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when a step finishes or after an undo
  useEffect(() => {
    let current = true;
    api
      .chatChanges(info.id)
      .then((r) => current && setFiles(r.files))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [info.id, finished, info.status, reload]);
  if (!files.length) return null;
  const busy = info.status === "working" || info.status === "waiting";
  const revert = async (path: string) => {
    setError(undefined);
    try {
      await api.revertChatChange(info.id, path);
      setDiff(undefined);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="mb-1.5 rounded-ui border border-border bg-bg-subtle text-[12.5px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        )}
        <FileDiff size={13} className="shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-fg-muted">{t("changes.count", { count: files.length })}</span>
      </button>
      {open && (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto border-t border-border p-1">
          {files.map((path) => (
            <li key={path} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-bg-hover">
              <button
                type="button"
                onClick={async () => {
                  setError(undefined);
                  try {
                    setDiff({ path, data: await api.chatChangeDiff(info.id, path) });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
                className="min-w-0 flex-1 truncate text-start font-mono text-[11.5px] hover:text-accent"
              >
                {path}
              </button>
              {edits.get(path) && <WhyButton eventId={edits.get(path) ?? ""} file={path} />}
              <button
                type="button"
                disabled={busy}
                onClick={() => void revert(path)}
                data-tip={busy ? t("checkpoint.busy") : t("changes.undoTip")}
                className="flex shrink-0 items-center gap-1 rounded px-1 text-[11.5px] text-fg-subtle hover:bg-bg-active hover:text-fg disabled:opacity-40"
              >
                <Undo2 size={12} aria-hidden="true" />
                {t("changes.undo")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="px-2.5 pb-1.5 text-xs text-danger">{error}</p>}
      <Dialog open={!!diff} onClose={() => setDiff(undefined)} label={t("changes.diffTitle")} wide>
        {diff && (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">{diff.path}</h2>
              <Button size="sm" icon={Undo2} disabled={busy} onClick={() => void revert(diff.path)}>
                {t("changes.undo")}
              </Button>
            </div>
            {diff.data.added && <p className="text-xs text-fg-muted">{t("changes.added")}</p>}
            {diff.data.deleted && <p className="text-xs text-fg-muted">{t("changes.deleted")}</p>}
            {diff.data.binary ? (
              <p className="text-xs text-fg-muted">{t("changes.binary")}</p>
            ) : (
              <div className="h-[60vh] overflow-hidden rounded-ui border border-border">
                <Suspense fallback={null}>
                  <DiffView path={diff.path} original={diff.data.original} modified={diff.data.modified} />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
