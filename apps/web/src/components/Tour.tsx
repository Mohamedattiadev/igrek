import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { markTourSeen, takeQueuedTour, tourSeen } from "../lib/tour";
import { Button } from "./ui";

const STEPS = [
  { target: '[data-tour="composer"]', key: "composer" },
  { target: '[data-tour="nav"]', key: "nav" },
  // Phones: the menu lives in a drawer behind this button (the step above is skipped there).
  { target: '[data-tour="menu"]', key: "menu" },
  { target: 'a[href="/"]', key: "projects" },
  { target: 'a[href="/inbox"]', key: "inbox" },
  { target: '[data-tour="search"]', key: "search" },
  { target: '[data-tour="helper"]', key: "helper" },
  { target: '[data-tour="account"]', key: "account" },
  { target: '[data-tour="stop"]', key: "stop" },
  { target: 'a[href="/settings"]', key: "settings" },
] as const;

/** Four dimmed, blurred panels around the lit area, so only that area stays sharp. */
function Veil({ rect, pad }: { rect: DOMRect; pad: number }) {
  const top = Math.max(0, rect.top - pad);
  const bottom = rect.bottom + pad;
  const left = Math.max(0, rect.left - pad);
  const right = rect.right + pad;
  const veil = "pointer-events-none absolute bg-black/50 backdrop-blur-[3px] transition-all duration-200";
  return (
    <>
      <div className={veil} style={{ left: 0, top: 0, right: 0, height: top }} />
      <div className={veil} style={{ left: 0, top: bottom, right: 0, bottom: 0 }} />
      <div className={veil} style={{ left: 0, top, width: left, height: bottom - top }} />
      <div className={veil} style={{ left: right, top, right: 0, height: bottom - top }} />
    </>
  );
}

/**
 * One area at a time, lit up, with a sentence about it; the rest of the screen is dimmed and
 * blurred. Starts by itself the first time the home page opens; Esc or "Skip" ends it.
 */
export function Tour() {
  const { t } = useTranslation();
  const [step, setStep] = useState<number>();
  const [rect, setRect] = useState<DOMRect>();
  const close = useCallback(() => {
    setStep(undefined);
    markTourSeen();
  }, []);

  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener("godeye:tour", start);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (takeQueuedTour() || (!tourSeen() && window.location.pathname === "/")) timer = setTimeout(start, 900);
    return () => {
      window.removeEventListener("godeye:tour", start);
      clearTimeout(timer);
    };
  }, []);

  useLayoutEffect(() => {
    if (step === undefined) return;
    const measure = () => {
      const el = document.querySelector(STEPS[step]?.target ?? "");
      if (el && el.getBoundingClientRect().width === 0) {
        setStep((s) => (s !== undefined && s + 1 < STEPS.length ? s + 1 : undefined));
        return;
      }
      el?.scrollIntoView({ block: "nearest" });
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
      if (e.key === "ArrowRight") {
        if (step + 1 < STEPS.length) setStep(step + 1);
        else close();
      }
      if (e.key === "ArrowLeft") setStep((s) => (s ? s - 1 : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  if (step === undefined || !rect) return null;
  const current = STEPS[step];
  if (!current) return null;
  const pad = 6;
  const below = rect.bottom + 200 < window.innerHeight;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 352);
  const top = below ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 10 - 190);
  const sideways = rect.height > window.innerHeight / 2;
  const fromEnd = rect.left > window.innerWidth / 2 && rect.width < 120;
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
      <Veil rect={rect} pad={pad} />
      <div
        className="pointer-events-none absolute rounded-ui ring-2 ring-accent transition-all duration-200"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
      <div
        className="absolute w-[340px] space-y-3 rounded-xl border border-border bg-bg p-4 shadow-ui"
        style={
          sideways
            ? { left: rect.right + 16, top: Math.min(rect.top + 40, window.innerHeight - 230) }
            : fromEnd
              ? { right: Math.max(12, window.innerWidth - rect.right), top }
              : { left, top }
        }
      >
        <div className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-accent-fg">
            {step + 1}
          </span>
          <h2 className="min-w-0 flex-1 pt-1 text-[14px] font-semibold">{t(`tour.${current.key}.title`)}</h2>
          <span className="pt-1.5 text-[11px] text-fg-subtle">
            {step + 1}/{STEPS.length}
          </span>
          <button type="button" onClick={close} aria-label={t("tour.skip")} className="text-fg-subtle hover:text-fg">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-fg-muted">{t(`tour.${current.key}.body`)}</p>
        <div className="flex gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.key} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-bg-muted")} />
          ))}
        </div>
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
