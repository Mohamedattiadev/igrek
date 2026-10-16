import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import { Button, Dialog } from "./ui";

/** "Go back to this point": shows what would change, then restores (the current state is saved first). */
export function CheckpointRestore({
  projectId,
  checkpointId,
  compact,
  onDone,
}: {
  projectId: string;
  checkpointId: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>();
  const [status, setStatus] = useState<string>();
  const open = async () => setFiles(await fs.checkpointChanges(projectId, checkpointId).catch(() => []));
  const restore = async () => {
    try {
      await fs.restoreCheckpoint(projectId, checkpointId);
      setStatus(t("checkpoint.restored"));
      setFiles(undefined);
      onDone?.();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent"
        >
          <History size={11} />
          {status ?? t("checkpoint.restore")}
        </button>
      ) : (
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={open}>
          {status ?? t("checkpoint.restore")}
        </Button>
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
