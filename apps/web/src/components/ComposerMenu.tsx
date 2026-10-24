import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

export interface ComposerAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Shown at the end of the row, e.g. a keyboard shortcut. */
  hint?: string;
}

/**
 * The chat box's extras (an image, a saved prompt, an expert, a better prompt) behind one "+": five
 * small buttons under the box were more than most people read, and they are used now and then.
 */
export function ComposerMenu({ actions }: { actions: ComposerAction[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (actions.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("chat.more")}
        aria-expanded={open}
        data-tip={t("chat.more")}
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-fg-subtle hover:bg-bg-hover hover:text-fg",
          open && "bg-bg-hover text-fg",
        )}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full start-0 z-30 mb-1 w-60 rounded-ui border border-border bg-bg p-1 shadow-ui"
        >
          {actions.map(({ key, label, icon: Icon, onClick, disabled, hint }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-bg-hover disabled:opacity-40"
            >
              <Icon size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {hint && <span className="shrink-0 text-[11px] text-fg-subtle">{hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
