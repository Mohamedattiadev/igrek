import type {
  Presence,
  ProjectListItem,
  ShareLevel,
  TeamAuditEntry,
  TeamDevice,
  TeamInvite,
  TeamStatus,
  TeamUser,
} from "@godeye/core";
import { Copy, KeyRound, LogOut, Plus, RefreshCw, ShieldCheck, Trash2, Users, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Section, Segmented, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";
const SHARES: ShareLevel[] = ["off", "summary", "full"];
const ROLES = ["member", "viewer", "admin"] as const;

function useTeam() {
  const [status, setStatus] = useState<TeamStatus>();
  const load = () => {
    api
      .team()
      .then(setStatus)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("team-changed", load);
  return { status, reload: load };
}

function CopyBox({ value, secret }: { value: string; secret?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code
        className={cn(
          "min-w-0 flex-1 break-all rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11px]",
          secret && "select-all",
        )}
      >
        {value}
      </code>
      <Button
        size="sm"
        icon={Copy}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? t("team.copied") : t("team.copy")}
      </Button>
    </div>
  );
}

// ---- not connected yet -----------------------------------------------------------------

function Connect({ onDone }: { onDone: (recoveryKey?: string) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"invite" | "admin">("invite");
  const [form, setForm] = useState({ invite: "", newPassword: "", hub: "https://", username: "", password: "" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.teamConnect(
        mode === "invite"
          ? { invite: form.invite, newPassword: form.newPassword || undefined }
          : {
              hub: form.hub,
              username: form.username,
              password: form.password,
              newPassword: form.newPassword || undefined,
            },
      );
      onDone(result.recoveryKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("team.connectTitle")}</h2>
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("team.connectIntro")}</p>
      </div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "invite", label: t("team.haveInvite") },
          { value: "admin", label: t("team.adminSignIn") },
        ]}
      />
      <Card className="space-y-3 p-pad">
        {mode === "invite" ? (
          <>
            <textarea
              className={cn(field, "h-24 py-2 font-mono text-[11px]")}
              placeholder="godeye-invite:…"
              value={form.invite}
              onChange={(e) => setForm({ ...form, invite: e.target.value })}
            />
            <input
              className={field}
              type="password"
              autoComplete="new-password"
              placeholder={t("team.newPassword")}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            />
            <p className="text-[11px] text-fg-subtle">{t("team.newPasswordHint")}</p>
          </>
        ) : (
          <>
            <input
              className={cn(field, "font-mono")}
              placeholder="https://hub.example.com"
              value={form.hub}
              onChange={(e) => setForm({ ...form, hub: e.target.value })}
            />
            <input
              className={field}
              autoComplete="username"
              placeholder={t("team.username")}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              className={field}
              type="password"
              autoComplete="current-password"
              placeholder={t("team.password")}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <p className="text-[11px] text-fg-subtle">{t("team.adminHint")}</p>
          </>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {t("team.connect")}
          </Button>
        </div>
      </Card>
      <ul className="space-y-1.5 text-xs text-fg-subtle">
        <li>🔒 {t("team.privacyE2e")}</li>
        <li>🙈 {t("team.privacyOff")}</li>
        <li>🧹 {t("team.privacyScrub")}</li>
      </ul>
    </div>
  );
}

// ---- connected -------------------------------------------------------------------------

function Members({ status, presence }: { status: TeamStatus; presence: Presence[] }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
  }, []);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="divide-y divide-border">
      {status.members.map((m) => {
        const doing = presence.filter((p) => p.userId === m.id);
        return (
          <div key={m.id} className="flex items-start gap-3 py-2.5">
            <StatusDot tone={m.online ? "success" : "neutral"} pulse={doing.length > 0} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-medium">{m.displayName}</span>
                <span className="font-mono text-[11px] text-fg-subtle">@{m.username}</span>
                {m.role !== "member" && (
                  <Badge tone={m.role === "admin" ? "accent" : "neutral"}>{t(`team.role_${m.role}`)}</Badge>
                )}
                {m.id === status.user?.id && <Badge>{t("team.you")}</Badge>}
              </div>
              {doing.map((p) => (
                <p key={p.projectId} className="mt-0.5 truncate text-xs text-fg-muted">
                  {t("team.workingOn", { project: projectName(p.projectId), title: p.title ?? "…" })}
                  {p.files.length > 0 && (
                    <span className="ms-1 font-mono text-fg-subtle">· {p.files.slice(-3).join(", ")}</span>
                  )}
                </p>
              ))}
              {!doing.length && (
                <p className="mt-0.5 text-xs text-fg-subtle">{m.online ? t("team.online") : t("team.offline")}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sharing() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectListItem[]>();
  const load = () => {
    api
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]));
  };
  useEffect(load, []);
  if (!projects) return null;
  return (
    <div className="space-y-2">
      {projects
        .filter((p) => !p.hidden)
        .map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {p.name}
              {p.workspace === "team" && <span className="ms-2 text-[11px] text-fg-subtle">{t("team.fromTeam")}</span>}
            </span>
            <Segmented
              value={p.share}
              onChange={(share) => {
                void api.setShare(p.id, share).then(load);
              }}
              options={SHARES.map((s) => ({ value: s, label: t(`team.share_${s}`) }))}
            />
          </div>
        ))}
      <p className="pt-1 text-[11px] leading-relaxed text-fg-subtle">{t("team.shareHint")}</p>
    </div>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ username: "", displayName: "", role: "member" as string });
  const [result, setResult] = useState<TeamInvite>();
  const [error, setError] = useState<string>();
  const close = () => {
    setResult(undefined);
    setError(undefined);
    setForm({ username: "", displayName: "", role: "member" });
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} label={t("team.invite")}>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">{t("team.invite")}</h2>
        {result ? (
          <>
            <p className="text-xs text-fg-muted">{t("team.inviteReady", { name: result.user.username })}</p>
            <CopyBox value={result.invite} secret />
            <p className="text-[11px] text-warning">{t("team.inviteSecret")}</p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={close}>
                {t("team.done")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <input
              className={cn(field, "font-mono")}
              placeholder={t("team.username")}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              className={field}
              placeholder={t("team.displayName")}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
            <Segmented
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              options={ROLES.map((r) => ({ value: r, label: t(`team.role_${r}`) }))}
            />
            <p className="text-[11px] text-fg-subtle">{t(`team.roleHint_${form.role}`)}</p>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                {t("memory.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!form.username.trim()}
                onClick={() => {
                  setError(undefined);
                  api
                    .teamInvite(form)
                    .then(setResult)
                    .catch((err: Error) => setError(err.message));
                }}
              >
                {t("team.createInvite")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function AdminPanel({ me }: { me: string }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [devices, setDevices] = useState<TeamDevice[]>([]);
  const [audit, setAudit] = useState<TeamAuditEntry[]>([]);
  const [stats, setStats] = useState<{ users: number; events: number; bytes: number; online: number; rssMb: number }>();
  const [inviting, setInviting] = useState(false);
  const [reset, setReset] = useState<TeamInvite>();
  const [recovery, setRecovery] = useState<string>();
  const [error, setError] = useState<string>();

  const load = () => {
    Promise.all([api.teamUsers(), api.teamDevices(), api.teamAudit(), api.teamStats()])
      .then(([u, d, a, s]) => {
        setUsers(u);
        setDevices(d);
        setAudit(a);
        setStats(s);
      })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, []);
  useServerEvent("team-changed", load);

  const act = (work: Promise<unknown>) => {
    setError(undefined);
    work.then(load).catch((err: Error) => setError(err.message));
  };
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.displayName ?? "—";

  return (
    <>
      <Section title={t("team.users")} hint={t("team.usersHint")}>
        <div className="mb-3 flex gap-2">
          <Button variant="primary" icon={Plus} onClick={() => setInviting(true)}>
            {t("team.invite")}
          </Button>
          <Button icon={KeyRound} onClick={() => void api.teamRecoveryKey().then((r) => setRecovery(r.key))}>
            {t("team.showRecovery")}
          </Button>
          <Button variant="ghost" icon={RefreshCw} onClick={load} aria-label={t("team.refresh")} />
        </div>
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        <div className="divide-y divide-border rounded-ui border border-border">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <div className={cn("text-[13px] font-medium", u.disabled && "text-fg-subtle line-through")}>
                  {u.displayName}
                </div>
                <div className="font-mono text-[11px] text-fg-subtle">
                  @{u.username}
                  {u.mustChangePassword && <span className="ms-2 text-warning">{t("team.pendingJoin")}</span>}
                </div>
              </div>
              <select
                className="h-7 rounded-ui border border-border bg-bg px-2 text-xs"
                value={u.role}
                aria-label={t("team.role")}
                onChange={(e) => act(api.teamUpdateUser(u.id, { role: e.target.value }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`team.role_${r}`)}
                  </option>
                ))}
              </select>
              {u.id !== me && (
                <>
                  <Button
                    size="sm"
                    icon={KeyRound}
                    onClick={() =>
                      api
                        .teamResetUser(u.id)
                        .then(setReset)
                        .catch((e: Error) => setError(e.message))
                    }
                  >
                    {t("team.resetPassword")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={UserX}
                    onClick={() => act(api.teamUpdateUser(u.id, { disabled: !u.disabled }))}
                  >
                    {u.disabled ? t("team.enable") : t("team.disable")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label={t("team.remove")}
                    onClick={() =>
                      window.confirm(t("team.removeConfirm", { name: u.displayName })) && act(api.teamDeleteUser(u.id))
                    }
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("team.devices")} hint={t("team.devicesHint")}>
        <div className="divide-y divide-border rounded-ui border border-border">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {nameOf(d.userId)} · {d.name}
                </div>
                <div className="text-[11px] text-fg-subtle">
                  {t("team.lastSeen", { when: relativeTime(d.lastSeen) })}
                  {d.ip && <span className="ms-2 font-mono">{d.ip}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" icon={LogOut} onClick={() => act(api.teamRevokeDevice(d.id))}>
                {t("team.signOutDevice")}
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {stats && (
        <Section title={t("team.hubStats")}>
          <div className="flex flex-wrap gap-6 text-[13px]">
            <Stat label={t("team.statUsers")} value={String(stats.users)} />
            <Stat label={t("team.statOnline")} value={String(stats.online)} />
            <Stat label={t("team.statEvents")} value={compactNumber(stats.events)} />
            <Stat label={t("team.statStorage")} value={`${(stats.bytes / 1e6).toFixed(1)} MB`} />
            <Stat label={t("team.statMemory")} value={`${stats.rssMb} MB`} />
          </div>
        </Section>
      )}

      <Section title={t("team.audit")} hint={t("team.auditHint")}>
        <div className="max-h-72 overflow-auto rounded-ui border border-border">
          {audit.map((a) => (
            <div
              key={`${a.at}-${a.action}-${a.detail ?? ""}`}
              className="flex gap-3 border-b border-border px-2.5 py-1.5 text-xs last:border-b-0"
            >
              <span className="w-24 shrink-0 text-fg-subtle">{relativeTime(a.at)}</span>
              <span className="w-28 shrink-0 truncate">{nameOf(a.userId)}</span>
              <span className="font-mono">{a.action}</span>
              <span className="min-w-0 flex-1 truncate text-fg-subtle">{a.detail}</span>
            </div>
          ))}
        </div>
      </Section>

      <InviteDialog
        open={inviting}
        onClose={() => {
          setInviting(false);
          load();
        }}
      />
      <Dialog open={!!reset} onClose={() => setReset(undefined)} label={t("team.resetPassword")}>
        {reset && (
          <div className="space-y-3 p-5">
            <h2 className="text-[14px] font-semibold">{t("team.resetPassword")}</h2>
            <p className="text-xs text-fg-muted">{t("team.resetReady", { name: reset.user.username })}</p>
            <CopyBox value={reset.invite} secret />
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setReset(undefined)}>
                {t("team.done")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={!!recovery} onClose={() => setRecovery(undefined)} label={t("team.recoveryTitle")}>
        {recovery && <RecoveryBody value={recovery} onClose={() => setRecovery(undefined)} />}
      </Dialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-fg-subtle">{label}</div>
      <div className="font-mono text-[15px] font-semibold">{value}</div>
    </div>
  );
}

function RecoveryBody({ value, onClose }: { value: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold">
        <ShieldCheck size={16} /> {t("team.recoveryTitle")}
      </h2>
      <p className="text-xs leading-relaxed text-fg-muted">{t("team.recoveryBody")}</p>
      <CopyBox value={value} secret />
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t("team.recoverySaved")}
        </Button>
      </div>
    </div>
  );
}

export function TeamPage() {
  const { t } = useTranslation();
  const { status, reload } = useTeam();
  const [presence, setPresence] = useState<Presence[]>([]);
  const [recovery, setRecovery] = useState<string>();
  const loadPresence = () => {
    api
      .teamPresence()
      .then(setPresence)
      .catch(() => undefined);
  };
  useEffect(loadPresence, []);
  useServerEvent("presence", loadPresence);

  if (!status) return null;
  const showConnect = !status.configured || status.signedOut;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("nav.team")}
        actions={
          status.configured && (
            <div className="flex items-center gap-3 text-xs text-fg-muted">
              <span className="flex items-center gap-1.5">
                <StatusDot tone={status.connected ? "success" : "warning"} />
                {status.connected ? t("team.connected") : t("team.reconnecting")}
              </span>
              <span className="font-mono text-fg-subtle">{status.hub?.replace(/^https?:\/\//, "")}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={LogOut}
                onClick={() => window.confirm(t("team.disconnectConfirm")) && void api.teamDisconnect().then(reload)}
              >
                {t("team.disconnect")}
              </Button>
            </div>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {status.signedOut && (
          <p className="mx-6 mt-4 rounded-ui bg-warning-soft p-3 text-xs text-warning">{t("team.signedOut")}</p>
        )}
        {status.keyMismatch && (
          <p className="mx-6 mt-4 rounded-ui bg-danger-soft p-3 text-xs text-danger">{t("team.keyMismatch")}</p>
        )}
        {showConnect ? (
          <Connect
            onDone={(key) => {
              setRecovery(key);
              reload();
            }}
          />
        ) : (
          <div className="mx-auto max-w-5xl px-6">
            <Section title={t("team.members")} hint={t("team.membersHint")}>
              {status.members.length ? (
                <Members status={status} presence={presence} />
              ) : (
                <EmptyState icon={Users} title={t("team.noMembers")} body={t("team.noMembersBody")} />
              )}
            </Section>
            <Section title={t("team.sharing")} hint={t("team.sharingHint")}>
              <Sharing />
            </Section>
            {status.user?.role === "admin" && <AdminPanel me={status.user.id} />}
          </div>
        )}
      </div>
      <Dialog open={!!recovery} onClose={() => setRecovery(undefined)} label={t("team.recoveryTitle")}>
        {recovery && <RecoveryBody value={recovery} onClose={() => setRecovery(undefined)} />}
      </Dialog>
    </div>
  );
}
