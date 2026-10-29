import { OctagonX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useStoppable } from "../lib/live";
import { Button, Count, Dialog } from "./ui";

/**
 * Emergency stop (plan.md Faz 0): always visible, halts everything that runs on its own. Red only
 * while something runs: red on an idle screen told newcomers something was wrong.
 */
export function StopButton({ onStopped }: { onStopped: (message: string) => void }) {
  const { t } = useTranslation();
  const running = useStoppable();
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
        // Only the icon and how many things run: the tip says what it does, the dialog asks before anything stops.
        data-tip={running ? t("stop.running", { count: running }) : t("stop.idle")}
        aria-label={t("stop.title")}
        className={`flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ui px-2 text-xs font-medium ${
          running ? "text-danger hover:bg-danger-soft" : "text-fg-subtle hover:bg-bg-hover hover:text-danger"
        }`}
      >
        <OctagonX size={14} strokeWidth={2} />
        {running > 0 && <Count n={running} tone="danger" />}
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
