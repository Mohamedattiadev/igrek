import { ArrowLeft, Check, ChevronDown, Copy, Gauge, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { BackLink } from "./BackLink";
import { Term, useTermIn } from "./Term";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * The same small mark on everything that asks an AI model, so nobody spends their plan's limit
 * without knowing it. Inside a button it reads "uses your limit" to screen readers too.
 */
export function ModelMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex shrink-0 opacity-60", className)}>
      <Gauge size={11} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{t("limits.usesLimit")}</span>
    </span>
  );
}

/** The hint for something that asks a model: its own hint first, then that it uses the limit. */
export function useModelTip(): (tip?: string) => string {
  const { t } = useTranslation();
  return (tip) => (tip ? `${tip} ${t("limits.usesLimit")}` : t("limits.usesLimit"));
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  usesModel,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  /** It asks an AI model: shows the ModelMark and says so in the hint. */
  usesModel?: boolean;
}) {
  const modelTip = useModelTip();
  const tip = (props as { "data-tip"?: string })["data-tip"];
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ui font-medium transition-colors select-none",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2 text-xs",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover",
        variant === "secondary" && "border border-border bg-bg text-fg hover:bg-bg-hover",
        variant === "ghost" && "text-fg-muted hover:bg-bg-hover hover:text-fg",
        variant === "danger" && "bg-danger text-on-strong hover:opacity-90",
        className,
      )}
      {...props}
      data-tip={usesModel ? modelTip(tip) : tip}
    >
      {Icon && <Icon size={size === "md" ? 15 : 13} strokeWidth={1.75} />}
      {children}
      {usesModel && <ModelMark />}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("rounded-ui border border-border bg-bg", className)}>{children}</div>;
}

/** A card with a title line (an icon, the title, an action at its end): the one way a page shows a part of itself. */
export function Panel({
  icon: Icon,
  title,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0 space-y-2 p-4", className)}>
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
        {Icon && <Icon size={15} className="text-accent" aria-hidden="true" />}
        <span className="flex-1">{title}</span>
        {action}
      </h2>
      {children}
    </Card>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const term = useTermIn(title, hint);
  return (
    <section className="grid gap-3 border-b border-border py-6 last:border-b-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h3 className="text-[13px] font-semibold text-fg">
          {title}
          {term && <Term k={term} />}
        </h3>
        {hint && <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "bg-bg-muted text-fg-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}

/** A small number in a bubble (unread messages, running work, things to look at): drawn the same everywhere. */
export function Count({
  n,
  tone = "accent",
  className,
  tip,
}: {
  n: ReactNode;
  tone?: "accent" | "danger" | "warning";
  className?: string;
  tip?: string;
}) {
  return (
    <span
      data-tip={tip}
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-on-strong",
        tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-accent",
        className,
      )}
    >
      {n}
    </span>
  );
}

export function StatusDot({ tone, pulse }: { tone: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-fg-subtle",
  }[tone];
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-50", color)} />}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg-subtle px-1 font-mono text-[10px] text-fg-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-bg-subtle text-fg-subtle">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A small menu's open state: it closes on a click outside it or on Escape. */
export function usePopover(): [
  boolean,
  (open: boolean | ((v: boolean) => boolean)) => void,
  RefObject<HTMLDivElement | null>,
] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return [open, setOpen, ref];
}

/**
 * A button that opens a short list of more actions under it: where a page keeps what is used less,
 * so its bar shows one or two buttons instead of eight (a user could not read the title for them).
 */
export function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen, ref] = usePopover();
  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-30 mt-1 flex w-64 flex-col items-stretch gap-0.5 rounded-ui border border-border bg-bg p-1 shadow-ui"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One choice of a Segmented: `tip` is a one-line explanation shown on hover, `count` a small number after it. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tip?: string;
  icon?: LucideIcon;
  count?: ReactNode;
}

