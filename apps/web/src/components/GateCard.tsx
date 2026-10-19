import { type ChatEvent, fixRequest } from "@igrek/core";
import { CircleCheck, CircleX, Loader2, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Gate = Extract<ChatEvent, { kind: "gate" }>;

/** The project's checks after a turn that changed files (plan.md 15.5): what newly broke, with its output. */
export function GateCard({ event, onSend }: { event: Gate; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const broke = event.checks.filter((c) => c.broke);
  const failedBefore = event.checks.filter((c) => !c.ok && !c.broke);
  if (event.status === "running")
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        {t("gate.running")}
      </p>
    );
  if (event.status === "none")
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <ShieldCheck size={12} aria-hidden="true" />
        {t("gate.none")}
      </p>
    );
  if (!broke.length)
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        <CircleCheck size={12} className="text-success" aria-hidden="true" />
        {failedBefore.length
          ? t("gate.passNew", { count: failedBefore.length })
          : t("gate.pass", { count: event.checks.length })}
      </p>
    );
  return (
    <div className="space-y-2 rounded-md border border-danger bg-danger-soft p-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-danger">
        <CircleX size={13} aria-hidden="true" />
        {t("gate.broke", { count: broke.length })}
      </p>
      {broke.map((c) => (
        <details key={c.command} className="rounded bg-bg p-1.5">
          <summary className="cursor-pointer font-mono text-[11.5px]">{c.command}</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-fg-muted">
            {c.output}
          </pre>
        </details>
      ))}
      {failedBefore.length > 0 && (
        <p className="text-fg-muted">{t("gate.alreadyFailing", { count: failedBefore.length })}</p>
      )}
      {event.sentBack || sent ? (
        <p className="text-fg-muted">{t("gate.sentBack")}</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSend(fixRequest(broke));
            setSent(true);
          }}
          className="flex items-center gap-1 font-medium text-danger underline"
        >
          <Send size={12} aria-hidden="true" />
          {t("gate.sendBack")}
        </button>
      )}
    </div>
  );
}
