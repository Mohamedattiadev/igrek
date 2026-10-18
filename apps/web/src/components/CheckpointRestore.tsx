import { History, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import { Button, Dialog } from "./ui";

/**
 * "Go back to this point": shows what would change, then restores (the current state is saved first).
 * After a restore, "Undo" puts back the state saved just before it.
 */
export function CheckpointRestore({
  projectId,
  checkpointId,
  compact,
  busy,
  onDone,
}: {
  projectId: string;
  checkpointId: string;
  compact?: boolean;
  /** An AI is working in the project: restoring now would mix its edits with the old files. */
  busy?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>();
  const [status, setStatus] = useState<string>();
  const [backup, setBackup] = useState<string>();
  const open = async () => setFiles(await fs.checkpointChanges(projectId, checkpointId).catch(() => []));
  const restore = async () => {
    try {
      const result = await fs.restoreCheckpoint(projectId, checkpointId);
      setStatus(t("checkpoint.restored"));
      setBackup(result.backup?.id);
      setFiles(undefined);
      onDone?.();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };
  const undo = async () => {
    if (!backup) return;
    try {
      await fs.restoreCheckpoint(projectId, backup);
      setStatus(t("checkpoint.undone"));
      setBackup(undefined);
      onDone?.();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };
  const label = busy ? t("checkpoint.busy") : (status ?? t("checkpoint.restore"));
  return (
    <>
      {compact ? (
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            title={busy ? t("checkpoint.busy") : undefined}
            className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent disabled:cursor-not-allowed disabled:hover:text-fg-subtle"
          >
            <History size={11} aria-hidden="true" />
            {label}
          </button>
          {backup && (
            <button
              type="button"
              onClick={undo}
              className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent"
            >
              <Undo2 size={11} aria-hidden="true" />
              {t("checkpoint.undo")}
            </button>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={open} disabled={busy}>
            {label}
          </Button>
          {backup && (
            <Button size="sm" variant="ghost" icon={Undo2} onClick={undo}>
              {t("checkpoint.undo")}
            </Button>
          )}
        </span>
      )}
      <Dialog open={files !== undefined} onClose={() => setFiles(undefined)} label={t("checkpoint.restoreTitle")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("checkpoint.restoreTitle")}</h2>
          <p className="text-[13px] text-fg-muted">{t("checkpoint.restoreBody")}</p>
          <ul className="max-h-48 overflow-y-auto rounded-md bg-bg-subtle p-2 font-mono text-[11.5px]">
            {files?.length === 0 && <li className="text-fg-subtle">—</li>}
            {files?.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFiles(undefined)}>
              {t("memory.cancel")}
            </Button>
            <Button variant="primary" icon={RotateCcw} disabled={files?.length === 0} onClick={restore}>
              {t("checkpoint.restore")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
