import type { Seat } from "@igrek/core";
import { AlertTriangle, Building2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { useTeamPeople } from "../components/TeamAvatar";
import { Badge, Card, Dialog, EmptyState, PageHeader, Section, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, modelName, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { useSettings } from "../lib/settings";
import { CompanyRules } from "./company/CompanyRules";
import { CompanyWork } from "./company/CompanyWork";
import { AdminPanel, RecoveryBody, Sharing } from "./Team";

const FULL = 0.9;

function Meter({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.95 ? "bg-danger" : value >= 0.8 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-1">
      <p className="flex justify-between text-[12px] text-fg-muted">
        <span>{label}</span>
        <span className={cn("font-medium", value >= 0.8 ? "text-fg" : "text-fg-muted")}>{pct}%</span>
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-pad">
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-[12px] text-fg-muted">{hint}</p>}
    </Card>
  );
}

const nearFull = (s: Seat) => s.accounts.some((a) => (a.fiveHour ?? 0) >= FULL || (a.week ?? 0) >= FULL);
const topModel = (s: Seat) => Object.entries(s.week.models).sort((a, b) => b[1] - a[1])[0]?.[0];

/** One person as a card (plan.md 19.8): who, their accounts with big limit bars, their week. */
function SeatCard({ seat, newest }: { seat: Seat; newest?: string }) {
  const { t } = useTranslation();
  const model = topModel(seat);
  const old = newest && seat.version && seat.version !== newest;
  return (
    <Card className="space-y-4 p-pad">
      <div className="flex items-center gap-3">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[15px] font-semibold">
          {seat.name.slice(0, 1).toUpperCase()}
          <span className="absolute -end-0.5 -bottom-0.5">
            <StatusDot tone={seat.online ? "success" : "neutral"} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="truncate">{seat.name}</span>
            {seat.role === "admin" && <Badge>{t("company.admin")}</Badge>}
          </p>
          <p className="text-[12px] text-fg-subtle">
            {seat.online
              ? t("company.online")
              : seat.lastSeen
                ? t("company.seen", { when: relativeTime(seat.lastSeen) })
                : t("company.neverSeen")}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[18px] font-semibold">{seat.week.sessions}</p>
          <p className="text-[11px] text-fg-subtle">{t("company.thisWeek")}</p>
        </div>
      </div>
      {seat.at === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">{t("company.noReport")}</p>
      ) : (
        <ul className="space-y-3">
          {seat.accounts.map((a) => (
            <li key={`${a.provider}:${a.label}`} className="space-y-2 rounded-ui bg-bg-subtle p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="font-medium">{a.provider === "claude" ? "Claude" : "Codex"}</span>
                <span className="text-fg-muted">· {a.label}</span>
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
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-[12px] text-fg-muted">
        <span>{t("company.sessions", { count: seat.week.sessions })}</span>
        <span>{t("company.tokens", { tokens: compactNumber(seat.week.input + seat.week.output) })}</span>
        {model && <span>{modelName(model)}</span>}
        <span className="flex-1" />
        {seat.version && (
          <span className={cn(old && "text-warning")}>
            Igrek {seat.version}
            {old && ` · ${t("company.oldVersion")}`}
          </span>
        )}
      </p>
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
function Watch({ seats, newest }: { seats: Seat[]; newest?: string }) {
  const { t } = useTranslation();
  const day = Date.now() - 86_400_000;
  const items = seats.flatMap((s) => [
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
  for (const s of seats)
    for (const a of s.accounts) {
      const name = `${a.provider === "codex" ? "Codex" : "Claude"} ${a.plan ? a.plan.charAt(0).toUpperCase() + a.plan.slice(1) : t("company.planUnknown")}`;
      plans.set(name, [...(plans.get(name) ?? []), s.name]);
    }
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
          </li>
        ))}
        {!plans.size && <li className="px-pad py-3 text-fg-subtle">{t("company.plansNone")}</li>}
      </ul>
    </Card>
  );
}

/** The overview tab: everyone's accounts, limits and week. */
function CompanyOverview() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [seats, setSeats] = useState<Seat[]>();
  const load = useCallback(
    () =>
      void api
        .company()
        .then(setSeats)
        .catch(() => setSeats([])),
    [],
  );
  useEffect(load, [load]);
  useServerEvent("team-changed", load);
  const list = [...(seats ?? [])].sort(
    (a, b) => Number(nearFull(b)) - Number(nearFull(a)) || a.name.localeCompare(b.name),
  );
  const newest = list
    .map((s) => s.version)
    .filter((v): v is string => !!v)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  const tokens = list.reduce((n, s) => n + s.week.input + s.week.output, 0);
  const full = list.filter(nearFull);
  return (
    <div className="space-y-5">
      {seats && seats.length === 0 ? (
        <EmptyState icon={Building2} title={t("company.emptyTitle")} body={t("company.emptyBody")} />
      ) : (
        <>
          <p className="max-w-3xl text-[13px] text-fg-muted">{t("company.intro")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t("company.people")}
              value={String(list.length)}
              hint={t("company.onlineNow", { count: list.filter((s) => s.online).length })}
            />
            <Stat
              label={t("company.weekSessions")}
              value={compactNumber(list.reduce((n, s) => n + s.week.sessions, 0))}
            />
            <Stat label={t("company.weekTokens")} value={compactNumber(tokens)} />
            <Stat label={t("company.nearFull")} value={String(full.length)} hint={t("company.nearFullHint")} />
          </div>
          {full.length > 0 && (
            <p className="flex items-center gap-2 rounded-ui border border-warning bg-warning-soft px-3 py-2 text-[13px]">
              <AlertTriangle size={15} className="shrink-0 text-warning" aria-hidden="true" />
              {t("company.fullWarning", { names: full.map((s) => s.name).join(", ") })}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Watch seats={list} newest={newest} />
            <Plans seats={list} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((s) => (
              <SeatCard key={s.memberId} seat={s} newest={newest} />
            ))}
          </div>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-pad">
            <div className="max-w-2xl">
              <p className="text-[13.5px] font-medium">{t("company.shareTitle")}</p>
              <p className="text-[12.5px] text-fg-muted">{t("company.shareHint")}</p>
            </div>
            <Segmented
              label={t("company.shareTitle")}
              value={settings.shareUsage ? "on" : "off"}
              onChange={(v) => void update({ shareUsage: v === "on" })}
              options={[
                { value: "on", label: t("settings.on") },
                { value: "off", label: t("settings.off") },
              ]}
            />
          </Card>
          <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
            <Users size={13} aria-hidden="true" />
            <Link to="/team" className="text-accent hover:underline">
              {t("company.manage")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

const TABS = ["overview", "work", "people", "rules", "sharing", "audit", "hub"] as const;
const MEMBER_TABS: (typeof TABS)[number][] = ["overview", "work", "sharing"];

/**
 * The company (plan.md, 26-27 Oct 2026): an overview for everyone; for admins also its people,
 * its rules, what is shared, the record of what happened and the hub. One's own account is on
 * the profile page, the day's work on the Team page.
 */
export function CompanyPage() {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const [params, setParams] = useSearchParams();
  const [recovery, setRecovery] = useState<string>();
  const me = people.status?.user;
  const admin = me?.role === "admin";
  const tabs = admin ? TABS : MEMBER_TABS;
  const tab = tabs.find((v) => v === params.get("tab")) ?? "overview";
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("company.title")} />
      {people.status?.configured && (
        <div className="border-b border-border px-6 py-2">
          <Segmented
            label={t("company.title")}
            value={tab}
            onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })}
            options={tabs.map((v) => ({ value: v, label: t(`company.tab_${v}`) }))}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          {tab === "overview" && <CompanyOverview />}
          {tab === "work" && <CompanyWork />}
          {tab === "rules" && <CompanyRules />}
          {tab === "sharing" && (
            <Section title={t("team.sharing")} hint={t("team.sharingHint")}>
              <Sharing />
            </Section>
          )}
          {me && (tab === "people" || tab === "audit" || tab === "hub") && (
            <AdminPanel me={me.id} part={tab} onRecovery={setRecovery} />
          )}
        </div>
      </div>
      <Dialog open={!!recovery} onClose={() => setRecovery(undefined)} label={t("team.recoveryTitle")}>
        {recovery && <RecoveryBody value={recovery} onClose={() => setRecovery(undefined)} />}
      </Dialog>
    </div>
  );
}
