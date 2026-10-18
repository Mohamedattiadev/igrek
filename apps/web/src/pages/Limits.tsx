import type { Account, AiTool, LimitsOverview, MonthlyReport, RateLimitInfo, UsageBucket } from "@igrek/core";
import { AlertTriangle, CheckCircle2, Download, Gauge, LogIn, Plus, RefreshCw, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Term } from "../components/Term";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Section, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, modelName, relativeTime } from "../lib/format";
import i18n from "../lib/i18n";
import { useServerEvent } from "../lib/live";
import { usePersonaLabel, usePersonas } from "../lib/personas";

const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

function clock(at: number): string {
  return new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(at);
}

/** A limit bar: status color by how full it is, with the reset time next to it. */
function LimitMeter({ label, value, resetsAt }: { label: string; value?: number; resetsAt?: number }) {
  const { t } = useTranslation();
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const tone = value >= 0.95 ? "bg-danger" : value >= 0.8 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-fg-muted">{pct}%</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: styled bar; <meter> can't take the status colors reliably */}
      <div
        className="h-2 overflow-hidden rounded-full bg-bg-muted"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {resetsAt && <p className="text-[11px] text-fg-subtle">{t("limits.resets", { when: relativeTime(resetsAt) })}</p>}
    </div>
  );
}

function AccountLimits({ account }: { account: LimitsOverview["accounts"][number] }) {
  const { t } = useTranslation();
  const limit: RateLimitInfo | undefined = account.rateLimit;
  const high = (limit?.fiveHour ?? 0) >= 0.8 || (limit?.week ?? 0) >= 0.8;
  return (
    <Card className={cn("space-y-3 p-pad", high && "border-warning")}>
      <div className="flex items-center gap-2">
        <User size={14} className="text-fg-subtle" />
        <span className="text-[13px] font-semibold">{account.label}</span>
        <span className="truncate text-xs text-fg-subtle">{account.email}</span>
        {account.plan && <Badge>{account.plan}</Badge>}
        {account.active && <Badge tone="accent">{t("accounts.active")}</Badge>}
      </div>
      {limit ? (
        <>
          <LimitMeter label={t("limits.fiveHour")} value={limit.fiveHour} resetsAt={limit.fiveHourResetsAt} />
          <LimitMeter label={t("limits.week")} value={limit.week} resetsAt={limit.weekResetsAt} />
          {account.forecast?.fullAt ? (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} />
              {t("limits.fullAt", { time: clock(account.forecast.fullAt) })}
            </p>
          ) : account.forecast ? (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 size={12} />
              {t("limits.safe")}
            </p>
          ) : null}
          {account.forecast?.perHour ? (
            <p className="text-[11px] text-fg-subtle">
              {t("limits.pace", { pct: Math.round(account.forecast.perHour * 100) })}
            </p>
          ) : null}
          {high && <p className="rounded-md bg-warning-soft p-2 text-xs text-warning">{t("limits.switchHint")}</p>}
          <p className="text-[10.5px] text-fg-subtle">{relativeTime(limit.at)}</p>
        </>
      ) : (
        <p className="text-xs text-fg-muted">{t("limits.noData")}</p>
      )}
    </Card>
  );
}

