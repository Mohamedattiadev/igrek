import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

/** A panel width the user can drag, remembered per browser (plan.md 7.0). */
export function usePanelSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(`godeye.panel.${key}`));
      return saved >= min && saved <= max ? saved : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: number) => {
      const value = Math.round(Math.min(max, Math.max(min, next)));
      setSize(value);
      try {
        localStorage.setItem(`godeye.panel.${key}`, String(value));
      } catch {
        // Not remembered in a private window; still resizes.
      }
    },
    [key, min, max],
  );
  return [size, set] as const;
}

/**
 * The thin line between two panels: drag it, or focus it and use the arrow keys.
 * `side` says which edge of the panel it sits on ("end" = the panel grows to the right).
 */
export function ResizeHandle({
  size,
  onSize,
  side = "end",
  min,
  max,
}: {
  size: number;
  onSize: (next: number) => void;
  side?: "start" | "end";
  min: number;
  max: number;
}) {
  const { t } = useTranslation();
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const sign = (side === "end" ? 1 : -1) * (rtl ? -1 : 1);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a draggable splitter, not a horizontal rule
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("panel.resize")}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-tip={t("panel.resizeTip")}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSize(size + 16 * (rtl ? -1 : 1) * (side === "end" ? 1 : -1));
        if (e.key === "ArrowLeft") onSize(size - 16 * (rtl ? -1 : 1) * (side === "end" ? 1 : -1));
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const start = size;
        const move = (ev: PointerEvent) => onSize(start + (ev.clientX - startX) * sign);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.style.removeProperty("cursor");
        };
        document.body.style.cursor = "col-resize";
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent focus-visible:bg-accent"
    />
  );
}
