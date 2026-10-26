import type { Seat } from "@igrek/core";
import { AlertTriangle, Building2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Card, EmptyState, PageHeader, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, modelName, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { useSettings } from "../lib/settings";

const FULL = 0.9;

function Meter({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.95 ? "bg-danger" : value >= 0.8 ? "bg-warning" : "bg-success";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
      <span className="w-16 shrink-0">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(3, pct)}%` }} />
      </span>
      <span className="w-8 text-end font-mono">{pct}%</span>
    </span>
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

function SeatRow({ seat, newest }: { seat: Seat; newest?: string }) {
  const { t } = useTranslation();
  const model = topModel(seat);
  const old = newest && seat.version && seat.version !== newest;
  return (
    <tr className="align-top">
      <td className="py-3 pe-4">
        <p className="flex items-center gap-2 text-[13.5px] font-medium">
          <StatusDot tone={seat.online ? "success" : "neutral"} />
          {seat.name}
          {seat.role === "admin" && <Badge>{t("company.admin")}</Badge>}
        </p>
        <p className="ps-4 text-[11.5px] text-fg-subtle">
          {seat.online
            ? t("company.online")
            : seat.lastSeen
              ? t("company.seen", { when: relativeTime(seat.lastSeen) })
              : t("company.neverSeen")}
        </p>
      </td>
      <td className="py-3 pe-4">
        {seat.at === 0 ? (
          <p className="text-[12px] text-fg-subtle">{t("company.noReport")}</p>
        ) : (
          <ul className="space-y-2">
            {seat.accounts.map((a) => (
              <li key={`${a.provider}:${a.label}`} className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-[12.5px]">
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
      </td>
      <td className="py-3 pe-4 text-[12.5px]">
        <p className="font-medium">{t("company.sessions", { count: seat.week.sessions })}</p>
        <p className="text-fg-muted">
          {t("company.tokens", { tokens: compactNumber(seat.week.input + seat.week.output) })}
        </p>
        {model && <p className="text-[11.5px] text-fg-subtle">{modelName(model)}</p>}
      </td>
      <td className="py-3 text-[12px] text-fg-muted">
        {seat.version && (
          <p className={cn(old && "text-warning")}>
            Igrek {seat.version}
            {old && ` · ${t("company.oldVersion")}`}
          </p>
        )}
        {seat.at > 0 && (
          <p className="text-[11.5px] text-fg-subtle">{t("company.reported", { when: relativeTime(seat.at) })}</p>
        )}
      </td>
    </tr>
  );
}

/**
 * The Company page (plan.md, 26 Oct 2026): everyone in the team, their AI accounts with how full
 * each limit is, and their week, so whoever runs the team sees who is about to hit a limit and who
 * runs an old Igrek. Each Igrek reports itself, encrypted for the team; no chat or email is in it.
 */
export function CompanyPage() {
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
    <div className="flex h-full flex-col">
      <PageHeader title={t("company.title")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
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
              <Card className="overflow-x-auto p-pad">
                <table className="w-full min-w-[720px] text-start">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
                      <th className="pb-2 text-start font-semibold">{t("company.person")}</th>
                      <th className="pb-2 text-start font-semibold">{t("company.accounts")}</th>
                      <th className="pb-2 text-start font-semibold">{t("company.thisWeek")}</th>
                      <th className="pb-2 text-start font-semibold">{t("company.app")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((s) => (
                      <SeatRow key={s.memberId} seat={s} newest={newest} />
                    ))}
                  </tbody>
                </table>
              </Card>
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
      </div>
    </div>
  );
}