/** 14 days of tokens, stacked by project (top 6 + Other). */
function DaysChart({ data }: { data: LimitsOverview }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number>();
  const top = data.projects.slice(0, 6).map((p) => p.label);
  const color = (name: string) => {
    const index = top.indexOf(name);
    return index >= 0 ? SERIES[index] : "var(--series-other)";
  };
  const max = Math.max(1, ...data.days.map((d) => d.total));
  const width = 640;
  const height = 180;
  const barW = width / data.days.length;
  const day = hover !== undefined ? data.days[hover] : undefined;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        {top.map((name) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: color(name) }} />
            {name}
          </span>
        ))}
        {data.projects.length > 6 && (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: "var(--series-other)" }} />
            {t("limits.other")}
          </span>
        )}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height + 18}`} className="w-full" role="img" aria-label={t("limits.days")}>
          <line x1={0} x2={width} y1={height} y2={height} stroke="var(--border)" />
          {data.days.map((d, i) => {
            let y = height;
            const segments = Object.entries(d.byProject)
              .map(([name, tokens]) => ({ name: top.includes(name) ? name : "__other", tokens }))
              .reduce<Record<string, number>>((acc, s) => {
                acc[s.name] = (acc[s.name] ?? 0) + s.tokens;
                return acc;
              }, {});
            const order = [...top, "__other"].filter((name) => segments[name]);
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the tooltip; every value is also in <title> and the lists
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
                <title>{`${d.day}: ${compactNumber(d.total)}`}</title>
                <rect x={i * barW} y={0} width={barW} height={height} fill="transparent" />
                {order.map((name, j) => {
                  const h = ((segments[name] ?? 0) / max) * (height - 8);
                  y -= h;
                  const isTop = j === order.length - 1;
                  return (
                    <rect
                      key={name}
                      x={i * barW + barW * 0.18}
                      y={y}
                      width={barW * 0.64}
                      height={Math.max(0, h - 2)}
                      rx={isTop ? 3 : 0}
                      fill={name === "__other" ? "var(--series-other)" : color(name)}
                      opacity={hover === undefined || hover === i ? 1 : 0.45}
                    />
                  );
                })}
                {(i % 2 === 0 || i === data.days.length - 1) && (
                  <text
                    x={i * barW + barW / 2}
                    y={height + 13}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--fg-subtle)"
                  >
                    {d.day.slice(8)}.{d.day.slice(5, 7)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {day && hover !== undefined && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-52 rounded-ui border border-border bg-bg p-2 text-[11px] shadow-ui"
            style={{ left: `min(calc(${((hover + 0.5) / data.days.length) * 100}% + 8px), calc(100% - 13rem))` }}
          >
            <p className="mb-1 font-semibold">
              {day.day} · {compactNumber(day.total)} {t("limits.tokens")}
            </p>
            {Object.entries(day.byProject)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([name, tokens]) => (
                <p key={name} className="flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: color(name) }} />
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{name}</span>
                  <span className="font-mono">{compactNumber(tokens)}</span>
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Bars({
  items,
  link,
  format,
}: {
  items: (UsageBucket & { projectId?: string | null })[];
  link?: (item: UsageBucket & { projectId?: string | null }) => string | undefined;
  format?: (label: string) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.tokens));
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const to = link?.(item);
        const label = format ? format(item.label) : item.label;
        return (
          <li key={item.key} className="group" title={`${label}: ${item.tokens.toLocaleString(i18n.language)}`}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              {to ? (
                <Link to={to} className="min-w-0 truncate hover:text-accent">
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{label}</span>
              )}
              <span className="shrink-0 font-mono text-[11px] text-fg-muted">{compactNumber(item.tokens)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(item.tokens / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function HoursChart({ hours }: { hours: LimitsOverview["hours"] }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number>();
  const max = Math.max(1, ...hours.map((h) => h.tokens));
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 480 90" className="w-full" role="img" aria-label={t("limits.hours")}>
        {hours.map((h) => {
          const height = (h.tokens / max) * 70;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the tooltip; every value is also in <title> and the lists
            <g key={h.hour} onMouseEnter={() => setHover(h.hour)} onMouseLeave={() => setHover(undefined)}>
              <title>{`${String(h.hour).padStart(2, "0")}:00: ${compactNumber(h.tokens)}`}</title>
              <rect x={h.hour * 20} y={0} width={20} height={76} fill="transparent" />
              <rect
                x={h.hour * 20 + 3}
                y={74 - height}
                width={14}
                height={Math.max(height, 1)}
                rx={2}
                fill="var(--accent)"
                opacity={hover === undefined || hover === h.hour ? 1 : 0.4}
              />
              {h.hour % 3 === 0 && (
                <text x={h.hour * 20 + 10} y={88} textAnchor="middle" fontSize="9" fill="var(--fg-subtle)">
                  {String(h.hour).padStart(2, "0")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="h-4 text-[11px] text-fg-muted">
        {hover !== undefined &&
          `${String(hover).padStart(2, "0")}:00 · ${compactNumber(hours[hover]?.tokens ?? 0)} ${t("limits.tokens")}`}
      </p>
    </div>
  );
}

function AddAccount({ onAdded }: { onAdded: (account: Account) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AiTool>("claude");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string>();
  return (
    <>
      <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
        {t("accounts.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("accounts.add")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("accounts.add")}</h2>
          <Segmented
            value={provider}
            onChange={setProvider}
            options={[
              { value: "claude", label: "Claude" },
              { value: "codex", label: "Codex" },
            ]}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("accounts.labelPlaceholder")}
            className="h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
          />
          <p className="text-xs text-fg-muted">{t("accounts.loginHint")}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("memory.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!label.trim()}
              onClick={async () => {
                try {
                  const account = await api.addAccount(provider, label);
                  setOpen(false);
                  setLabel("");
                  onAdded(account);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              {t("accounts.login")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function AccountsSection({ accounts, reload }: { accounts: Account[]; reload: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = async (account: Account) => navigate(`/t/${(await api.loginAccount(account.id)).id}`);
  return (
    <Section title={t("accounts.title")} hint={t("accounts.noSwitch")}>
      <div className="space-y-2">
        <Card>
          <ul className="divide-y divide-border">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-2 px-pad py-2.5 text-[13px]">
                <Badge>{account.provider === "codex" ? "Codex" : "Claude"}</Badge>
                <span className="font-medium">
                  {account.isDefault ? `${account.label} (${t("accounts.main")})` : account.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
                  {account.loggedIn ? account.email : t("accounts.loggedOut")}
                </span>
                {account.active ? (
                  <Badge tone="accent">{t("accounts.active")}</Badge>
                ) : (
                  account.loggedIn && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.activateAccount(account.id);
                        reload();
                      }}
                    >
                      {t("accounts.use")}
                    </Button>
                  )
                )}
                {!account.loggedIn && (
                  <Button size="sm" variant="primary" icon={LogIn} onClick={() => login(account)}>
                    {t("accounts.login")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RefreshCw}
                  aria-label={t("accounts.refresh")}
                  onClick={async () => {
                    await api.refreshAccount(account.id);
                    reload();
                  }}
                />
                {!account.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label={t("accounts.remove")}
                    onClick={async () => {
                      await api.removeAccount(account.id);
                      reload();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
        <AddAccount onAdded={login} />
      </div>
    </Section>
  );
}

/** Limits page (plan.md 3.2): what is used, where and when, with a pace forecast. */
/** Month by month (plan.md 3.2): totals, top model and top projects, downloadable as CSV. */
function MonthlyCard() {
  const { t, i18n } = useTranslation();
  const [months, setMonths] = useState<MonthlyReport[]>();
  useEffect(() => {
    api
      .limitsMonthly()
      .then(setMonths)
      .catch(() => setMonths([]));
  }, []);
  if (!months?.length) return null;
  const max = Math.max(...months.map((m) => m.tokens), 1);
  const label = (month: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
  const csv = () => {
    const lines = [
      ["month", "tokens", "input", "output", "cache_read", "sessions", "top_model", "top_project"].join(","),
    ];
    for (const m of months) {
      const top = Object.entries(m.models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      lines.push(
        [
          m.month,
          m.tokens,
          m.input,
          m.output,
          m.cacheRead,
          m.sessions,
          top,
          JSON.stringify(m.projects[0]?.name ?? ""),
        ].join(","),
      );
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "igrek-usage.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {t("limits.monthly")}
          <Term k="token" />
        </h3>
        <Button size="sm" variant="ghost" icon={Download} onClick={csv} data-tip={t("limits.csvTip")}>
          CSV
        </Button>
      </div>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (WCAG 2.1.1)
        tabIndex={0}
        aria-label={t("limits.monthly")}
        className="overflow-x-auto"
      >
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-fg-subtle">
            <tr>
              <th className="py-1 text-start font-medium">{t("limits.month")}</th>
              <th className="py-1 text-end font-medium">{t("limits.tokensCol")}</th>
              <th className="w-40 py-1" />
              <th className="py-1 text-end font-medium">{t("limits.sessionCount")}</th>
              <th className="py-1 ps-4 text-start font-medium">{t("limits.topModel")}</th>
              <th className="py-1 text-start font-medium">{t("limits.topProjects")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {months.map((m) => {
              const top = Object.entries(m.models).sort((a, b) => b[1] - a[1])[0]?.[0];
              return (
                <tr key={m.month}>
                  <td className="py-1.5 capitalize">{label(m.month)}</td>
                  <td className="py-1.5 text-end font-mono">{compactNumber(m.tokens)}</td>
                  <td className="px-2 py-1.5">
                    <div className="h-1.5 rounded-full bg-bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(m.tokens / max) * 100}%`, background: "var(--series-1)" }}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 text-end font-mono">{m.sessions}</td>
                  <td className="py-1.5 ps-4">{top ? modelName(top) : "—"}</td>
                  <td className="truncate py-1.5 text-fg-muted">
                    {m.projects
                      .slice(0, 3)
                      .map((p) => p.name)
                      .join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </Card>
  );
}

