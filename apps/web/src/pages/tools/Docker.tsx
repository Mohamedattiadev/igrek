import type { DockerContainer, ServerInfo } from "@godeye/core";
import { Container, Play, RefreshCw, RotateCw, ScrollText, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState, field } from "../../components/ui";
import { api } from "../../lib/api";
import { opsApi } from "../../lib/ops-api";
import { LogText } from "./Logs";

const STATE_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  running: "success",
  restarting: "warning",
  paused: "warning",
  exited: "neutral",
  created: "neutral",
  dead: "danger",
};

function ContainerRow({ c, serverId, onChange }: { c: DockerContainer; serverId?: string; onChange: () => void }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string>();
  const [confirm, setConfirm] = useState<"restart" | "stop" | "start">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const loadLogs = () =>
    opsApi
      .containerLogs(c.name, serverId)
      .then(setLogs)
      .catch((err: Error) => setError(err.message));
  const act = async (action: "restart" | "stop" | "start") => {
    setBusy(true);
    setError(undefined);
    try {
      await opsApi.containerAction(c.name, action, serverId);
      setConfirm(undefined);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const unhealthy = /unhealthy/.test(c.status);
  return (
    <li className="space-y-2 px-pad py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">
            {c.name}
            {c.project && <span className="ms-2 text-xs font-normal text-fg-subtle">{c.project}</span>}
          </p>
          <p className="truncate font-mono text-[11px] text-fg-subtle">
            {c.image}
            {c.ports && ` · ${c.ports}`}
          </p>
        </div>
        <Badge tone={unhealthy ? "danger" : (STATE_TONE[c.state] ?? "neutral")}>{c.status}</Badge>
        {c.cpu && (
          <span className="font-mono text-[11px] text-fg-muted" data-tip={t("docker.usage")}>
            {c.cpu} · {c.mem}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={ScrollText}
          onClick={() => (logs === undefined ? void loadLogs() : setLogs(undefined))}
        >
          {t("docker.logs")}
        </Button>
        {c.state === "running" ? (
          <>
            <Button size="sm" variant="ghost" icon={RotateCw} disabled={busy} onClick={() => setConfirm("restart")}>
              {t("docker.restart")}
            </Button>
            <Button size="sm" variant="ghost" icon={Square} disabled={busy} onClick={() => setConfirm("stop")}>
              {t("docker.stop")}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={Play} disabled={busy} onClick={() => setConfirm("start")}>
            {t("docker.start")}
          </Button>
        )}
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-warning bg-warning-soft/40 p-2 text-xs">
          <span className="min-w-0 flex-1">{t(`docker.confirm_${confirm}`, { name: c.name })}</span>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(confirm)}>
            {t(`docker.${confirm}`)}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(undefined)}>
            {t("persona.cancel")}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {logs !== undefined && <LogText text={logs} onRefresh={() => void loadLogs()} />}
    </li>
  );
}

export function DockerTab() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [serverId, setServerId] = useState("");
  const [list, setList] = useState<DockerContainer[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api
      .servers()
      .then(setServers)
      .catch(() => undefined);
  }, []);
  const load = () => {
    setLoading(true);
    setError(undefined);
    opsApi
      .containers(serverId || undefined)
      .then(setList)
      .catch((err: Error) => {
        setList(undefined);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [serverId]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("docker.intro")}</p>
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
        <Button variant="ghost" icon={RefreshCw} disabled={loading} onClick={load}>
          {t("docker.refresh")}
        </Button>
      </div>
      {error && <p className="rounded-ui border border-border bg-bg-subtle p-3 text-[13px] text-fg-muted">{error}</p>}
      {list && !list.length ? (
        <EmptyState icon={Container} title={t("docker.emptyTitle")} body={t("docker.emptyBody")} />
      ) : list ? (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <ContainerRow key={c.id} c={c} serverId={serverId || undefined} onChange={load} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
