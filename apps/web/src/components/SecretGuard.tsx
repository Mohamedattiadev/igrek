import { findSecrets } from "@godeye/core";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";

/** Replaces each secret with a short masked hint ("sk-a••••1234"), so the AI still knows a key was meant. */
export function maskSecrets(text: string): string {
  let out = text;
  for (const s of findSecrets(text).reverse()) out = `${out.slice(0, s.start)}[${s.hint}]${out.slice(s.end)}`;
  return out;
}

/**
 * Prompt firewall (plan.md Faz 0): shown when a message about to go to the AI
 * contains something that looks like a key or password.
 */
export function SecretGuard({
  text,
  onMask,
  onSendAnyway,
  onCancel,
}: {
  text: string;
  onMask: () => void;
  onSendAnyway: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const found = findSecrets(text);
  if (!found.length) return null;
  return (
    <div
      role="alert"
      className="mb-2 space-y-2 rounded-ui border border-warning/50 bg-warning-soft p-3 text-xs text-warning"
    >
      <p className="flex items-start gap-2 font-medium">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t("firewall.found", { count: found.length, hints: found.map((f) => f.hint).join(", ") })}
      </p>
      <p className="text-fg-muted">{t("firewall.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onMask}>
          {t("firewall.mask")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSendAnyway}>
          {t("firewall.sendAnyway")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("memory.cancel")}
        </Button>
      </div>
    </div>
  );
}
