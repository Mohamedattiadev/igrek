import { Check, ChevronDown, Gauge, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useAccounts } from "../lib/live";

/** Top-bar switch: which Claude account new sessions use, and how full its 5-hour limit is. */
export function AccountChip() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useAccounts().filter((a) => a.provider === "claude");
  const active = accounts.find((a) => a.active);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (!active) return null;
  const value = active.rateLimit?.fiveHour;
  const pct = value !== undefined ? Math.round(value * 100) : undefined;
  const tone =
    value === undefined ? "bg-fg-subtle" : value >= 0.95 ? "bg-danger" : value >= 0.8 ? "bg-warning" : "bg-success";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-ui px-2 text-[12px] hover:bg-bg-hover"
        aria-label={t("limits.chipTip", { name: active.label, pct: pct ?? "?" })}
        data-tip={t("limits.chipTip", { name: active.label, pct: pct ?? "?" })}
      >
        {/* The icon says it is an account: testers read a bare "Main" as a branch or a workspace. */}
        <UserRound size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        {/* Said in words, so nobody has to click to learn what "Main" and the bar are. */}
        <span className="hidden max-w-36 truncate whitespace-nowrap font-medium sm:inline">
          {t("limits.chipName", { name: active.label })}
        </span>
        {pct !== undefined && (
          <span className="flex items-center gap-1">
            <span className="hidden whitespace-nowrap text-[11px] text-fg-subtle xl:inline">
              {t("limits.chipLimit")}
            </span>
            <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-bg-muted sm:block">
              <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(4, pct)}%` }} />
            </span>
            <span className="font-mono text-[10.5px] text-fg-muted">{pct}%</span>
          </span>
        )}
        <ChevronDown size={12} className="text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-1 w-64 rounded-ui border border-border bg-bg p-1 shadow-ui">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-fg-subtle">{t("limits.chipHeader")}</p>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              disabled={!account.loggedIn}
              onClick={async () => {
                await api.activateAccount(account.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[12.5px] hover:bg-bg-hover disabled:opacity-50"
            >
              <span className="w-3.5">{account.active && <Check size={13} className="text-accent" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{account.label}</span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  {account.loggedIn ? account.email : t("accounts.loggedOut")}
                </span>
              </span>
              {account.rateLimit?.fiveHour !== undefined && (
                <span className="font-mono text-[10.5px] text-fg-muted">
                  {Math.round(account.rateLimit.fiveHour * 100)}%
                </span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void navigate("/limits");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <Gauge size={13} />
            {t("accounts.manage")}
          </button>
        </div>
      )}
    </div>
  );
}