const segment = (on: boolean) =>
  cn(
    "relative flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-[13px] transition-colors",
    on ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg",
  );

/**
 * Every switch between views of a page or a list looks the same, everywhere in Igrek (a user found
 * the Experts page's tabs drawn one way and the Company page's another). Choices used less go under
 * `more`, a menu at the end of the same bar; a long bar wraps (`wrap`) instead of hiding its end.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  more,
  wrap,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  more?: { label: string; options: SegmentedOption<T>[] };
  wrap?: boolean;
}) {
  const name = useId();
  return (
    <fieldset
      aria-label={label}
      className={cn(
        "inline-flex min-w-0 max-w-full shrink-0 rounded-ui border border-border bg-bg-subtle p-0.5",
        wrap ? "flex-wrap" : "overflow-x-auto [scrollbar-width:none]",
      )}
    >
      {options.map((option) => (
        <label
          key={option.value}
          data-tip={option.tip}
          className={cn(
            segment(value === option.value),
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.icon && <option.icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />}
          {option.label}
          {option.count !== undefined && <span className="text-fg-subtle">{option.count}</span>}
        </label>
      ))}
      {more && more.options.length > 0 && <SegmentedMore value={value} more={more} onChange={onChange} />}
    </fieldset>
  );
}

/** The "More" menu at the end of a Segmented; it shows the chosen one's name while one of them is open. */
function SegmentedMore<T extends string>({
  value,
  more,
  onChange,
}: {
  value: T;
  more: { label: string; options: SegmentedOption<T>[] };
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = more.options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={segment(!!current)}
      >
        {current?.icon && <current.icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />}
        {current ? current.label : more.label}
        <ChevronDown size={13} aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="fixed z-30 mt-1 w-56 rounded-ui border border-border bg-bg p-1 shadow-ui">
          {more.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                value === option.value ? "font-medium text-accent" : "text-fg",
              )}
            >
              {option.icon && <option.icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The strip under a page's title that holds its tabs: the same place and spacing on every page. */
export function TabBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("shrink-0 border-b border-border px-4 py-2 sm:px-6", className)}>{children}</div>;
}

/**
 * A page's title bar. A back arrow shows when this tab came here from another page of the app (a user
 * missed it on Tools and other top pages); a page with its own back link turns it off with `back`.
 */
export function PageHeader({ title, actions, back = true }: { title: string; actions?: ReactNode; back?: boolean }) {
  const { t } = useTranslation();
  const earlier = back && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2 sm:px-6">
      <span className="flex min-w-0 items-center gap-2">
        {earlier && (
          <BackLink to="/" aria-label={t("nav.back")} className="text-fg-subtle hover:text-fg">
            <ArrowLeft size={15} className="rtl:rotate-180" aria-hidden="true" />
          </BackLink>
        )}
        <h1 className="truncate text-[14px] font-semibold">{title}</h1>
      </span>
      {actions && <div className="flex min-w-0 max-w-full overflow-x-auto [scrollbar-width:none]">{actions}</div>}
    </header>
  );
}

export function Dialog({
  open,
  onClose,
  children,
  label,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes natively
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className={cn(
        "m-auto rounded-xl border border-border bg-bg p-0 text-fg shadow-ui backdrop:bg-black/30",
        wide ? "w-[min(860px,calc(100vw-32px))]" : "w-[min(420px,calc(100vw-32px))]",
      )}
    >
      {open && children}
    </dialog>
  );
}

/** Copies text to the clipboard and says so for a moment. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      icon={copied ? Check : Copy}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? t("team.copied") : (label ?? t("team.copy"))}
    </Button>
  );
}

export const field = "h-8 rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent";

export const RUN_TONE = {
  running: "accent",
  needs_you: "warning",
  ready: "warning",
  done: "success",
  merged: "success",
  failed: "danger",
  stopped: "neutral",
  discarded: "neutral",
  waiting_limit: "warning",
} as const;
