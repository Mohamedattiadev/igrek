import { type Seat, type SeatBudget, seatAdvice } from "@igrek/core";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Card, StatusDot } from "../../components/ui";
import { cn } from "../../lib/cn";
import { compactNumber, modelName, relativeTime } from "../../lib/format";
import { BudgetLine, overBudget, planPrice } from "./CompanyBudgets";

/*
 * The Company page's people cards, what to watch and the plans, shared by Igrek and the hub's web
 * page (plan.md 20.1), so a general manager in a browser sees the same page.
 */

const FULL = 0.9;

/** A limit as a thin bar with its share, small enough for two on one line. */
function Meter({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.95 ? "bg-danger" : value >= 0.8 ? "bg-warning" : "bg-success";
  return (
    <span className="flex w-32 items-center gap-1.5 text-[11.5px] text-fg-muted" data-tip={`${label}: ${pct}%`}>
      <span className="w-9 shrink-0 truncate">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(3, pct)}%` }} />
      </span>
      <span className={cn("w-8 shrink-0 text-end tabular-nums", value >= 0.8 && "font-medium text-fg")}>{pct}%</span>
    </span>
  );
}

/** The week's numbers in one strip, not four tall cards (a user found them too big and too empty). */
function Stats({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <Card className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
      {items.map((x) => (
        <div key={x.label} className="px-pad py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{x.label}</p>
          <p className="flex items-baseline gap-2">
            <span className="text-[18px] font-semibold tracking-tight">{x.value}</span>
            {x.hint && <span className="truncate text-[11.5px] text-fg-muted">{x.hint}</span>}
          </p>
        </div>
      ))}
    </Card>
  );
}

const nearFull = (s: Seat) => s.accounts.some((a) => (a.fiveHour ?? 0) >= FULL || (a.week ?? 0) >= FULL);
const topModel = (s: Seat) => Object.entries(s.week.models).sort((a, b) => b[1] - a[1])[0]?.[0];

/**
 * One person (plan.md 19.8): who, each account on one line with its two limits, and their week in
 * words ("19 sessions, 2.4M tokens"): a lone big "19" said nothing about what it counted.
 */
function SeatCard({
  seat,
  newest,
  budget,
  admin,
  onBudget,
}: {
  seat: Seat;
  newest?: string;
  budget?: SeatBudget;
  admin: boolean;
  onBudget: (b: SeatBudget) => Promise<void>;
}) {
  const { t } = useTranslation();
  const model = topModel(seat);
  const old = newest && seat.version && seat.version !== newest;
  return (
    <Card className="space-y-2.5 p-pad">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[13px] font-semibold">
          {seat.name.slice(0, 1).toUpperCase()}
          <span className="absolute -end-0.5 -bottom-0.5">
            <StatusDot tone={seat.online ? "success" : "neutral"} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold">
            <span className="truncate">{seat.name}</span>
            {seat.role === "admin" && <Badge>{t("company.admin")}</Badge>}
          </p>
          <p className="text-[11.5px] text-fg-subtle">
            {seat.online
              ? t("company.online")
              : seat.lastSeen
                ? t("company.seen", { when: relativeTime(seat.lastSeen) })
                : t("company.neverSeen")}
          </p>
        </div>
        <p className="text-end text-[12px] text-fg-muted">
          <span className="font-medium text-fg">{t("company.sessions", { count: seat.week.sessions })}</span>
          {" · "}
          {t("company.tokens", { tokens: compactNumber(seat.week.input + seat.week.output) })}
          <span className="block text-[11px] text-fg-subtle">
            {t("company.thisWeek")}
            {model && ` · ${modelName(model)}`}
          </span>
        </p>
      </div>
      {seat.at === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">{t("company.noReport")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-ui border border-border">
          {seat.accounts.map((a) => (
            <li key={`${a.provider}:${a.label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
              <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
                <span className="font-medium">{a.provider === "claude" ? "Claude" : "Codex"}</span>
                <span className="truncate text-fg-muted">· {a.label}</span>
                {a.plan && <Badge>{a.plan}</Badge>}
                {a.active && <Badge tone="accent">{t("company.inUse")}</Badge>}
                {!a.loggedIn && <Badge tone="warning">{t("company.loggedOut")}</Badge>}
              </p>
              <Meter label={t("company.fiveHour")} value={a.fiveHour} />
              <Meter label={t("company.week")} value={a.week} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
        <BudgetLine seat={seat} budget={budget} admin={admin} onSave={onBudget} />
        <span className="flex-1" />
        {seat.version && (
          <span className={cn(old && "text-warning")}>
            Igrek {seat.version}
            {old && ` · ${t("company.oldVersion")}`}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * The Company page (plan.md, 26 Oct 2026): everyone in the team, their AI accounts with how full
 * each limit is, and their week, so whoever runs the team sees who is about to hit a limit and who
 * runs an old Igrek. Each Igrek reports itself, encrypted for the team; no chat or email is in it.
 */
/**
 * What an admin should look at (plan.md 18.6), beyond full limits: an AI account signed out, an
 * old Igrek, an Igrek that has not reported for a day.
 */
function Watch({ seats, newest, budgets }: { seats: Seat[]; newest?: string; budgets: Record<string, SeatBudget> }) {
  const { t } = useTranslation();
  const day = Date.now() - 86_400_000;
  const items = seats.flatMap((s) => [
    ...(overBudget(s, budgets[s.memberId]) ? [t("company.watchBudget", { name: s.name })] : []),
    ...s.accounts
      .filter((a) => !a.loggedIn)
      .map((a) => t("company.watchSignedOut", { name: s.name, account: a.label })),
    ...(s.version && newest && s.version !== newest
      ? [t("company.watchOld", { name: s.name, version: s.version, newest })]
      : []),
    ...(s.at && s.at < day ? [t("company.watchQuiet", { name: s.name, when: relativeTime(s.at) })] : []),
  ]);
  return (
    <Card>
      <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("company.watchTitle")}</h3>
      <ul className="divide-y divide-border text-[13px]">
        {items.map((line) => (
          <li key={line} className="flex items-start gap-2 px-pad py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            {line}
          </li>
        ))}
        {!items.length && <li className="px-pad py-3 text-fg-subtle">{t("company.watchNone")}</li>}
      </ul>
    </Card>
  );
}

/** Which AI plans the team pays for, counted, with who has each. */
function Plans({ seats }: { seats: Seat[] }) {
  const { t } = useTranslation();
  const plans = new Map<string, string[]>();
  const prices = new Map<string, number | undefined>();
  for (const s of seats)
    for (const a of s.accounts) {
      const name = `${a.provider === "codex" ? "Codex" : "Claude"} ${a.plan ? a.plan.charAt(0).toUpperCase() + a.plan.slice(1) : t("company.planUnknown")}`;
      plans.set(name, [...(plans.get(name) ?? []), s.name]);
      prices.set(name, planPrice(a.provider, a.plan));
    }
  const known = [...plans].reduce((n, [plan, who]) => n + (prices.get(plan) ?? 0) * who.length, 0);
  const unknown = [...plans]
    .filter(([plan]) => prices.get(plan) === undefined)
    .reduce((n, [, who]) => n + who.length, 0);
  return (
    <Card>
      <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("company.plansTitle")}</h3>
      <ul className="divide-y divide-border text-[13px]">
        {[...plans.entries()].map(([plan, who]) => (
          <li key={plan} className="flex items-center gap-3 px-pad py-2">
            <span className="font-medium">
              {who.length} x {plan}
            </span>
            <span className="min-w-0 flex-1 truncate text-end text-fg-subtle">{who.join(", ")}</span>
            <span className="w-24 text-end tabular-nums">
              {prices.get(plan) !== undefined
                ? t("company.perMonth", { usd: (prices.get(plan) ?? 0) * who.length })
                : t("company.priceUnknown")}
            </span>
          </li>
        ))}
        {!plans.size && <li className="px-pad py-3 text-fg-subtle">{t("company.plansNone")}</li>}
      </ul>
      {plans.size > 0 && (
        <p className="border-t border-border px-pad py-2 text-[12px] text-fg-muted">
          {known > 0 && t("company.billTotal", { usd: known })}
          {unknown > 0 && ` ${t("company.billUnknown", { count: unknown })}`}
        </p>
      )}
    </Card>
  );
}

/** Who should have which account (seat-advice.ts): suggestions only, the admin decides. */
function Advice({ seats }: { seats: Seat[] }) {
  const { t } = useTranslation();
  const items = seatAdvice(seats).map((a) =>
    a.kind === "noAccount"
      ? t("company.adviceNoAccount", { name: a.name })
      : a.kind === "smaller"
        ? t("company.adviceSmaller", { name: a.name, account: a.account, plan: a.plan, pct: a.pct })
        : a.to
          ? t("company.adviceLargerTo", { name: a.name, account: a.account, pct: a.pct, to: a.to })
          : t("company.adviceLarger", { name: a.name, account: a.account, pct: a.pct }),
  );
  return (
    <Card>
      <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("company.adviceTitle")}</h3>
      <ul className="divide-y divide-border text-[13px]">
        {items.map((line) => (
          <li key={line} className="flex items-start gap-2 px-pad py-2">
            <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            {line}
          </li>
        ))}
        {!items.length && <li className="px-pad py-3 text-fg-subtle">{t("company.adviceNone")}</li>}
      </ul>
    </Card>
  );
}

/** Everyone's accounts, limits and week: the numbers, what to watch, the plans, then a card each. */
export function SeatsOverview({
  seats,
  budgets,
  admin,
  onBudget,
}: {
  seats: Seat[];
  budgets: Record<string, SeatBudget>;
  admin: boolean;
  onBudget: (member: string, b: SeatBudget) => Promise<void>;
}) {
  const { t } = useTranslation();
  const list = [...seats].sort((a, b) => Number(nearFull(b)) - Number(nearFull(a)) || a.name.localeCompare(b.name));
  const newest = list
    .map((s) => s.version)
    .filter((v): v is string => !!v)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  const tokens = list.reduce((n, s) => n + s.week.input + s.week.output, 0);
  const full = list.filter(nearFull);
  return (
    <>
      <Stats
        items={[
          {
            label: t("company.people"),
            value: String(list.length),
            hint: t("company.onlineNow", { count: list.filter((s) => s.online).length }),
          },
          { label: t("company.weekSessions"), value: compactNumber(list.reduce((n, s) => n + s.week.sessions, 0)) },
          { label: t("company.weekTokens"), value: compactNumber(tokens) },
          { label: t("company.nearFull"), value: String(full.length), hint: t("company.nearFullHint") },
        ]}
      />
      {full.length > 0 && (
        <p className="flex items-center gap-2 rounded-ui border border-warning bg-warning-soft px-3 py-2 text-[13px]">
          <AlertTriangle size={15} className="shrink-0 text-warning" aria-hidden="true" />
          {t("company.fullWarning", { names: full.map((s) => s.name).join(", ") })}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <Watch seats={list} newest={newest} budgets={budgets} />
        <Plans seats={list} />
        <Advice seats={list} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((s) => (
          <SeatCard
            key={s.memberId}
            seat={s}
            newest={newest}
            budget={budgets[s.memberId]}
            admin={admin}
            onBudget={(b) => onBudget(s.memberId, b)}
          />
        ))}
      </div>
    </>
  );
}
