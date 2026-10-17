import type { PluginInfo, PluginPermission } from "@godeye/core";
import { Plug, Plus, Power, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Badge, Button, Card, Dialog, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { costApi, opsApi, pluginApi } from "../../lib/ops-api";
import { field } from "./Uptime";

/** What each bridge method needs, and what it returns (read-only, plain data). */
const METHODS: Record<
  string,
  { permission: PluginPermission; run: (params: Record<string, unknown>) => Promise<unknown> }
> = {
  projects: {
    permission: "projects:read",
    run: async () =>
      (await api.projects())
        .filter((p) => !p.hidden)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sessions: p.sessionCount,
          active: p.activeSessions,
          lastActivity: p.lastActivity,
          health: p.health?.level,
        })),
  },
  project: {
    permission: "projects:read",
    run: async ({ projectId }) => {
      const p = await api.project(String(projectId));
      return { id: p.id, name: p.name, sessions: p.sessionCount, branch: p.git?.branch, health: p.health?.level };
    },
  },
  memory: {
    permission: "memory:read",
    run: async ({ projectId }) =>
      (await api.project(String(projectId))).memory.map((m) => ({ section: m.section, text: m.text })),
  },
  sessions: {
    permission: "sessions:read",
    run: async ({ projectId }) =>
      (await api.projectSessions(String(projectId)))
        .slice(0, 50)
        .map((s) => ({ title: s.title, tool: s.tool, startedAt: s.startedAt, summary: s.summary?.title })),
  },
  costs: { permission: "costs:read", run: async ({ currency }) => costApi.summary(String(currency ?? "USD")) },
  uptime: {
    permission: "uptime:read",
    run: async () =>
      (await opsApi.uptime()).map((m) => ({ name: m.name, url: m.url, up: m.up, ms: m.ms, uptime24h: m.uptime24h })),
  },
};

/** A plugin page in a sandbox (no network, opaque origin); data only through the bridge. */
export function PluginFrame({ plugin, entry, projectId }: { plugin: PluginInfo; entry: string; projectId?: string }) {
  const { i18n } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const m = event.data as { godeye?: number; id?: number; method?: string; params?: Record<string, unknown> };
      if (m?.godeye !== 1 || typeof m.id !== "number") return;
      const reply = (body: object) => frame.current?.contentWindow?.postMessage({ godeye: 1, id: m.id, ...body }, "*");
      const method = METHODS[String(m.method)];
      if (!method) return reply({ error: "Unknown method" });
      if (!plugin.permissions.includes(method.permission))
        return reply({ error: `This plugin has no ${method.permission} permission` });
      try {
        reply({
          result: await method.run({
            ...(m.params ?? {}),
            ...(projectId && !m.params?.projectId ? { projectId } : {}),
          }),
        });
      } catch (err) {
        reply({ error: (err as Error).message });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [plugin, projectId]);
  return (
    <iframe
      ref={frame}
      title={plugin.name}
      src={`/plugin-files/${plugin.id}/${entry}`}
      sandbox="allow-scripts"
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          {
            godeye: 1,
            type: "hello",
            theme: document.documentElement.dataset.theme ?? "light",
            language: i18n.language,
            projectId,
          },
          "*",
        )
      }
      className="h-[70vh] w-full rounded-ui border border-border bg-bg"
    />
  );
}

