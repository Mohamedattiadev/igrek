import { OctagonX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, Dialog } from "./ui";

/** Emergency stop (plan.md Faz 0): always visible, halts everything that runs on its own. */
export function StopButton({ onStopped }: { onStopped: (message: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = async () => {
    setBusy(true);
    try {
      await api.emergencyStop();
      onStopped(t("stop.done"));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("stop.title")}
        className="flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs font-medium text-danger hover:bg-danger-soft"
      >
        <OctagonX size={14} strokeWidth={2} />
        <span className="hidden sm:inline">{t("stop.button")}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("stop.title")}>
        <div className="p-5">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <OctagonX size={18} />
          </div>
          <h2 className="text-[15px] font-semibold">{t("stop.title")}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t("stop.body")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("stop.cancel")}
          </Button>
          <Button variant="danger" onClick={stop} disabled={busy} autoFocus>
            {t("stop.confirm")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
