import type { Seat, SeatBudget } from "@igrek/core";
import { Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, field } from "../../components/ui";
import { request } from "../../lib/api";
import { cn } from "../../lib/cn";
import { compactNumber } from "../../lib/format";

/**
 * Monthly prices that are certain (public list prices, before tax). Claude Max is $100 (5x) or
 * $200 (20x), and Igrek cannot tell which one an account has: it is shown as not known rather
 * than guessed (earlier talks: "never show a wrong price").
 */
const PRICES: Record<string, number> = { "claude:pro": 20, "codex:plus": 20, "codex:pro": 200 };

export function planPrice(provider: string, plan?: string): number | undefined {
  return plan ? PRICES[`${provider}:${plan.toLowerCase()}`] : undefined;
}

/** The budgets the admin set, and setting one. */
export function useBudgets(): {
  budgets: Record<string, SeatBudget>;
  save: (member: string, b: SeatBudget) => Promise<void>;
} {
  const [budgets, setBudgets] = useState<Record<string, SeatBudget>>({});
  useEffect(() => {
    let current = true;
    void request<Record<string, SeatBudget>>("/api/team/budgets")
      .then((b) => current && setBudgets(b))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const save = useCallback(
    (member: string, b: SeatBudget) =>
      request<Record<string, SeatBudget>>(`/api/team/budgets/${member}`, {
        method: "PUT",
        body: JSON.stringify(b),
      }).then(setBudgets),
    [],
  );
  return { budgets, save };
}

/** Whether a person is past their budget, as the server counts it (budgets.ts). */
export function overBudget(seat: Seat, budget?: SeatBudget): { weekPct?: number; tokens?: number } | undefined {
  if (!budget) return undefined;
  const used = Math.max(0, ...seat.accounts.map((a) => a.week ?? 0)) * 100;
  const tokens = seat.week.input + seat.week.output;
  const pct = budget.weekPct && used >= budget.weekPct ? Math.round(used) : undefined;
  const over = budget.weekTokens && tokens >= budget.weekTokens ? tokens : undefined;
  return pct !== undefined || over !== undefined ? { weekPct: pct, tokens: over } : undefined;
}

/** A person's budget on their card: shown to everyone, changed by the admin. */
export function BudgetLine({
  seat,
  budget,
  admin,
  onSave,
}: {
  seat: Seat;
  budget?: SeatBudget;
  admin: boolean;
  onSave: (b: SeatBudget) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(String(budget?.weekPct ?? ""));
  const [tokens, setTokens] = useState(budget?.weekTokens ? String(budget.weekTokens / 1_000_000) : "");
  const over = overBudget(seat, budget);
  if (!budget && !admin) return null;
  if (editing)
    return (
      <form
        className="flex flex-wrap items-center gap-2 text-[12px]"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            weekPct: Number(pct) || undefined,
            weekTokens: Number(tokens) ? Math.round(Number(tokens) * 1_000_000) : undefined,
          }).then(() => setEditing(false));
        }}
      >
        <Wallet size={13} className="text-fg-subtle" aria-hidden="true" />
        <label className="flex items-center gap-1">
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="numeric"
            className={cn(field, "h-7 w-14")}
          />
          {t("company.budgetPct")}
        </label>
        <label className="flex items-center gap-1">
          <input
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            inputMode="decimal"
            className={cn(field, "h-7 w-16")}
          />
          {t("company.budgetTokens")}
        </label>
        <Button size="sm" type="submit" variant="primary">
          {t("company.budgetSave")}
        </Button>
      </form>
    );
  return (
    <p className={cn("flex items-center gap-2 text-[12px]", over ? "text-warning" : "text-fg-muted")}>
      <Wallet size={13} aria-hidden="true" />
      {budget
        ? t("company.budgetIs", {
            what: [
              budget.weekPct ? t("company.budgetPctOf", { pct: budget.weekPct }) : "",
              budget.weekTokens ? t("company.budgetTokensOf", { tokens: compactNumber(budget.weekTokens) }) : "",
            ]
              .filter(Boolean)
              .join(" · "),
          })
        : t("company.budgetNone")}
      {admin && (
        <button type="button" onClick={() => setEditing(true)} className="font-medium text-accent hover:underline">
          {t(budget ? "company.budgetChange" : "company.budgetSet")}
        </button>
      )}
    </p>
  );
}