function Approve({ plugin, onClose, onDone }: { plugin?: PluginInfo; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  if (!plugin) return null;
  return (
    <Dialog open={!!plugin} onClose={onClose} label={t("plugins.approve")}>
      <div className="space-y-3 p-5 text-[13px]">
        <h2 className="text-[15px] font-semibold">{t("plugins.approveTitle", { name: plugin.name })}</h2>
        {plugin.description && <p className="text-fg-muted">{plugin.description}</p>}
        <div>
          <p className="font-medium">{t("plugins.reads")}</p>
          {plugin.permissions.length ? (
            <ul className="mt-1 list-disc ps-5 text-fg-muted">
              {plugin.permissions.map((p) => (
                <li key={p}>{t(`plugins.perm_${p.replace(":", "_")}`)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">{t("plugins.readsNothing")}</p>
          )}
        </div>
        {plugin.commands.length > 0 && (
          <div>
            <p className="font-medium">{t("plugins.runs")}</p>
            <ul className="mt-1 space-y-1">
              {plugin.commands.map((c) => (
                <li key={c.id}>
                  {c.title}
                  <code className="mt-0.5 block break-all rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px]">
                    {c.run.join(" ")}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex items-start gap-1.5 text-xs text-fg-subtle">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("plugins.sandbox")}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("persona.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              await pluginApi.setEnabled(plugin.id, true);
              onDone();
              onClose();
            }}
          >
            {t("plugins.turnOn")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Plugins (plan.md 12): install, read what they ask for, turn on. */
export function PluginsTab({ onChange }: { onChange?: () => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState<PluginInfo[]>();
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [approve, setApprove] = useState<PluginInfo>();
  const load = useCallback(() => {
    pluginApi
      .list()
      .then(setList)
      .catch(() => undefined);
    onChange?.();
  }, [onChange]);
  useEffect(load, [load]);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">{t("plugins.intro")}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const p = await pluginApi.install(source);
            setSource("");
            load();
            setApprove(p);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t("plugins.source")}
          aria-label={t("plugins.source")}
          className={cn(field, "min-w-0 flex-1 basis-64 font-mono")}
        />
        <Button type="submit" variant="primary" icon={Plus} disabled={!source.trim() || busy}>
          {busy ? t("plugins.installing") : t("plugins.install")}
        </Button>
      </form>
      <p className="text-xs text-fg-subtle">{t("plugins.example")}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      {list && !list.length ? (
        <EmptyState icon={Plug} title={t("plugins.emptyTitle")} body={t("plugins.emptyBody")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(list ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-pad py-2.5">
                <Plug size={15} className={p.enabled ? "text-success" : "text-fg-subtle"} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">
                    {p.name} <span className="text-xs font-normal text-fg-subtle">{p.version}</span>
                  </p>
                  <p className="truncate text-[11px] text-fg-subtle">{p.error ?? p.description ?? p.source}</p>
                </div>
                {p.panels.length > 0 && <Badge>{t("plugins.panels", { count: p.panels.length })}</Badge>}
                {p.commands.length > 0 && <Badge>{t("plugins.commands", { count: p.commands.length })}</Badge>}
                <Button
                  size="sm"
                  variant={p.enabled ? "ghost" : "primary"}
                  icon={Power}
                  disabled={!!p.error}
                  onClick={() => (p.enabled ? void pluginApi.setEnabled(p.id, false).then(load) : setApprove(p))}
                >
                  {p.enabled ? t("plugins.turnOff") : t("plugins.turnOn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label={t("plugins.remove")}
                  onClick={() => void pluginApi.remove(p.id).then(load)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Approve plugin={approve} onClose={() => setApprove(undefined)} onDone={load} />
    </div>
  );
}

/** A project's plugin pages and commands. */
export function ProjectPlugins({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState<PluginInfo[]>([]);
  useEffect(() => {
    pluginApi
      .list()
      .then((l) =>
        setList(l.filter((p) => p.enabled && (p.commands.length || p.panels.some((x) => x.place === "project")))),
      )
      .catch(() => undefined);
  }, []);
  if (!list.length) return <EmptyState icon={Plug} title={t("plugins.noneHere")} body={t("plugins.noneHereBody")} />;
  return (
    <div className="space-y-6">
      {list.map((p) => (
        <section key={p.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{p.name}</h2>
            {p.commands.map((c) => (
              <Button
                key={c.id}
                size="sm"
                icon={Terminal}
                data-tip={c.run.join(" ")}
                onClick={async () => navigate(`/t/${(await pluginApi.run(p.id, c.id, projectId)).id}`)}
              >
                {c.title}
              </Button>
            ))}
          </div>
          {p.panels
            .filter((x) => x.place === "project")
            .map((x) => (
              <PluginFrame key={x.id} plugin={p} entry={x.entry} projectId={projectId} />
            ))}
        </section>
      ))}
    </div>
  );
}
