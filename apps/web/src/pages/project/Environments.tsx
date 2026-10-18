import type {
  DeployCheck,
  DeployRecord,
  EnvironmentInfo,
  EnvironmentState,
  ProjectDetail,
  ServerInfo,
} from "@igrek/core";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  FileCode2,
  GitCommitHorizontal,
  Info,
  Laptop,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button, Card, Dialog, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";

const field = "h-8 w-full rounded-ui border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent";

function CheckRow({ check }: { check: DeployCheck }) {
  const { t } = useTranslation();
  const Icon = check.level === "block" ? CircleAlert : check.level === "warn" ? TriangleAlert : Info;
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <Icon
        size={14}
        className={cn(
          "mt-0.5 shrink-0",
          check.level === "block" ? "text-danger" : check.level === "warn" ? "text-warning" : "text-fg-subtle",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        {t(`deploy.check_${check.id}`, { detail: check.detail })}
        {check.detail && !t(`deploy.check_${check.id}`).includes("{{") && (
          <span className="ms-1 font-mono text-[11px] text-fg-subtle">{check.detail}</span>
        )}
      </span>
    </li>
  );
}

function DeployDialog({ env, onClose }: { env?: EnvironmentInfo; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ state: EnvironmentState; checks: DeployCheck[] }>();
  const [error, setError] = useState<string>();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployRecord>();
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  useEffect(() => {
    if (!env) return;
    setBranch(env.branch);
    api
      .envBranches(env.id)
      .then(setBranches)
      .catch(() => setBranches([]));
    setData(undefined);
    setResult(undefined);
    setTyped("");
    setError(undefined);
    api
      .envChecks(env.id)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [env]);
  if (!env) return null;
  const blocked = data?.checks.some((c) => c.level === "block");
  const prod = /prod/i.test(env.name);
  const deploy = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Production needs the environment's name typed (two confirmations); others one.
      setResult(await api.deploy(env.id, prod ? 2 : 1, branch !== env.branch ? branch : undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!env} onClose={onClose} label={t("deploy.title")} wide>
      <div className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Rocket size={15} aria-hidden="true" /> {t("deploy.titleTo", { env: env.name, server: env.serverName })}
        </h2>
        {!data && !error && <p className="text-xs text-fg-muted">{t("deploy.checking")}</p>}
        {data && (
          <>
            <ul className="space-y-1.5">
              {data.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
              {!data.checks.length && (
                <li className="flex items-center gap-2 text-[13px] text-success">
                  <CheckCircle2 size={14} aria-hidden="true" /> {t("deploy.allClear")}
                </li>
              )}
            </ul>
            {branches.length > 1 && !result && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                {t("deploy.branch")}
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className={field}
                  aria-label={t("deploy.branch")}
                >
                  {[...new Set([env.branch, ...branches])].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
                {branch !== env.branch && (
                  <span className="text-warning">{t("deploy.preview", { branch: env.branch })}</span>
                )}
              </label>
            )}
            <div className="rounded-ui bg-bg-subtle p-2">
              <p className="text-[11px] text-fg-subtle">{t("deploy.willRun")}</p>
              <code className="block font-mono text-[11.5px] break-all">
                cd {env.path} && git fetch && git checkout {branch || env.branch} && git pull --ff-only
                {env.deployCommand ? ` && ${env.deployCommand}` : ""}
              </code>
            </div>
            {prod && !blocked && !result && (
              <label className="block space-y-1 text-xs text-fg-muted">
                {t("deploy.typeName", { env: env.name })}
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className={field}
                  aria-label={t("deploy.typeName", { env: env.name })}
                />
              </label>
            )}
          </>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {result && (
          <div className="space-y-1">
            <p
              className={cn(
                "flex items-center gap-2 text-[13px] font-medium",
                result.exitCode === 0 ? "text-success" : "text-danger",
              )}
            >
              {result.exitCode === 0 ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              {result.exitCode === 0
                ? t("deploy.done", { from: result.fromHead, to: result.toHead })
                : t("deploy.failed", { code: result.exitCode })}
            </p>
            <pre className="max-h-60 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11px] whitespace-pre-wrap">
              {result.output || "—"}
            </pre>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {result ? t("enhance.close") : t("memory.cancel")}
          </Button>
          {!result && (
            <Button
              variant="primary"
              icon={Rocket}
              disabled={!data || blocked || busy || (prod && typed !== env.name)}
              onClick={() => void deploy()}
            >
              {busy ? t("deploy.running") : t("deploy.go")}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function StagingDialog({
  env,
  open,
  onClose,
  onDone,
}: {
  env: EnvironmentInfo;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "staging",
    path: `${env.path.replace(/\/$/, "")}-staging`,
    branch: env.branch,
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} label={t("deploy.staging")}>
      <form
        className="space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await api.createStaging(env.id, { ...form, confirmations: 1 });
            onDone();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-[15px] font-semibold">{t("deploy.staging")}</h2>
        <p className="text-xs text-fg-muted">{t("deploy.stagingHint", { server: env.serverName })}</p>
        {(["name", "path", "branch"] as const).map((k) => (
          <label key={k} className="block space-y-1 text-xs text-fg-muted">
            {t(`deploy.staging_${k}`)}
            <input
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className={cn(field, "w-full font-mono")}
            />
          </label>
        ))}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("memory.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("deploy.running") : t("deploy.stagingCreate")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EnvCard({ env, onDeploy, onRemoved }: { env: EnvironmentInfo; onDeploy: () => void; onRemoved: () => void }) {
  const { t } = useTranslation();
  const [staging, setStaging] = useState(false);
  const [state, setState] = useState<EnvironmentState>();
  const [editing, setEditing] = useState<string>();
  const [workflow, setWorkflow] = useState<{ path: string; content: string; exists: boolean }>();
  const [note, setNote] = useState<string>();
  const load = () => {
    setState(undefined);
    api
      .envState(env.id)
      .then((r) => setState(r.state))
      .catch(() => setState({ reachable: false, error: t("deploy.unreachable"), checkedAt: Date.now() }));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load per environment
  useEffect(load, [env.id]);
  const prod = /prod/i.test(env.name);
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <Server size={16} className="text-fg-muted" aria-hidden="true" />
        <Badge tone={prod ? "danger" : "accent"}>{env.name}</Badge>
        <Link to={`/servers/${env.serverId}`} className="font-mono text-[12px] hover:text-accent">
          {env.serverName}:{env.path}
        </Link>
        <span className="text-[11px] text-fg-subtle">· {env.branch}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load} aria-label={t("deploy.refresh")} />
        {!/stag/i.test(env.name) && (
          <Button size="sm" variant="ghost" icon={Copy} onClick={() => setStaging(true)}>
            {t("deploy.staging")}
          </Button>
        )}
        <Button size="sm" variant="primary" icon={Rocket} onClick={onDeploy}>
          {t("deploy.go")}
        </Button>
        <StagingDialog env={env} open={staging} onClose={() => setStaging(false)} onDone={onRemoved} />
      </div>
      {!state && <p className="text-xs text-fg-muted">{t("deploy.checking")}</p>}
      {state && !state.reachable && <p className="text-xs text-danger">{state.error}</p>}
      {state?.reachable && (
        <div className="grid gap-2 text-[13px] sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <GitCommitHorizontal size={14} className="text-fg-subtle" aria-hidden="true" />
            <span className="font-mono">{state.head}</span>
            <span className="truncate text-fg-muted">{state.lastSubject}</span>
          </p>
          <p className="text-fg-muted">
            {state.ahead === undefined
              ? t("deploy.unknownCommit")
              : state.ahead === 0 && state.behind === 0
                ? t("deploy.inSync")
                : [
                    state.ahead ? t("deploy.serverBehind", { count: state.ahead }) : "",
                    state.behind ? t("deploy.serverAheadBy", { count: state.behind }) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </p>
          {!!state.dirty && (
            <p className="flex items-center gap-2 text-warning sm:col-span-2">
              <TriangleAlert size={14} aria-hidden="true" /> {t("deploy.dirty", { count: state.dirty })}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {editing === undefined ? (
          <>
            <span className="text-fg-subtle">{t("deploy.command")}:</span>
            <code className="font-mono text-[11.5px]">{env.deployCommand || t("deploy.pullOnly")}</code>
            <button type="button" className="text-accent hover:underline" onClick={() => setEditing(env.deployCommand)}>
              {t("deploy.edit")}
            </button>
          </>
        ) : (
          <>
            <input
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              placeholder="docker compose up -d --build"
              className={`${field} flex-1 font-mono`}
              aria-label={t("deploy.command")}
            />
            <Button
              size="sm"
              onClick={() =>
                void api.updateEnvironment(env.id, { deployCommand: editing }).then(() => {
                  setEditing(undefined);
                  onRemoved();
                })
              }
            >
              {t("env.save")}
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={FileCode2}
          onClick={() => void api.envWorkflow(env.id).then(setWorkflow)}
          data-tip={t("deploy.workflowTip")}
        >
          {t("deploy.workflow")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("deploy.remove")}
          onClick={() =>
            window.confirm(t("deploy.removeConfirm")) && void api.removeEnvironment(env.id).then(onRemoved)
          }
        />
      </div>
      {note && <p className="text-xs text-success">{note}</p>}
      <Dialog open={!!workflow} onClose={() => setWorkflow(undefined)} label={t("deploy.workflow")} wide>
        {workflow && (
          <div className="space-y-3 p-5">
            <h2 className="text-[14px] font-semibold">{t("deploy.workflow")}</h2>
            <p className="text-xs text-fg-muted">{t("deploy.workflowHint", { path: workflow.path })}</p>
            <pre className="max-h-80 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11px]">
              {workflow.content}
            </pre>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setWorkflow(undefined)}>
                {t("memory.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={workflow.exists}
                onClick={() =>
                  void api.writeEnvWorkflow(env.id).then((r) => {
                    setWorkflow(undefined);
                    setNote(t("deploy.workflowWritten", { path: r.path }));
                  })
                }
              >
                {workflow.exists ? t("deploy.workflowExists") : t("deploy.workflowWrite")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

/** Local · Staging · Prod for one project (plan.md 1.2b / 1.2c). */
export function EnvironmentsTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const [envs, setEnvs] = useState<EnvironmentInfo[]>([]);
  const [deploys, setDeploys] = useState<DeployRecord[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [adding, setAdding] = useState<{
    name: string;
    serverId: string;
    path: string;
    branch: string;
    deployCommand: string;
    error?: string;
  }>();
  const [deploying, setDeploying] = useState<EnvironmentInfo>();
  const load = () => {
    void api.environments(project.id).then(setEnvs);
    void api.projectDeploys(project.id).then(setDeploys);
  };
  useEffect(load, [project.id]);
  useEffect(() => {
    api
      .servers()
      .then(setServers)
      .catch(() => undefined);
  }, []);
  useServerEvent("deploys-changed", (m) => m.projectId === project.id && load());
  const git = project.git;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-pad">
        <Laptop size={16} className="text-fg-muted" aria-hidden="true" />
        <Badge>{t("deploy.local")}</Badge>
        <span className="font-mono text-[12px]">{project.path}</span>
        {git?.branch && <span className="text-[11px] text-fg-subtle">· {git.branch}</span>}
        {git?.lastCommit && (
          <span className="font-mono text-[11px] text-fg-muted">{git.lastCommit.hash.slice(0, 7)}</span>
        )}
        {git && (git.ahead > 0 || git.changed > 0) && (
          <span className="text-[11px] text-warning">
            {[
              git.changed ? t("deploy.localChanged", { count: git.changed }) : "",
              git.ahead ? t("deploy.localUnpushed", { count: git.ahead }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </Card>
      {envs.map((env) => (
        <EnvCard key={env.id} env={env} onDeploy={() => setDeploying(env)} onRemoved={load} />
      ))}
      {!envs.length && (
        <EmptyState
          icon={Server}
          title={t("deploy.none")}
          body={servers.length ? t("deploy.noneBody") : t("deploy.noServers")}
          action={
            servers.length ? undefined : (
              <Link to="/servers">
                <Button>{t("deploy.addServer")}</Button>
              </Link>
            )
          }
        />
      )}
      {servers.length > 0 && (
        <Button
          icon={Plus}
          onClick={() =>
            setAdding({
              name: envs.length ? "staging" : "production",
              serverId: servers[0]?.id ?? "",
              path: "",
              branch: git?.branch ?? "main",
              deployCommand: "",
            })
          }
        >
          {t("deploy.add")}
        </Button>
      )}

      {deploys.length > 0 && (
        <Card className="p-pad">
          <h3 className="mb-2 text-[13px] font-semibold">{t("deploy.history")}</h3>
          <ul className="divide-y divide-border">
            {deploys.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-1.5 text-[12px]">
                {d.exitCode === 0 ? (
                  <CheckCircle2 size={13} className="text-success" aria-label={t("tools.ok")} />
                ) : (
                  <CircleAlert size={13} className="text-danger" aria-label={t("tools.failed")} />
                )}
                <span className="w-28 text-fg-subtle">{relativeTime(d.at)}</span>
                <span>{envs.find((e) => e.id === d.envId)?.name ?? "—"}</span>
                <span className="font-mono text-fg-muted">
                  {d.fromHead} → {d.toHead}
                </span>
                <span className="ms-auto text-fg-subtle">{Math.round(d.ms / 1000)} s</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DeployDialog
        env={deploying}
        onClose={() => {
          setDeploying(undefined);
          load();
        }}
      />
      <Dialog open={!!adding} onClose={() => setAdding(undefined)} label={t("deploy.add")}>
        {adding && (
          <div className="space-y-3 p-5">
            <h2 className="text-[14px] font-semibold">{t("deploy.add")}</h2>
            <p className="text-xs text-fg-muted">{t("deploy.addHint")}</p>
            <input
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              placeholder="production"
              aria-label={t("deploy.name")}
              className={field}
            />
            <select
              value={adding.serverId}
              onChange={(e) => setAdding({ ...adding, serverId: e.target.value })}
              aria-label={t("env.server")}
              className={field}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.target})
                </option>
              ))}
            </select>
            <input
              value={adding.path}
              onChange={(e) => setAdding({ ...adding, path: e.target.value })}
              placeholder="/srv/app"
              aria-label={t("deploy.path")}
              className={`${field} font-mono`}
            />
            <input
              value={adding.branch}
              onChange={(e) => setAdding({ ...adding, branch: e.target.value })}
              placeholder="main"
              aria-label={t("deploy.branch")}
              className={`${field} font-mono`}
            />
            <input
              value={adding.deployCommand}
              onChange={(e) => setAdding({ ...adding, deployCommand: e.target.value })}
              placeholder="docker compose up -d --build"
              aria-label={t("deploy.command")}
              className={`${field} font-mono`}
            />
            {adding.error && <p className="text-xs text-danger">{adding.error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(undefined)}>
                {t("memory.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!adding.path.trim()}
                onClick={() =>
                  api
                    .addEnvironment(project.id, adding)
                    .then(() => {
                      setAdding(undefined);
                      load();
                    })
                    .catch((err: Error) => setAdding({ ...adding, error: err.message }))
                }
              >
                {t("deploy.addSave")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
