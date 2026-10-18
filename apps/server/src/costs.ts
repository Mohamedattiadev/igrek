import type { Database } from "bun:sqlite";
import { type CostItem, type CostSummary, costInMonth } from "@igrek/core";
import type { Accounts } from "./accounts";
import type { Monitors } from "./monitors";
import type { Servers } from "./servers";

const CATEGORIES = ["server", "ai", "api", "saas", "domain", "other"] as const;
const PERIODS = ["month", "year", "once"] as const;

type Rates = { base: "EUR"; date: string; rates: Record<string, number>; at: number };

/**
 * Cost panel (plan.md 12): servers, AI plans, APIs and SaaS subscriptions you enter once, the
 * monthly total in one currency and its trend. Exchange rates are the European Central Bank's,
 * fetched once a day from frankfurter.dev (free, no account). Nothing about you is sent.
 */
export class Costs {
  private rates?: Rates;

  constructor(
    private readonly db: Database,
    private readonly sources: { accounts?: Accounts; servers?: Servers; monitors?: Monitors } = {},
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  list(): CostItem[] {
    return (
      this.db.query("SELECT id, data FROM cost_items ORDER BY created_at").all() as { id: string; data: string }[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Omit<CostItem, "id">),
      id: r.id,
    }));
  }

  private clean(input: Partial<CostItem>): Omit<CostItem, "id"> {
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 100);
    if (!name) throw new Error("Give it a name");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter an amount");
    const currency = String(input.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Use a currency code like USD or TRY");
    return {
      name,
      category: CATEGORIES.includes(input.category as never) ? (input.category as CostItem["category"]) : "other",
      amount: Math.round(amount * 100) / 100,
      currency,
      period: PERIODS.includes(input.period as never) ? (input.period as CostItem["period"]) : "month",
      startsAt: Number(input.startsAt) || Date.now(),
      ...(input.endsAt ? { endsAt: Number(input.endsAt) } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.note ? { note: String(input.note).slice(0, 300) } : {}),
    };
  }

  add(input: Partial<CostItem>): CostItem {
    const item = this.clean(input);
    const id = crypto.randomUUID().slice(0, 12);
    this.db
      .query("INSERT INTO cost_items (id, data, created_at) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(item), Date.now());
    return { ...item, id };
  }

  update(id: string, input: Partial<CostItem>): CostItem {
    const item = this.clean(input);
    this.db.query("UPDATE cost_items SET data = ? WHERE id = ?").run(JSON.stringify(item), id);
    return { ...item, id };
  }

  remove(id: string): void {
    this.db.query("DELETE FROM cost_items WHERE id = ?").run(id);
  }

  /** Things Igrek knows you pay for but not how much: AI accounts, servers, watched domains. */
  suggestions(): { name: string; category: CostItem["category"]; period: CostItem["period"] }[] {
    const have = new Set(this.list().map((i) => i.name.toLowerCase()));
    const out: { name: string; category: CostItem["category"]; period: CostItem["period"] }[] = [];
    for (const a of this.sources.accounts?.list() ?? []) {
      const name = `${a.provider === "claude" ? "Claude" : a.provider === "codex" ? "ChatGPT / Codex" : a.provider}${a.plan ? ` ${a.plan}` : ""} (${a.label})`;
      out.push({ name, category: "ai", period: "month" });
    }
    for (const s of this.sources.servers?.list() ?? [])
      out.push({ name: `${s.name} (${s.target})`, category: "server", period: "month" });
    for (const d of this.sources.monitors?.domains() ?? [])
      out.push({ name: d.registrable ?? d.host, category: "domain", period: "year" });
    const seen = new Set<string>();
    return out.filter((s) => !have.has(s.name.toLowerCase()) && !seen.has(s.name) && seen.add(s.name));
  }

  private async loadRates(): Promise<Rates | undefined> {
    if (this.rates && Date.now() - this.rates.at < 12 * 3_600_000) return this.rates;
    try {
      const res = await this.fetcher("https://api.frankfurter.dev/v1/latest?base=EUR", {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { date: string; rates: Record<string, number> };
      this.rates = { base: "EUR", date: body.date, rates: { ...body.rates, EUR: 1 }, at: Date.now() };
    } catch {
      // Offline: keep the last rates if there are any; same-currency items still add up.
    }
    return this.rates;
  }

  /** Amount in `to`, or undefined when there's no rate for one of the currencies. */
  private convert(amount: number, from: string, to: string, rates?: Rates): number | undefined {
    if (from === to) return amount;
    const a = rates?.rates[from];
    const b = rates?.rates[to];
    return a && b ? (amount / a) * b : undefined;
  }

  async summary(currency: string, now = new Date()): Promise<CostSummary> {
    const to = currency.toUpperCase();
    const items = this.list();
    const rates = await this.loadRates();
    const unconverted = new Set<string>();
    const value = (item: CostItem, y: number, m: number) => {
      const v = this.convert(costInMonth(item, y, m), item.currency, to, rates);
      if (v === undefined) unconverted.add(item.currency);
      return v ?? 0;
    };
    const y = now.getFullYear();
    const m = now.getMonth();
    const trend = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, m - 11 + i, 1);
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        amount: items.reduce((sum, it) => sum + value(it, d.getFullYear(), d.getMonth()), 0),
      };
    });
    const year = Array.from({ length: 12 }, (_, i) => new Date(y, m + i, 1)).reduce(
      (sum, d) => sum + items.reduce((s, it) => s + value(it, d.getFullYear(), d.getMonth()), 0),
      0,
    );
    const byCategory = CATEGORIES.map((category) => ({
      category,
      amount: items.filter((i) => i.category === category).reduce((s, it) => s + value(it, y, m), 0),
    })).filter((c) => c.amount > 0);
    const projects = new Map<string | undefined, number>();
    for (const it of items) projects.set(it.projectId, (projects.get(it.projectId) ?? 0) + value(it, y, m));
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      currency: to,
      month: round(trend[11]?.amount ?? 0),
      year: round(year),
      byCategory: byCategory.map((c) => ({ ...c, amount: round(c.amount) })).sort((a, b) => b.amount - a.amount),
      byProject: [...projects]
        .map(([projectId, amount]) => ({ ...(projectId ? { projectId } : {}), amount: round(amount) }))
        .filter((p) => p.amount > 0)
        .sort((a, b) => b.amount - a.amount),
      trend: trend.map((t) => ({ ...t, amount: round(t.amount) })),
      ...(rates ? { ratesDate: rates.date } : {}),
      unconverted: [...unconverted],
    };
  }
}
