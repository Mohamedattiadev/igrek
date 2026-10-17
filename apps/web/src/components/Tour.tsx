import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { takeQueuedTour } from "../lib/tour";
import { Button } from "./ui";

const STEPS = [
  { target: '[data-tour="nav"]', key: "nav" },
  { target: '[data-tour="search"]', key: "search" },
  { target: 'a[href="/inbox"]', key: "inbox" },
  { target: '[data-tour="account"]', key: "account" },
  { target: '[data-tour="stop"]', key: "stop" },
  { target: 'a[href="/settings"]', key: "settings" },
] as const;

/** One area at a time, lit up, with one sentence about it. Esc or "Skip" ends it. */
export function Tour() {
  const { t } = useTranslation();
  const [step, setStep] = useState<number>();
  const [rect, setRect] = useState<DOMRect>();
  const close = useCallback(() => setStep(undefined), []);

  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener("godeye:tour", start);
    if (takeQueuedTour()) setTimeout(start, 600);
    return () => window.removeEventListener("godeye:tour", start);
  }, []);

  useLayoutEffect(() => {
    if (step === undefined) return;
    const measure = () => {
      const el = document.querySelector(STEPS[step]?.target ?? "");
      if (!el) {
        // Not on screen (e.g. Simple mode hides it): go on to the next one.
        setStep((s) => (s !== undefined && s + 1 < STEPS.length ? s + 1 : undefined));
        return;
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  useEffect(() => {
    if (step === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => (s !== undefined && s + 1 < STEPS.length ? s + 1 : undefined));
      if (e.key === "ArrowLeft") setStep((s) => (s ? s - 1 : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  if (step === undefined || !rect) return null;
  const current = STEPS[step];
  if (!current) return null;
  const pad = 6;
  const below = rect.bottom + 180 < window.innerHeight;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 332);
  const top = below ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 10 - 150);
  const sideways = rect.height > window.innerHeight / 2;
  const last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("tour.title")}>
      <button
        type="button"
        data-no-tip
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={close}
        aria-label={t("tour.skip")}
      />
      <div
        className="pointer-events-none absolute rounded-ui ring-2 ring-accent transition-all duration-200"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)",
        }}
      />
      <div
        className="absolute w-80 space-y-3 rounded-ui border border-border bg-bg p-4 shadow-ui"
        style={
          sideways ? { left: rect.right + 16, top: Math.min(rect.top + 40, window.innerHeight - 200) } : { left, top }
        }
      >
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-[14px] font-semibold">{t(`tour.${current.key}.title`)}</h2>
          <span className="text-[11px] text-fg-subtle">
            {step + 1}/{STEPS.length}
          </span>
          <button type="button" onClick={close} aria-label={t("tour.skip")} className="text-fg-subtle hover:text-fg">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-fg-muted">{t(`tour.${current.key}.body`)}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={close} className="text-xs text-fg-subtle hover:text-fg">
            {t("tour.skip")}
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
              {t("tour.back")}
            </Button>
          )}
          <Button size="sm" variant="primary" autoFocus onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? t("tour.done") : t("tour.next")}
            {!last && <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
