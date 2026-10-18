import type { LogLine, LogSource, ServerInfo } from "@igrek/core";
import { Plus, RefreshCw, ScrollText, Search, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Badge, Button, Card, EmptyState, field, Segmented } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useProjects } from "../../lib/live";
import { type LogResult, opsApi, type SavedLogSource } from "../../lib/ops-api";

const LEVEL_CLASS: Record<LogLine["level"], string> = { error: "text-danger", warn: "text-warning", info: "" };
const ERROR_LINE = /\b(error|fatal|panic|exception|traceback|failed)\b|\b[A-Z][a-zA-Z]*(Error|Exception)\b/i;
const WARN_LINE = /\b(warn|warning|deprecated)\b/i;

/** Raw log text, colored by level, newest at the bottom. */
export function LogText({ text, onRefresh }: { text: string; onRefresh?: () => void }) {
  const { t } = useTranslation();
  const lines = text.split("\n").slice(-1500);
  return (
    <div className="relative">
      {onRefresh && (
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          aria-label={t("docker.refresh")}
          onClick={onRefresh}
          className="absolute end-2 top-2"
        />
      )}
      <pre className="max-h-96 overflow-auto rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11.5px] leading-relaxed">
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no identity
          <div key={i} className={ERROR_LINE.test(line) ? "text-danger" : WARN_LINE.test(line) ? "text-warning" : ""}>
            {line || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

function label(s: LogSource): string {
  if (s.label) return s.label;
  if (s.kind === "file") return s.path.split("/").slice(-2).join("/");
  if (s.kind === "docker") return `docker:${s.container}`;
  if (s.kind === "journal") return `journal:${s.unit}`;
  return s.terminalId;
}

function AddSource({ projectId, onAdded }: { projectId?: string; onAdded: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<"file" | "docker" | "journal">("docker");
  const [value, setValue] = useState("");
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .servers()
      .then(setServers)
      .catch(() => undefined);
  }, []);
  const source = (): LogSource =>
    kind === "file"
      ? { kind, path: value.trim() }
      : kind === "docker"
        ? { kind, container: value.trim(), ...(serverId ? { serverId } : {}) }
        : { kind, unit: value.trim(), ...(serverId ? { serverId } : {}) };
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        try {
          await opsApi.addLogSource(source(), projectId);
          setValue("");
          onAdded();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className={field}
        aria-label={t("logs.kind")}
      >
        {(["docker", "journal", "file"] as const).map((k) => (
          <option key={k} value={k}>
            {t(`logs.kind_${k}`)}
          </option>
        ))}
      </select>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(`logs.placeholder_${kind}`)}
        aria-label={t(`logs.kind_${kind}`)}
        className={cn(field, "min-w-0 flex-1 basis-48 font-mono")}
      />
      {kind !== "file" && (
        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className={field}
          aria-label={t("docker.where")}
        >
          <option value="">{t("docker.local")}</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" icon={Plus} disabled={!value.trim()}>
        {t("logs.addSource")}
      </Button>
      {error && <p className="basis-full text-xs text-danger">{error}</p>}
    </form>
  );
}

/** Log center (plan.md 12): every log in one place, searched together, errors grouped. */
export function LogsPanel({ projectId }: { projectId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects();
  const [saved, setSaved] = useState<SavedLogSource[]>([]);
  const [suggested, setSuggested] = useState<LogSource[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const [result, setResult] = useState<LogResult>();
  const [busy, setBusy] = useState(false);
  const [fixProject, setFixProject] = useState(projectId ?? "");
  const [error, setError] = useState<string>();
  const loadSaved = () =>
    void opsApi
      .logSources(projectId)
      .then(setSaved)
      .catch(() => undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: per project
  useEffect(() => {
    loadSaved();
    if (projectId)
      opsApi
        .logSuggestions(projectId)
        .then(setSuggested)
        .catch(() => undefined);
  }, [projectId]);
  const active = saved.filter((s) => !off.has(s.id));
  const search = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await opsApi.searchLogs({
          sources: active.map((s) => s.source),
          query: query.trim() || undefined,
          level: level === "all" ? undefined : level,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fresh = suggested.filter(
    (s) =>
      !saved.some(
        (x) => JSON.stringify({ ...x.source, label: undefined }) === JSON.stringify({ ...s, label: undefined }),
      ),
  );
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">{t("logs.intro")}</p>
      <Card className="space-y-3 p-pad">
        <div className="flex flex-wrap items-center gap-1.5">
          {saved.map((s) => (
            <span
              key={s.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                off.has(s.id) ? "border-border text-fg-subtle line-through" : "border-accent bg-accent-soft",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setOff((prev) => new Set(prev.has(s.id) ? [...prev].filter((x) => x !== s.id) : [...prev, s.id]))
                }
                className="font-mono"
              >
                {label(s.source)}
              </button>
              <button
                type="button"
                aria-label={t("uptime.remove")}
                onClick={() => void opsApi.removeLogSource(s.id).then(loadSaved)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          {fresh.map((s) => (
            <button
              key={JSON.stringify(s)}
              type="button"
              onClick={() => void opsApi.addLogSource(s, projectId).then(loadSaved)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-xs text-fg-muted hover:bg-bg-hover"
            >
              <Plus size={12} aria-hidden="true" />
              {label(s)}
            </button>
          ))}
          {!saved.length && !fresh.length && <span className="text-xs text-fg-subtle">{t("logs.noSources")}</span>}
        </div>
        <AddSource projectId={projectId} onAdded={loadSaved} />
      </Card>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("logs.search")}
          aria-label={t("logs.search")}
          className={cn(field, "min-w-0 flex-1 basis-48")}
        />
        <Segmented
          label={t("logs.level")}
          value={level}
          onChange={setLevel}
          options={[
            { value: "all", label: t("logs.level_all") },
            { value: "warn", label: t("logs.level_warn") },
            { value: "error", label: t("logs.level_error") },
          ]}
        />
        <Button type="submit" variant="primary" icon={Search} disabled={!active.length || busy}>
          {busy ? t("logs.reading") : t("logs.read")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result?.failed.map((f) => (
        <p key={f.source} className="text-xs text-warning">
          {f.source}: {f.error}
        </p>
      ))}
      {!result && !saved.length ? (
        <EmptyState icon={ScrollText} title={t("logs.emptyTitle")} body={t("logs.emptyBody")} />
      ) : result ? (
        <>
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-[13px] font-semibold">
                {t("logs.groups", { count: result.groups.length })}
              </h2>
              {!projectId && result.groups.length > 0 && (
                <select
                  value={fixProject}
                  onChange={(e) => setFixProject(e.target.value)}
                  className={field}
                  aria-label={t("logs.fixIn")}
                >
                  <option value="">{t("logs.fixIn")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {result.groups.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {result.groups.slice(0, 30).map((g) => (
                    <li key={g.fingerprint} className="flex flex-wrap items-start gap-2 px-pad py-2">
                      <Badge tone={g.level === "error" ? "danger" : "warning"}>{g.count}x</Badge>
                      <div className="min-w-0 flex-1">
                        <pre
                          className={cn("whitespace-pre-wrap break-all font-mono text-[11.5px]", LEVEL_CLASS[g.level])}
                        >
                          {g.sample.split("\n").slice(0, 4).join("\n")}
                        </pre>
                        <p className="text-[11px] text-fg-subtle">
                          {g.sources.join(", ")}
                          {g.lastAt && ` · ${t("logs.last", { when: relativeTime(g.lastAt) })}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Wrench}
                        disabled={!fixProject}
                        data-tip={fixProject ? t("logs.fixTip") : t("logs.fixPick")}
                        onClick={async () => {
                          const { runId } = await opsApi.fixLogError({
                            projectId: fixProject,
                            sample: g.sample,
                            sources: g.sources,
                            count: g.count,
                          });
                          void navigate(`/runs/${runId}`);
                        }}
                      >
                        {t("logs.fix")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-xs text-fg-subtle">{t("logs.noGroups")}</p>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold">{t("logs.lines", { count: result.lines.length })}</h2>
            <pre className="max-h-[32rem] overflow-auto rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11.5px] leading-relaxed">
              {result.lines.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no identity
                <div key={i} className={LEVEL_CLASS[l.level]}>
                  {active.length > 1 && <span className="me-2 text-fg-subtle">{l.source}</span>}
                  {l.text}
                </div>
              ))}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}
