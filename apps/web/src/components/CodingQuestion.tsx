import type { UiMode } from "@igrek/core";
import { Code, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/settings";
import { Dialog } from "./ui";

/**
 * "Do you write code?", asked once. The answer only picks the view (Settings changes it later):
 * Simple shows a project's Overview, Chat and Files in plain words, Developer every tab. Nothing is
 * removed either way; a hidden tab still opens from a link.
 */
export function CodingChoice({ onPicked }: { onPicked?: () => void }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const pick = (mode: UiMode) => {
    void update({ mode, askedCoding: true });
    onPicked?.();
  };
  const options = [
    { mode: "simple" as const, icon: MessageSquare, title: t("coding.no"), body: t("coding.noBody") },
    { mode: "pro" as const, icon: Code, title: t("coding.yes"), body: t("coding.yesBody") },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(({ mode, icon: Icon, title, body }) => (
        <button
          key={mode}
          type="button"
          onClick={() => pick(mode)}
          className={cn(
            "rounded-ui border p-3 text-start transition-colors hover:border-accent",
            settings.askedCoding && settings.mode === mode ? "border-accent bg-accent-soft" : "border-border",
          )}
        >
          <Icon size={18} className="mb-2 text-accent" aria-hidden="true" />
          <span className="block text-[13.5px] font-medium">{title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-muted">{body}</span>
        </button>
      ))}
    </div>
  );
}

/** For people who started Igrek before the question came in: asked once, over whatever page is open. */
export function CodingQuestion() {
  const { t } = useTranslation();
  const { settings, loaded, update } = useSettings();
  if (!loaded || settings.askedCoding) return null;
  return (
    <Dialog open label={t("coding.title")} onClose={() => void update({ askedCoding: true })} wide>
      <div className="p-5">
        <h2 className="text-[15px] font-semibold">{t("coding.title")}</h2>
        <p className="mt-1 mb-3 text-[13px] leading-relaxed text-fg-muted">{t("coding.body")}</p>
        <CodingChoice />
        <p className="mt-3 text-[12px] text-fg-subtle">{t("coding.later")}</p>
      </div>
    </Dialog>
  );
}
