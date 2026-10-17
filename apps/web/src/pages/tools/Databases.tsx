import type { DbConnection, DbResult, DbSuggestion, DbTable } from "@godeye/core";
import { ChevronLeft, ChevronRight, Database, Lock, LockOpen, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mermaid } from "../../components/Mermaid";
import { Badge, Button, Card, Dialog, EmptyState, Segmented } from "../../components/ui";
import { cn } from "../../lib/cn";
import { dataApi } from "../../lib/ops-api";
import { PersonaChatDialog } from "../PersonaDetail";
import { useProjects } from "../Personas";
import { field } from "./Uptime";

function ResultGrid({ result }: { result: DbResult }) {
  const { t } = useTranslation();
  if (!result.columns.length)
    return (
      <p className="text-xs text-fg-muted">
        {result.changed !== undefined ? t("db.changed", { count: result.changed }) : t("db.noRows")} · {result.ms} ms
      </p>
    );
  return (
    <div className="space-y-1">
      <div className="max-h-[28rem] overflow-auto rounded-ui border border-border">
        <table className="min-w-full text-[12px]">
          <thead className="sticky top-0 bg-bg-subtle">
            <tr>
              {result.columns.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap border-b border-border px-2 py-1 text-start font-mono font-medium"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: result rows have no identity
              <tr key={i} className="odd:bg-bg even:bg-bg-subtle/40">
                {row.map((v, j) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    key={j}
                    className={cn(
                      "max-w-80 truncate whitespace-nowrap px-2 py-0.5 font-mono",
                      v === null && "text-fg-subtle",
                    )}
                    title={v === null ? undefined : String(v)}
                  >
                    {v === null ? "NULL" : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-subtle">
        {t("db.rows", { count: result.rows.length })}
        {result.truncated && ` · ${t("db.truncated")}`} · {result.ms} ms
      </p>
    </div>
  );
}

function AddDatabase({ onAdded }: { onAdded: (c: DbConnection) => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [suggestions, setSuggestions] = useState<DbSuggestion[]>([]);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [prod, setProd] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSuggestions([]);
    if (projectId)
      dataApi
        .suggestions(projectId)
        .then(setSuggestions)
        .catch(() => undefined);
  }, [projectId]);
  const add = async (from?: DbSuggestion["source"]) => {
    setBusy(true);
    setError(undefined);
    try {
      const conn = await dataApi.addDatabase({
        name: name || undefined,
        address: from ? undefined : address,
        projectId: projectId || undefined,
        prod,
        from,
      });
      if (!conn.test.ok) setError(t("db.addedButFailed", { error: conn.test.error }));
      else setOpen(false);
      setAddress("");
      setName("");
      onAdded(conn);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>
        {t("db.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("db.add")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("db.add")}</h2>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={cn(field, "w-full")}
            aria-label={t("suite.project")}
          >
            <option value="">{t("suite.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-fg-muted">{t("db.found")}</p>
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy}
                  onClick={() => void add(s.source)}
                  className="flex w-full items-center gap-2 rounded-ui border border-border px-2.5 py-1.5 text-start text-[13px] hover:bg-bg-hover"
                >
                  <Badge>{s.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.label}</span>
                  <Plus size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="postgres://user:password@host:5432/db"
            aria-label={t("db.address")}
            className={cn(field, "w-full font-mono")}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("db.name")}
            aria-label={t("db.name")}
            className={cn(field, "w-full")}
          />
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={prod} onChange={(e) => setProd(e.target.checked)} className="mt-0.5" />
            <span>
              {t("db.prod")}
              <span className="block text-xs text-fg-muted">{t("db.prodHint")}</span>
            </span>
          </label>
          <p className="text-xs text-fg-subtle">{t("db.privacy")}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("persona.cancel")}
            </Button>
            <Button variant="primary" disabled={!address.trim() || busy} onClick={() => void add()}>
              {t("db.connect")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function TableRows({ conn, table }: { conn: DbConnection; table: DbTable }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<DbResult>();
  const [error, setError] = useState<string>();
  const { t } = useTranslation();
  useEffect(() => {
    setError(undefined);
    dataApi
      .rows(conn.id, table.name, table.schema, page)
      .then(setResult)
      .catch((err: Error) => setError(err.message));
  }, [conn.id, table.name, table.schema, page]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">
          {table.schema ? `${table.schema}.` : ""}
          {table.name}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronLeft}
          disabled={page === 0}
          aria-label={t("db.prev")}
          onClick={() => setPage(page - 1)}
        />
        <span className="text-xs text-fg-muted">{t("db.page", { page: page + 1 })}</span>
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronRight}
          disabled={(result?.rows.length ?? 0) < 50}
          aria-label={t("db.next")}
          onClick={() => setPage(page + 1)}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && <ResultGrid result={result} />}
      <details className="text-xs">
        <summary className="cursor-pointer text-fg-muted">{t("db.columns", { count: table.columns.length })}</summary>
        <ul className="mt-1 space-y-0.5 font-mono">
          {table.columns.map((c) => (
            <li key={c.name}>
              {c.name} <span className="text-fg-subtle">{c.type}</span>
              {c.primary && <span className="ms-1 text-accent">PK</span>}
              {c.references && <span className="ms-1 text-fg-muted">→ {c.references}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function QueryEditor({ conn }: { conn: DbConnection }) {
  const { t } = useTranslation();
  const [text, setText] = useState(
    conn.kind === "mongodb" ? '{"find": "users", "filter": {}, "limit": 20}' : "select * from ",
  );
  const [result, setResult] = useState<DbResult>();
  const [error, setError] = useState<{ message: string; code?: string }>();
  const [busy, setBusy] = useState(false);
  const [expert, setExpert] = useState<string>();
  const run = async (allowWrite = false) => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await dataApi.query(conn.id, text, allowWrite));
    } catch (err) {
      const e = err as Error & { code?: string };
      setError({ message: e.message, code: e.code });
    } finally {
      setBusy(false);
    }
  };
  const ask = async () => {
    const d = await dataApi.explainDraft(conn.id, text);
    setExpert(
      t("db.askDraft", {
        kind: d.kind,
        prod: d.prod ? t("db.isProd") : "",
        query: d.query,
        schema: d.schema || "-",
        plan: d.plan || "-",
      }),
    );
  };
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void run();
          }
        }}
        spellCheck={false}
        rows={6}
        aria-label={t("db.query")}
        className="w-full rounded-ui border border-border bg-bg p-2 font-mono text-[12.5px] outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Play} disabled={busy || !text.trim()} onClick={() => void run()}>
          {busy ? t("db.running") : t("db.run")}
        </Button>
        <span className="text-[11px] text-fg-subtle">Ctrl+Enter</span>
        <div className="flex-1" />
        {conn.kind !== "mongodb" && (
          <Button
            variant="ghost"
            icon={Sparkles}
            disabled={!text.trim()}
            onClick={() => void ask()}
            data-tip={t("db.askTip")}
          >
            {t("db.ask")}
          </Button>
        )}
      </div>
      {error?.code === "confirm" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-warning bg-warning-soft/40 p-2 text-xs">
          <span className="min-w-0 flex-1">{t("db.confirmWrite")}</span>
          <Button size="sm" variant="danger" onClick={() => void run(true)}>
            {t("db.runAnyway")}
          </Button>
        </div>
      ) : error ? (
        <p className={cn("text-xs", error.code === "read_only" ? "text-warning" : "text-danger")}>
          {error.code === "read_only" ? t("db.readOnlyRefused") : error.message}
        </p>
      ) : null}
      {result && <ResultGrid result={result} />}
      <PersonaChatDialog
        personaId="database"
        open={expert !== undefined}
        onClose={() => setExpert(undefined)}
        draft={expert}
        first={conn.projectId ? [conn.projectId] : []}
      />
    </div>
  );
}

function ConnectionView({ conn, onChange }: { conn: DbConnection; onChange: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<"tables" | "query" | "diagram">("tables");
  const [tables, setTables] = useState<DbTable[]>();
  const [table, setTable] = useState<DbTable>();
  const [diagram, setDiagram] = useState<string>();
  const [status, setStatus] = useState<{ ok: boolean; version?: string; error?: string }>();
  const [unlock, setUnlock] = useState(false);
  useEffect(() => {
    setTables(undefined);
    setTable(undefined);
    setDiagram(undefined);
    setStatus(undefined);
    dataApi
      .testDatabase(conn.id)
      .then((s) => {
        setStatus(s);
        if (s.ok)
          dataApi
            .tables(conn.id)
            .then((list) => {
              setTables(list);
              setTable(list[0]);
            })
            .catch((err: Error) => setStatus({ ok: false, error: err.message }));
      })
      .catch(() => undefined);
  }, [conn.id]);
  useEffect(() => {
    if (view === "diagram" && diagram === undefined)
      dataApi
        .diagram(conn.id)
        .then((d) => setDiagram(d.mermaid))
        .catch(() => setDiagram(""));
  }, [view, diagram, conn.id]);
  const setReadOnly = async (readOnly: boolean) => {
    await dataApi.updateDatabase(conn.id, { readOnly });
    setUnlock(false);
    onChange();
  };
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 truncate text-[14px] font-semibold">{conn.name}</h2>
        <Badge>{conn.kind}</Badge>
        {conn.prod && <Badge tone="danger">prod</Badge>}
        {status &&
          (status.ok ? (
            <span className="text-xs text-fg-muted">{status.version}</span>
          ) : (
            <span className="text-xs text-danger">{status.error}</span>
          ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={conn.readOnly ? Lock : LockOpen}
          onClick={() => (conn.readOnly ? setUnlock(true) : void setReadOnly(true))}
          data-tip={conn.readOnly ? t("db.readOnlyTip") : t("db.writableTip")}
        >
          {conn.readOnly ? t("db.readOnly") : t("db.writable")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("db.remove")}
          onClick={() => void dataApi.removeDatabase(conn.id).then(onChange)}
        />
      </div>
      <p className="truncate font-mono text-[11px] text-fg-subtle">{conn.display}</p>
      {unlock && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-danger bg-danger-soft/30 p-2 text-xs">
          <span className="min-w-0 flex-1">{conn.prod ? t("db.unlockProd") : t("db.unlock")}</span>
          <Button size="sm" variant="danger" onClick={() => void setReadOnly(false)}>
            {t("db.allowWrites")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setUnlock(false)}>
            {t("persona.cancel")}
          </Button>
        </div>
      )}
      <Segmented
        label={conn.name}
        value={view}
        onChange={setView}
        options={[
          { value: "tables", label: conn.kind === "mongodb" ? t("db.collections") : t("db.tables") },
          { value: "query", label: t("db.query") },
          { value: "diagram", label: t("db.diagram") },
        ]}
      />
      {view === "tables" ? (
        <div className="flex flex-col gap-3 md:flex-row">
          <ul className="max-h-[32rem] shrink-0 overflow-auto rounded-ui border border-border md:w-56">
            {(tables ?? []).map((tb) => (
              <li key={`${tb.schema ?? ""}.${tb.name}`}>
                <button
                  type="button"
                  onClick={() => setTable(tb)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1 text-start text-[12.5px] hover:bg-bg-hover",
                    table?.name === tb.name && table.schema === tb.schema && "bg-bg-active font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono">{tb.name}</span>
                  {tb.kind === "view" && <span className="text-[10px] text-fg-subtle">view</span>}
                  {tb.rows !== undefined && <span className="text-[11px] text-fg-subtle">{tb.rows}</span>}
                </button>
              </li>
            ))}
            {tables && !tables.length && <li className="p-3 text-xs text-fg-subtle">{t("db.noTables")}</li>}
          </ul>
          <div className="min-w-0 flex-1">{table && <TableRows conn={conn} table={table} />}</div>
        </div>
      ) : view === "query" ? (
        <QueryEditor conn={conn} />
      ) : diagram ? (
        <Card className="p-3">
          <Mermaid code={diagram} />
        </Card>
      ) : (
        <p className="text-xs text-fg-subtle">{diagram === "" ? t("db.noDiagram") : t("db.loading")}</p>
      )}
    </div>
  );
}

/** Database explorer (plan.md 12). */
export function DatabasesTab() {
  const { t } = useTranslation();
  const [list, setList] = useState<DbConnection[]>();
  const [selected, setSelected] = useState<string>();
  const load = () =>
    void dataApi
      .databases()
      .then((l) => {
        setList(l);
        setSelected((s) => (s && l.some((c) => c.id === s) ? s : l[0]?.id));
      })
      .catch(() => undefined);
  useEffect(load, []);
  const conn = list?.find((c) => c.id === selected);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("db.intro")}</p>
        <AddDatabase
          onAdded={(c) => {
            setSelected(c.id);
            load();
          }}
        />
      </div>
      {list && !list.length ? (
        <EmptyState icon={Database} title={t("db.emptyTitle")} body={t("db.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <ul className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col">
            {(list ?? []).map((c) => (
              <li key={c.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-ui px-2.5 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                    c.id === selected && "bg-bg-active font-medium",
                  )}
                >
                  <Database size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.prod && <span className="text-[10px] font-semibold text-danger">PROD</span>}
                  {c.readOnly && <Lock size={12} className="text-fg-subtle" aria-label={t("db.readOnly")} />}
                </button>
              </li>
            ))}
          </ul>
          {conn && <ConnectionView key={conn.id} conn={conn} onChange={load} />}
        </div>
      )}
    </div>
  );
}
