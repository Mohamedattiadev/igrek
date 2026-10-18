import type { CostItem, CostSummary } from "@igrek/core";
import { CircleDollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Dialog, EmptyState, field } from "../../components/ui";
import { cn } from "../../lib/cn";
import { useProjects } from "../../lib/live";
import { costApi } from "../../lib/ops-api";

const CURRENCIES = ["USD", "EUR", "TRY", "GBP"];
const CATEGORIES: CostItem["category"][] = ["server", "ai", "api", "saas", "domain", "other"];

function money(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function readCurrency(): string {
  try {
    return localStorage.getItem("igrek.costCurrency") ?? "USD";
  } catch {
    return "USD";
  }
}

function ItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: Partial<CostItem>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [form, setForm] = useState<Partial<CostItem>>({});
  const [error, setError] = useState<string>();
  useEffect(() => {
    setForm(item ?? {});
    setError(undefined);
  }, [item]);
  const set = (patch: Partial<CostItem>) => setForm((f) => ({ ...f, ...patch }));
  const month = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 7) : "");
  const fromMonth = (v: string) => (v ? new Date(`${v}-01T00:00:00`).getTime() : undefined);
  return (
    <Dialog open={!!item} onClose={onClose} label={t("costs.item")}>
      <form
        className="space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (form.id) await costApi.update(form.id, form);
            else await costApi.add(form);
            onSaved();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <h2 className="text-[15px] font-semibold">{form.id ? t("costs.edit") : t("costs.add")}</h2>
        <input
          value={form.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("costs.name")}
          aria-label={t("costs.name")}
          className={cn(field, "w-full")}
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.amount ?? ""}
            onChange={(e) => set({ amount: Number(e.target.value) })}
            placeholder={t("costs.amount")}
            aria-label={t("costs.amount")}
            className={cn(field, "w-28")}
          />
          <select
            value={form.currency ?? "USD"}
            onChange={(e) => set({ currency: e.target.value })}
            className={field}
            aria-label={t("costs.currency")}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={form.period ?? "month"}
            onChange={(e) => set({ period: e.target.value as CostItem["period"] })}
            className={field}
            aria-label={t("costs.period")}
          >
            {(["month", "year", "once"] as const).map((p) => (
              <option key={p} value={p}>
                {t(`costs.period_${p}`)}
              </option>
            ))}
          </select>
          <select
            value={form.category ?? "other"}
            onChange={(e) => set({ category: e.target.value as CostItem["category"] })}
            className={field}
            aria-label={t("costs.category")}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`costs.cat_${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <label className="flex items-center gap-1.5">
            {t("costs.starts")}
            <input
              type="month"
              value={month(form.startsAt)}
              onChange={(e) => set({ startsAt: fromMonth(e.target.value) })}
              className={field}
            />
          </label>
          <label className="flex items-center gap-1.5">
            {t("costs.ends")}
            <input
              type="month"
              value={month(form.endsAt)}
              onChange={(e) => set({ endsAt: fromMonth(e.target.value) })}
              className={field}
            />
          </label>
        </div>
        <select
          value={form.projectId ?? ""}
          onChange={(e) => set({ projectId: e.target.value || undefined })}
          className={cn(field, "w-full")}
          aria-label={t("suite.project")}
        >
          <option value="">{t("costs.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("persona.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!form.name?.trim() || form.amount === undefined}>
            {t("costs.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Cost panel (plan.md 12): what running your projects costs a month, and where it is going. */
export function CostsTab() {
  const { t, i18n } = useTranslation();
  const projects = useProjects();
  const [currency, setCurrency] = useState(readCurrency);
  const [items, setItems] = useState<CostItem[]>();
  const [summary, setSummary] = useState<CostSummary>();
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof costApi.suggestions>>>([]);
  const [editing, setEditing] = useState<Partial<CostItem>>();
  const load = useCallback(() => {
    costApi
      .list()
      .then(setItems)
      .catch(() => undefined);
    costApi
      .summary(currency)
      .then(setSummary)
      .catch(() => undefined);
    costApi
      .suggestions()
      .then(setSuggestions)
      .catch(() => undefined);
  }, [currency]);
  useEffect(load, [load]);
  const fmt = (n: number, c = currency) => money(n, c, i18n.language);
  const max = Math.max(1, ...(summary?.trend.map((m) => m.amount) ?? [1]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("costs.intro")}</p>
        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            try {
              localStorage.setItem("igrek.costCurrency", e.target.value);
            } catch {
              // Private window: the choice lasts until reload.
            }
          }}
          className={field}
          aria-label={t("costs.currency")}
        >
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button
          icon={Plus}
          onClick={() => setEditing({ currency, period: "month", category: "saas", startsAt: Date.now() })}
        >
          {t("costs.add")}
        </Button>
      </div>
      {items && !items.length && !suggestions.length ? (
        <EmptyState icon={CircleDollarSign} title={t("costs.emptyTitle")} body={t("costs.emptyBody")} />
      ) : (
        <>
          {summary && (
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <Card className="space-y-2 p-pad">
                <p className="text-xs text-fg-muted">{t("costs.thisMonth")}</p>
                <p className="text-2xl font-semibold">{fmt(summary.month)}</p>
                <p className="text-xs text-fg-muted">{t("costs.nextYear", { amount: fmt(summary.year) })}</p>
                <ul className="space-y-0.5 pt-1 text-xs">
                  {summary.byCategory.map((c) => (
                    <li key={c.category} className="flex justify-between">
                      <span className="text-fg-muted">{t(`costs.cat_${c.category}`)}</span>
                      <span>{fmt(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-pad">
                <p className="mb-2 text-xs text-fg-muted">{t("costs.trend")}</p>
                <div className="flex h-36 items-end gap-1.5" role="img" aria-label={t("costs.trend")}>
                  {summary.trend.map((m) => (
                    <div
                      key={m.month}
                      className="flex flex-1 flex-col items-center gap-1"
                      data-tip={`${m.month}: ${fmt(m.amount)}`}
                    >
                      <div
                        className="w-full rounded-t bg-accent/70"
                        style={{ height: `${Math.max(2, (m.amount / max) * 112)}px` }}
                      />
                      <span className="text-[10px] text-fg-subtle">{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-fg-subtle">
                  {summary.ratesDate ? t("costs.rates", { date: summary.ratesDate }) : t("costs.noRates")}
                  {summary.unconverted.length > 0 &&
                    ` · ${t("costs.unconverted", { list: summary.unconverted.join(", ") })}`}
                </p>
              </Card>
            </div>
          )}
          {(items ?? []).length > 0 && (
            <Card>
              <ul className="divide-y divide-border">
                {(items ?? []).map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 px-pad py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{it.name}</p>
                      <p className="text-[11px] text-fg-subtle">
                        {t(`costs.cat_${it.category}`)}
                        {it.projectId && ` · ${projects.find((p) => p.id === it.projectId)?.name ?? ""}`}
                        {it.endsAt &&
                          ` · ${t("costs.endedAt", { month: new Date(it.endsAt).toISOString().slice(0, 7) })}`}
                      </p>
                    </div>
                    <span className="text-[13px]">
                      {fmt(it.amount, it.currency)}{" "}
                      <span className="text-xs text-fg-subtle">/ {t(`costs.per_${it.period}`)}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      aria-label={t("costs.edit")}
                      onClick={() => setEditing(it)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      aria-label={t("costs.remove")}
                      onClick={() => void costApi.remove(it.id).then(load)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {suggestions.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold">{t("costs.suggested")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() =>
                      setEditing({
                        name: s.name,
                        category: s.category,
                        period: s.period,
                        currency,
                        startsAt: Date.now(),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs hover:bg-bg-hover"
                  >
                    <Plus size={12} aria-hidden="true" />
                    {s.name}
                    <Badge>{t(`costs.cat_${s.category}`)}</Badge>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <ItemDialog item={editing} onClose={() => setEditing(undefined)} onSaved={load} />
    </div>
  );
}
