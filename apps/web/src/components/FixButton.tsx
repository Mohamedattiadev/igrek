import { Play, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, type FixId } from "../lib/api";
import { useBusyState } from "../lib/background";
import { Button, CopyButton, Dialog } from "./ui";

/**
 * One click instead of a command to type (plan.md 7.2): Igrek shows the exact command it would run,
 * and only after "Run it" starts it in a terminal the user watches. No model is asked, so it costs
 * nothing. Where Igrek's terminal does not work (Windows), the command is there to copy.
 */
export function FixButton({
  fix,
  projectId,
  label,
  variant = "secondary",
  onTerminal,
}: {
  fix: FixId;
  projectId?: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  /** Where the terminal opens instead of its page: the first-run wizard has no pages yet. */
  onTerminal?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<{ command: string; cwd: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useBusyState(`FixButton.${fix}.${projectId ?? ""}`, label);
  const open = () => {
    setError(undefined);
    api
      .fixPlan(fix, projectId)
      .then(setPlan)
      .catch((err: Error) => setError(err.message));
  };
  const run = () => {
    setBusy(true);
    api
      .runFix(fix, projectId)
      .then((term) => {
        setPlan(undefined);
        if (onTerminal) onTerminal(term.id);
        else void navigate(`/t/${term.id}`);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <Button size="sm" variant={variant} icon={Wrench} onClick={open} data-tip={t("fix.tip")}>
        {label}
      </Button>
      {error && !plan && <span className="text-xs text-danger">{error}</span>}
      <Dialog open={!!plan} onClose={() => setPlan(undefined)} label={t("fix.title")}>
        {plan && (
          <div className="space-y-3 p-5 text-[13px]">
            <h2 className="text-[15px] font-semibold">{t("fix.title")}</h2>
            <p className="text-fg-muted">{t("fix.body")}</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-ui bg-bg-subtle px-2 py-1.5 font-mono text-[12px] break-all">
                {plan.command}
              </code>
              <CopyButton text={plan.command} />
            </div>
            <p className="text-[12px] text-fg-subtle">{t("fix.where", { folder: plan.cwd })}</p>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPlan(undefined)}>
                {t("fix.cancel")}
              </Button>
              <Button variant="primary" icon={Play} onClick={run} disabled={busy} autoFocus>
                {t("fix.run")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
