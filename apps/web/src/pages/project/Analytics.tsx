import type { AnalyticsSummary, DbConnection, DbTable } from "@godeye/core";
import { ArrowDownRight, ArrowUpRight, BarChart3, Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../components/ui";
import { cn } from "../../lib/cn";
import { analyticsApi, dataApi } from "../../lib/ops-api";
import { PersonaChatDialog } from "../PersonaDetail";
import { field } from "../tools/Uptime";

function Change({ now, before }: { now: number; before: number }) {
  const { t } = useTranslation();
  if (!before && !now) return null;
  const pct = before ? Math.round(((now - before) / before) * 100) : 100;
  const up = now >= before;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center text-[11px]", up ? "text-success" : "text-danger")}>
      <Icon size={12} aria-hidden="true" />
      {before ? `${pct > 0 ? "+" : ""}${pct}%` : t("analytics.isNew")}
    </span>
  );
}

function SourceForm({
  projectId,
  current,
  onSaved,
}: {
  projectId: string;
  current?: AnalyticsSummary["source"];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [conns, setConns] = useState<DbConnection[]>([]);
  const [connectionId, setConnectionId] = useState(current?.connectionId ?? "");
  const [tables, setTables] = useState<DbTable[]>([]);
  const [table, setTable] = useState(current?.table ?? "");
  const [column, setColumn] = useState(current?.createdColumn ?? "");
  const [error, setError] = useState<string>();
  useEffect(() => {
    dataApi
      .databases()
      .then((l) => {
        const mine = l.filter((c) => !c.projectId || c.projectId === projectId);
        setConns(mine);
        setConnectionId((id) => id || mine.find((c) => c.projectId === projectId)?.id || mine[0]?.id || "");
      })
      .catch(() => undefined);
  }, [projectId]);
  useEffect(() => {
    if (connectionId)
      dataApi
        .tables(connectionId)
        .then((list) => {
          setTables(list.filter((x) => x.kind === "table"));
          const users = list.find((x) => /^(users?|accounts?|members?|customers?)$/i.test(x.name));
          setTable((tb) => tb || users?.name || "");
        })
        .catch((e: Error) => setError(e.message));
  }, [connectionId]);
  const columns = tables.find((x) => x.name === table)?.columns ?? [];
  useEffect(() => {
    if (!column && columns.length)
      setColumn(
        columns.find((c) => /^(created_?at|createdAt|date_joined|signup_?at|inserted_at)$/i.test(c.name))?.name ?? "",
      );
  }, [columns, column]);
  if (!conns.length) return <p className="text-xs text-fg-subtle">{t("analytics.noDb")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={connectionId}
        onChange={(e) => setConnectionId(e.target.value)}
        className={field}
        aria-label={t("analytics.db")}
      >
        {conns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={table}
        onChange={(e) => {
          setTable(e.target.value);
          setColumn("");
        }}
        className={field}
        aria-label={t("analytics.table")}
      >
        <option value="">{t("analytics.table")}</option>
        {tables.map((x) => (
          <option key={x.name}>{x.name}</option>
        ))}
      </select>
      <select
        value={column}
        onChange={(e) => setColumn(e.target.value)}
        className={field}
        aria-label={t("analytics.column")}
      >
        <option value="">{t("analytics.column")}</option>
        {columns.map((c) => (
          <option key={c.name}>{c.name}</option>
        ))}
      </select>
      <Button
        size="sm"
        variant="primary"
        disabled={!connectionId || !table || !column}
        onClick={async () => {
          try {
            await analyticsApi.setSource(projectId, { connectionId, table, createdColumn: column });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {t("analytics.useIt")}
      </Button>
      {error && <p className="basis-full text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Product numbers for the PM (plan.md 12): users, how many come back, what they use. */
export function AnalyticsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [s, setS] = useState<AnalyticsSummary & { draft: string }>();
  const [setup, setSetup] = useState(false);
  const [ask, setAsk] = useState(false);
  const load = useCallback(
    () =>
      void analyticsApi
        .summary(projectId)
        .then(setS)
        .catch(() => undefined),
    [projectId],
  );
  useEffect(load, [load]);
  if (!s) return null;
  const empty = !s.users && !s.active && !s.events.length;
  const maxDaily = Math.max(1, ...(s.active?.daily.map((d) => d.users) ?? [1]));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{t("analytics.title")}</h2>
        <Button variant="ghost" icon={Settings2} onClick={() => setSetup(!setup)}>
          {t("analytics.signups")}
        </Button>
        {!empty && (
          <Button variant="ghost" icon={Sparkles} onClick={() => setAsk(true)} data-tip={t("analytics.askTip")}>
            {t("analytics.ask")}
          </Button>
        )}
      </div>
      {(setup || empty) && (
        <Card className="space-y-2 p-pad">
          <p className="text-xs text-fg-muted">{empty ? t("analytics.emptyBody") : t("analytics.signupsHint")}</p>
          <SourceForm
            projectId={projectId}
            current={s.source}
            onSaved={() => {
              setSetup(false);
              load();
            }}
          />
        </Card>
      )}
      {!empty && (
        <div className="grid gap-3 md:grid-cols-3">
          {s.users && (
            <Card className="space-y-1 p-pad">
              <p className="text-xs text-fg-muted">{t("analytics.users")}</p>
              {s.users.error ? (
                <p className="text-xs text-danger">{s.users.error}</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold">{s.users.total.toLocaleString()}</p>
                  <p className="text-xs">
                    {t("analytics.new7", { count: s.users.last7 })}{" "}
                    <Change now={s.users.last7} before={s.users.previous7} />
                  </p>
                  <div className="flex h-10 items-end gap-1 pt-1">
                    {s.users.weekly.map((w) => (
                      <div
                        key={w.week}
                        data-tip={`${w.week}: ${w.count}`}
                        className="flex-1 rounded-t bg-accent/60"
                        style={{
                          height: `${Math.max(6, (w.count / Math.max(1, ...(s.users?.weekly ?? []).map((x) => x.count))) * 100)}%`,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}
          {s.active && (
            <Card className="space-y-1 p-pad">
              <p className="text-xs text-fg-muted">{t("analytics.active")}</p>
              <p className="text-[13px]">
                <span className="text-2xl font-semibold">{s.active.week}</span>{" "}
                <span className="text-xs text-fg-muted">{t("analytics.week")}</span>
              </p>
              <p className="text-xs text-fg-muted">
                {t("analytics.dayMonth", { day: s.active.day, month: s.active.month })}
              </p>
              <div className="flex h-10 items-end gap-px pt-1">
                {s.active.daily.map((d) => (
                  <div
                    key={d.day}
                    data-tip={`${d.day}: ${d.users}`}
                    className="flex-1 rounded-t bg-success/60"
                    style={{ height: `${Math.max(6, (d.users / maxDaily) * 100)}%` }}
                  />
                ))}
              </div>
            </Card>
          )}
          {s.events.length > 0 && (
            <Card className="space-y-1 p-pad md:col-span-1">
              <p className="text-xs text-fg-muted">{t("analytics.features")}</p>
              <ul className="space-y-0.5 text-[12.5px]">
                {s.events.slice(0, 8).map((e) => (
                  <li key={e.event} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono">{e.event}</span>
                    <span>{e.last7}</span>
                    <Change now={e.last7} before={e.previous7} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {!empty && !s.active && !s.events.length && (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <BarChart3 size={13} aria-hidden="true" />
          {t("analytics.noEvents")}
        </p>
      )}
      <PersonaChatDialog
        personaId="product-manager"
        open={ask}
        onClose={() => setAsk(false)}
        draft={`${s.draft}\n\n${t("analytics.askDraft")}`}
        first={[projectId]}
      />
    </section>
  );
}
