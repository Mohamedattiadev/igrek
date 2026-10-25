import { Check, Eye, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScreenStep } from "../lib/api";
import { cn } from "../lib/cn";
import { desktop } from "../lib/desktop";
import { Button } from "./ui";

/** What a step does, in words the user reads before allowing it. */
function describeStep(t: (key: string, o?: Record<string, unknown>) => string, step: ScreenStep): string {
  if (step.action === "click") return t("screen.step.click", { label: step.label || `${step.x},${step.y}` });
  if (step.action === "type") return t("screen.step.type", { text: step.text });
  return t("screen.step.key", { key: step.text });
}

/**
 * The desktop steps the AI proposed, one by one: "Show" puts the pointer where a click would land,
 * "Do it" does that one step (Igrek's window steps aside), and a step that sends, pays or deletes asks
 * a second time. Nothing runs by itself.
 */
export function ScreenSteps({
  steps,
  size,
  onDone,
}: {
  steps: ScreenStep[];
  size: { width: number; height: number };
  onDone: (description: string) => void;
}) {
  const { t } = useTranslation();
  const [done, setDone] = useState<number[]>([]);
  const [error, setError] = useState<string>();
  const point = (step: ScreenStep) =>
    desktop("show_pointer", { x: step.x, y: step.y, ...size, label: step.label }).catch((err: Error) =>
      setError(err.message),
    );
  const run = async (step: ScreenStep, index: number) => {
    const what = describeStep(t, step);
    if (step.risky && !window.confirm(t("screen.step.risky", { what }))) return;
    setError(undefined);
    try {
      await desktop("screen_step", {
        action: step.action,
        x: step.x ?? 0,
        y: step.y ?? 0,
        ...size,
        text: step.text ?? "",
      });
      setDone((list) => [...list, index]);
      onDone(what);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li
            key={`${step.action}:${step.x ?? ""}:${step.y ?? ""}:${step.text ?? ""}:${step.label}`}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-ui border border-border p-2",
              done.includes(i) && "opacity-60",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={cn("font-medium", step.risky && "text-danger")}>{describeStep(t, step)}</span>
              {step.why && <span className="ms-1.5 text-fg-muted">{step.why}</span>}
            </span>
            {done.includes(i) ? (
              <Check size={14} className="text-success" aria-label={t("screen.step.done")} />
            ) : (
              <>
                {step.action === "click" && (
                  <Button size="sm" variant="ghost" icon={Eye} onClick={() => void point(step)}>
                    {t("screen.step.show")}
                  </Button>
                )}
                <Button size="sm" variant="primary" icon={Play} onClick={() => void run(step, i)}>
                  {t("screen.step.do")}
                </Button>
              </>
            )}
          </li>
        ))}
      </ol>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
