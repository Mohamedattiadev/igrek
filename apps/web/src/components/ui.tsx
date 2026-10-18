import { Check, Copy, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { Term, useTermIn } from "./Term";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-ui font-medium transition-colors select-none",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2 text-xs",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover",
        variant === "secondary" && "border border-border bg-bg text-fg hover:bg-bg-hover",
        variant === "ghost" && "text-fg-muted hover:bg-bg-hover hover:text-fg",
        variant === "danger" && "bg-danger text-on-strong hover:opacity-90",
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={size === "md" ? 15 : 13} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("rounded-ui border border-border bg-bg", className)}>{children}</div>;
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

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  /** `tip`: a one-line explanation shown on hover. */
  options: { value: T; label: string; tip?: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  const name = useId();
  return (
    <fieldset aria-label={label} className="inline-flex shrink-0 rounded-ui border border-border bg-bg-subtle p-0.5">
      {options.map((option) => (
        <label
          key={option.value}
          data-tip={option.tip}
          className={cn(
            "flex h-7 cursor-pointer items-center whitespace-nowrap rounded-[6px] px-3 text-[13px] transition-colors",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === option.value ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg",
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
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-6">
      <h1 className="text-[14px] font-semibold">{title}</h1>
      {actions}
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
