import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DELAY = 350;
const GAP = 8;

interface Tip {
  text: string;
  kbd?: string;
  x: number;
  y: number;
  side: "top" | "bottom" | "right";
}

/**
 * One tooltip for the whole app. It picks up, in order:
 *   data-tip="…" (+ optional data-tip-kbd="Ctrl K")
 *   title="…"   (moved to data-tip so the slow native tooltip never shows)
 *   aria-label  on buttons and links that have no visible text (icon buttons)
 * Works on hover and on keyboard focus; Esc hides it.
 */
function tipFor(el: Element | null): { el: HTMLElement; text: string; kbd?: string } | undefined {
  for (let node = el as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    if (node.dataset.tipOff !== undefined) return undefined;
    const title = node.getAttribute("title");
    if (title) {
      node.dataset.tip = title;
      node.removeAttribute("title");
    }
    if (node.dataset.tip) return { el: node, text: node.dataset.tip, kbd: node.dataset.tipKbd };
    if (
      (node.tagName === "BUTTON" || node.tagName === "A") &&
      node.getAttribute("aria-label") &&
      !node.textContent?.trim()
    ) {
      return { el: node, text: node.getAttribute("aria-label") ?? "", kbd: node.dataset.tipKbd };
    }
  }
  return undefined;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<HTMLElement>(undefined);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      current.current = undefined;
      setTip(undefined);
    };
    const show = (target: EventTarget | null, delay: number) => {
      const found = tipFor(target as Element);
      if (!found) return hide();
      if (found.el === current.current) return;
      hide();
      current.current = found.el;
      timer.current = setTimeout(() => {
        if (!found.el.isConnected) return;
        const rect = found.el.getBoundingClientRect();
        if (found.el.dataset.tipSide === "right") {
          setTip({
            text: found.text,
            kbd: found.kbd,
            x: rect.right + GAP,
            y: rect.top + rect.height / 2,
            side: "right",
          });
          return;
        }
        const below = rect.top < 48;
        setTip({
          text: found.text,
          kbd: found.kbd,
          x: rect.left + rect.width / 2,
          y: below ? rect.bottom + GAP : rect.top - GAP,
          side: below ? "bottom" : "top",
        });
      }, delay);
    };
    const over = (e: PointerEvent) => e.pointerType !== "touch" && show(e.target, DELAY);
    const focus = (e: FocusEvent) => (e.target as HTMLElement).matches?.(":focus-visible") && show(e.target, 0);
    // Any key hides it: typing, shortcuts and Esc.
    const key = () => hide();
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      clearTimeout(timer.current);
    };
  }, []);

  return tip ? <Bubble tip={tip} /> : null;
}

/** Measured, then nudged so it never leaves the screen. */
function Bubble({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 6;
    let left = tip.side === "right" ? tip.x : tip.x - box.width / 2;
    let top = tip.side === "right" ? tip.y - box.height / 2 : tip.side === "bottom" ? tip.y : tip.y - box.height;
    left = Math.min(Math.max(left, margin), window.innerWidth - box.width - margin);
    top = Math.min(Math.max(top, margin), window.innerHeight - box.height - margin);
    setPos({ left, top });
  }, [tip]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-[280px] rounded-md bg-fg px-2 py-1 text-[11.5px] leading-snug text-bg shadow-ui"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {tip.text}
      {tip.kbd && (
        <span className="ms-1.5 rounded border border-bg/30 px-1 font-mono text-[10px] opacity-80">{tip.kbd}</span>
      )}
    </div>
  );
}
