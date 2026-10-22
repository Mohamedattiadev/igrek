import type { CommandRisk, DeployRecord, RemoteRun, ServerInfo, ServerTag } from "@igrek/core";
import { ArrowLeft, Bot, Download, Plus, RefreshCw, Rocket, Server, SquareTerminal, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { RemoteFiles } from "../components/RemoteFiles";
import { RiskBadge } from "../components/RiskBadge";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { deferDelete, usePendingDeletes } from "../lib/undo";
import { PersonaChatDialog } from "./PersonaDetail";

const TAGS: ServerTag[] = ["prod", "staging", "test", "other"];

function useServers() {
  const [servers, setServers] = useState<ServerInfo[]>();
  const load = () => {
    api
      .servers()
      .then(setServers)
      .catch(() => setServers([]));
  };
  useEffect(load, []);
  useServerEvent("servers-changed", load);
  return servers;
}

function Meter({ label, percent }: { label: string; percent?: number }) {
  if (percent === undefined || Number.isNaN(percent)) return null;
  const tone = percent >= 90 ? "bg-danger" : percent >= 75 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-fg-subtle">
        <span>{label}</span>
        <span className="font-mono">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const health = server.health;
  return (
    <Link
      to={`/servers/${server.id}`}
      data-nav-item
      className="block space-y-3 rounded-ui border border-border bg-bg p-pad hover:border-border-strong hover:bg-bg-subtle"
    >
      <div className="flex items-center gap-2">
        <StatusDot tone={!health ? "neutral" : health.ok ? "success" : "danger"} />
        <h3 className="flex-1 truncate text-[14px] font-semibold">{server.name}</h3>
        <Badge tone={server.tag === "prod" ? "danger" : "neutral"}>{t(`servers.tag_${server.tag}`)}</Badge>
      </div>
      <p className="truncate font-mono text-[11px] text-fg-subtle">{server.target}</p>
      {health?.ok ? (
        <div className="grid grid-cols-2 gap-3">
          <Meter label={t("servers.disk")} percent={health.diskPercent} />
          <Meter label={t("servers.memory")} percent={health.memPercent} />
        </div>
      ) : health ? (
        <p className="line-clamp-2 text-xs text-danger">
          {t("servers.unreachable")}: {health.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-[11px] text-fg-subtle">
        {health?.containers && health.containers.length > 0 && (
          <Badge>
            {t("servers.containers")}: {health.containers.length}
          </Badge>
        )}
        {health?.failedUnits && health.failedUnits.length > 0 && (
          <Badge tone="danger">
            {t("servers.failed")}: {health.failedUnits.length}
          </Badge>
        )}
        {health && <span className="ms-auto">{t("servers.lastCheck", { when: relativeTime(health.checkedAt) })}</span>}
      </div>
    </Link>
  );
}

function AddServer({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", port: "", tag: "other" as ServerTag });
  const [hosts, setHosts] = useState<{ alias: string; hostname?: string; user?: string }[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open)
      api
        .sshConfigHosts()
        .then(setHosts)
        .catch(() => setHosts([]));
  }, [open]);
  const save = async () => {
    setError(undefined);
    try {
      await api.addServer({
        name: form.name,
        target: form.target,
        port: form.port ? Number(form.port) : undefined,
        tag: form.tag,
      });
      setOpen(false);
      setForm({ name: "", target: "", port: "", tag: "other" });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";
  return (
    <>
      <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
        {t("servers.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("servers.add")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("servers.add")}</h2>
          {hosts.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[11px] text-fg-subtle">
                <Download size={11} />
                {t("servers.import")}
              </p>
              <div className="flex flex-wrap gap-1">
                {hosts.map((h) => (
                  <button
                    key={h.alias}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, name: h.alias, target: h.alias }))}
                    className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] hover:border-accent"
                  >
                    {h.alias}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            className={field}
            placeholder={t("servers.name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div>
            <input
              className={cn(field, "font-mono")}
              placeholder="deploy@195.2.10.4"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-fg-subtle">{t("servers.targetHint")}</p>
          </div>
          <div className="flex gap-2">
            <input
              className={cn(field, "w-24")}
              placeholder={t("servers.port")}
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, "") })}
            />
            <Segmented
              value={form.tag}
              onChange={(tag) => setForm({ ...form, tag })}
              options={TAGS.map((tag) => ({ value: tag, label: t(`servers.tag_${tag}`) }))}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("memory.cancel")}
            </Button>
            <Button variant="primary" disabled={!form.target.trim()} onClick={save}>
              {t("project.save")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function ServersPage() {
  const { t } = useTranslation();
  const { isPending } = usePendingDeletes();
  const servers = useServers();
  return (
    <>
      <PageHeader back={false} title={t("servers.title")} actions={<AddServer onDone={() => undefined} />} />
      {servers && servers.length === 0 ? (
        <EmptyState icon={Server} title={t("servers.empty")} body={t("servers.emptyBody")} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 p-6">
          {servers
            ?.filter((s) => !isPending(`server-${s.id}`))
            .map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
        </div>
      )}
    </>
  );
}

function RunBox({ server, onRan }: { server: ServerInfo; onRan: (run: RemoteRun) => void }) {
  const { t } = useTranslation();
  const [command, setCommand] = useState("");
  const [risk, setRisk] = useState<CommandRisk>("read");
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (command.trim())
        api
          .classify(command)
          .then((r) => setRisk(r.risk))
          .catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [command]);

  const execute = async (confirmations: number) => {
    setBusy(true);
    setError(undefined);
    try {
      onRan(await api.runOnServer(server.id, command.trim(), confirmations));
      setConfirming(false);
      setTypedName("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = () => (risk === "read" ? execute(0) : setConfirming(true));

  return (
    <Card className="space-y-2 p-pad">
      <div className="flex gap-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && command.trim() && start()}
          placeholder={t("servers.runPlaceholder")}
          className="h-9 min-w-0 flex-1 rounded-ui border border-border bg-bg px-3 font-mono text-[12.5px] outline-none focus:border-accent"
        />
        <Button variant="primary" disabled={!command.trim() || busy} onClick={start}>
          {t("servers.run")}
        </Button>
      </div>
      {command.trim() && (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <RiskBadge risk={risk} />
          {t(`servers.riskHint_${risk}`)}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        label={t("servers.confirmTitle", { name: server.name })}
      >
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("servers.confirmTitle", { name: server.name })}</h2>
          {server.tag === "prod" && <p className="text-xs font-medium text-danger">{t("servers.confirmProd")}</p>}
          <pre className="overflow-x-auto rounded-md bg-bg-subtle p-2.5 font-mono text-[12px]">{command}</pre>
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <RiskBadge risk={risk} />
            {t(`servers.riskHint_${risk}`)}
          </p>
          {risk === "danger" && (
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={t("servers.confirmDanger")}
              className="h-9 w-full rounded-ui border border-danger bg-bg px-3 text-[13px] outline-none"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("memory.cancel")}
            </Button>
            <Button
              variant={risk === "danger" ? "danger" : "primary"}
              disabled={busy || (risk === "danger" && typedName.trim() !== server.name)}
              onClick={() => execute(risk === "danger" ? 2 : 1)}
            >
              {t("servers.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/** Last deploys that went to this server (plan.md 2.5). */
function ServerDeploys({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [deploys, setDeploys] = useState<DeployRecord[]>([]);
  useEffect(() => {
    api
      .serverDeploys(serverId)
      .then(setDeploys)
      .catch(() => undefined);
  }, [serverId]);
  if (!deploys.length) return null;
  return (
    <Card className="p-pad">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        <Rocket size={12} aria-hidden="true" /> {t("deploy.lastDeploys")}
      </h3>
      <ul className="space-y-1">
        {deploys.slice(0, 5).map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-xs">
            <StatusDot tone={d.exitCode === 0 ? "success" : "danger"} />
            <Link to={`/p/${d.projectId}?tab=environments`} className="font-mono hover:text-accent">
              {d.fromHead} → {d.toHead}
            </Link>
            <span className="ms-auto text-[11px] text-fg-subtle">{relativeTime(d.at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "Ask DevOps" (plan.md 2.5): a chat with the DevOps persona about this server, its state in the draft. */
function AskDevOps({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => {
    api
      .serverDeploys(server.id)
      .then((d) => setProjects([...new Set(d.map((x) => x.projectId))]))
      .catch(() => undefined);
  }, [server.id]);
  const h = server.health;
  const state = !h
    ? t("servers.askNoHealth")
    : h.ok
      ? t("servers.askHealth", {
          disk: h.diskPercent ?? "?",
          mem: h.memPercent ?? "?",
          failed: h.failedUnits?.join(", ") || "-",
        })
      : t("servers.askDown", { error: h.error ?? "" });
  const draft = t("servers.askDraft", { name: server.name, target: server.target, tag: server.tag, state });
  return (
    <>
      <Button size="sm" variant="ghost" icon={Rocket} onClick={() => setOpen(true)}>
        {t("servers.askDevOps")}
      </Button>
      <PersonaChatDialog personaId="devops" open={open} onClose={() => setOpen(false)} draft={draft} first={projects} />
    </>
  );
}

export function ServerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { serverId = "" } = useParams();
  const servers = useServers();
  const server = servers?.find((s) => s.id === serverId);
  const [audit, setAudit] = useState<RemoteRun[]>([]);
  const [selected, setSelected] = useState<RemoteRun>();
  const [checking, setChecking] = useState(false);

  const loadAudit = () => {
    api
      .serverAudit(serverId)
      .then(setAudit)
      .catch(() => undefined);
  };
  useEffect(loadAudit, [serverId]);

  if (!server) return <EmptyState icon={Server} title={t("servers.title")} body="…" />;
  const health = server.health;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
        <BackLink to="/servers" className="text-fg-subtle hover:text-fg" aria-label={t("servers.title")}>
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </BackLink>
        <StatusDot tone={!health ? "neutral" : health.ok ? "success" : "danger"} />
        <h1 className="text-[15px] font-semibold">{server.name}</h1>
        <Badge tone={server.tag === "prod" ? "danger" : "neutral"}>{t(`servers.tag_${server.tag}`)}</Badge>
        <span className="font-mono text-[11px] text-fg-subtle">{server.target}</span>
        <div className="flex-1" />
        <AskDevOps server={server} />
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await api.checkServer(server.id).catch(() => undefined);
            setChecking(false);
          }}
        >
          {checking ? t("servers.checking") : t("servers.check")}
        </Button>
        <Button
          size="sm"
          icon={SquareTerminal}
          onClick={async () => navigate(`/t/${(await api.sshTerminal(server.id)).id}`)}
        >
          {t("servers.openShell")}
        </Button>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <RunBox
            server={server}
            onRan={(run) => {
              setSelected(run);
              loadAudit();
            }}
          />
          {selected && (
            <Card>
              <div className="flex items-center gap-2 border-b border-border px-pad py-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-fg-subtle">{t("servers.output")}</span>
                <RiskBadge risk={selected.risk} />
                <Badge tone={selected.exitCode === 0 ? "success" : "danger"}>exit {selected.exitCode}</Badge>
                <span className="ms-auto font-mono text-fg-subtle">{selected.durationMs} ms</span>
              </div>
              <pre className="max-h-[50vh] overflow-auto p-pad font-mono text-[12px] leading-relaxed">
                {selected.output || "—"}
              </pre>
            </Card>
          )}
          <RemoteFiles serverId={server.id} />
          <Card>
            <h3 className="border-b border-border px-pad py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {t("servers.audit")}
            </h3>
            <ul className="divide-y divide-border">
              {audit.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    data-nav-item
                    onClick={() => setSelected(run)}
                    className="flex w-full items-center gap-2 px-pad py-2 text-start hover:bg-bg-hover"
                  >
                    {run.actor === "agent" ? (
                      <Bot size={13} className="text-accent" />
                    ) : (
                      <User size={13} className="text-fg-subtle" />
                    )}
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{run.command}</code>
                    <RiskBadge risk={run.risk} />
                    <Badge tone={run.exitCode === 0 ? "success" : run.exitCode === undefined ? "neutral" : "danger"}>
                      {run.exitCode ?? "…"}
                    </Badge>
                    <span className="w-20 text-end text-[11px] text-fg-subtle">{relativeTime(run.startedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <ServerDeploys serverId={server.id} />
          <Card className="space-y-3 p-pad text-[13px]">
            {health?.ok ? (
              <>
                <Meter label={t("servers.disk")} percent={health.diskPercent} />
                <Meter label={t("servers.memory")} percent={health.memPercent} />
                {health.uptime && (
                  <p className="text-xs text-fg-muted">
                    {t("servers.uptime")}: {health.uptime}
                  </p>
                )}
                {health.load && (
                  <p className="font-mono text-xs text-fg-muted">
                    {t("servers.load")}: {health.load}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-danger">{health ? `${t("servers.unreachable")}: ${health.error}` : "…"}</p>
                {health?.error && /host key|known_hosts/i.test(health.error) && (
                  <p className="text-xs text-fg-muted">{t("servers.hostKey")}</p>
                )}
              </div>
            )}
          </Card>
          {health?.containers && health.containers.length > 0 && (
            <Card className="p-pad">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t("servers.containers")}
              </h3>
              <ul className="space-y-1">
                {health.containers.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-xs">
                    <StatusDot tone={c.status.startsWith("Up") ? "success" : "danger"} />
                    <span className="min-w-0 flex-1 truncate font-mono">{c.name}</span>
                    <span className="text-[11px] text-fg-subtle">{c.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {health?.failedUnits && health.failedUnits.length > 0 && (
            <Card className="border-danger p-pad">
              <h3 className="mb-2 text-xs font-semibold text-danger">{t("servers.failed")}</h3>
              {health.failedUnits.map((u) => (
                <p key={u} className="font-mono text-xs">
                  {u}
                </p>
              ))}
            </Card>
          )}
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={() => {
              deferDelete(`server-${server.id}`, server.name, () => api.removeServer(server.id));
              void navigate("/servers");
            }}
          >
            {t("servers.remove")}
          </Button>
        </div>
      </div>
    </>
  );
}