export function LimitsPage() {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const personaName = usePersonaLabel();
  const [data, setData] = useState<LimitsOverview>();
  const load = () => {
    api
      .limits()
      .then(setData)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("limits-changed", load);
  useServerEvent("accounts-changed", load);
  const accounts = useMemo(() => data?.accounts ?? [], [data]);

  return (
    <>
      <PageHeader title={t("limits.title")} />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <p className="text-[13px] text-fg-muted">{t("limits.subtitle")}</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts
            .filter((a) => a.provider === "claude" || a.rateLimit)
            .map((account) => (
              <AccountLimits key={account.id} account={account} />
            ))}
        </div>
        {data && data.total === 0 && (
          <EmptyState icon={Gauge} title={t("limits.emptyTitle")} body={t("limits.emptyBody")} />
        )}
        {data && data.total > 0 && (
          <>
            <Card className="space-y-3 p-pad">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("limits.days")}</h3>
                <span className="text-xs text-fg-muted" title={t("limits.tokensHint")}>
                  {t("limits.total", { tokens: compactNumber(data.total) })}
                </span>
              </div>
              <DaysChart data={data} />
            </Card>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="space-y-3 p-pad">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("limits.projects")}</h3>
                <Bars items={data.projects} link={(item) => (item.key ? `/p/${item.key}` : undefined)} />
              </Card>
              <Card className="space-y-3 p-pad">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("limits.models")}</h3>
                <Bars items={data.models} format={modelName} />
                {data.personas.length > 0 && (
                  <>
                    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      {t("limits.personas")}
                    </h3>
                    <Bars
                      items={data.personas}
                      format={(id) =>
                        personaName(
                          personas.find((p) => p.id === id),
                          id,
                        ).name
                      }
                      link={(item) => `/personas/${item.key}`}
                    />
                  </>
                )}
                <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("limits.hours")}
                </h3>
                <HoursChart hours={data.hours} />
              </Card>
              <Card className="space-y-3 p-pad">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("limits.sessions")}</h3>
                <Bars
                  items={data.sessions}
                  link={(item) => (item.projectId ? `/p/${item.projectId}/s/${item.key}` : undefined)}
                />
              </Card>
            </div>
            <MonthlyCard />
            <p className="text-[11px] text-fg-subtle">{t("limits.tokensHint")}</p>
          </>
        )}
        <Card className="px-pad">
          <AccountsSection accounts={accounts} reload={load} />
        </Card>
      </div>
    </>
  );
}
