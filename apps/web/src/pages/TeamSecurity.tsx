import type { HubAlertInfo, KeyRequest, TeamUser } from "@godeye/core";
import { BellRing, KeyRound, LaptopMinimal, LogOut, RefreshCcw, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Section, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { useSettings } from "../lib/settings";

const field = "h-8 rounded-ui border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent";

/** Admin: devices waiting for the team key (plan.md 4.2). Approving wraps the key for that device only. */
export function KeyRequestsSection() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<KeyRequest[]>([]);
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .teamKeyRequests()
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  };
  useEffect(load, []);
  useServerEvent("team-changed", load);
  if (!requests.length) return null;
  return (
    <Section title={t("keys.requests")} hint={t("keys.requestsHint")}>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <ul className="divide-y divide-border rounded-ui border border-warning/50">
        {requests.map((r) => (
          <li key={r.deviceId} className="flex flex-wrap items-center gap-2 p-2.5 text-[13px]">
            <LaptopMinimal size={14} className="text-warning" aria-hidden="true" />
            <span className="font-medium">{r.displayName}</span>
            <span className="font-mono text-[11px] text-fg-subtle">@{r.username}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
              {r.name} · {relativeTime(r.createdAt)}
            </span>
            <Button
              size="sm"
              variant="primary"
              icon={KeyRound}
              onClick={() =>
                window.confirm(t("keys.approveConfirm", { name: r.displayName, device: r.name })) &&
                void api
                  .teamApproveDevice(r.deviceId)
                  .then(load)
                  .catch((err: Error) => setError(err.message))
              }
            >
              {t("keys.approve")}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Admin: replace the team key, e.g. after removing someone. */
export function RotateKeySection({ onRecovery }: { onRecovery: (key: string) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Section title={t("keys.rotate")} hint={t("keys.rotateHint")}>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      <Button
        icon={RefreshCcw}
        disabled={busy}
        onClick={() => {
          if (!window.confirm(t("keys.rotateConfirm"))) return;
          setBusy(true);
          api
            .teamRotateKey()
            .then((r) => onRecovery(r.recoveryKey))
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        {t("keys.rotateNow")}
      </Button>
    </Section>
  );
}

export function AlertsSection() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<HubAlertInfo[]>([]);
  const load = () => {
    api
      .teamAlerts()
      .then(setAlerts)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("team-changed", load);
  if (!alerts.length) return null;
  return (
    <Section title={t("alerts.title")} hint={t("alerts.hint")}>
      <ul className="space-y-1.5">
        {alerts.map((a) => (
          <li
            key={`${a.at}-${a.user}`}
            className="flex items-center gap-2 rounded-ui bg-warning-soft px-3 py-2 text-xs text-warning"
          >
            <BellRing size={13} aria-hidden="true" />
            <span className="flex-1">
              {t(`alerts.${a.kind}`, { user: a.user, ip: a.ip ?? "?", count: a.count ?? 0 })}
            </span>
            <span className="text-[11px]">{relativeTime(a.at)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface Policies {
  minPassword: number;
  require2fa: boolean;
  sessionDays: number;
  ipAllow: string;
  retentionDays: number;
}

export function PoliciesSection() {
  const { t } = useTranslation();
  const [p, setP] = useState<Policies>();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api
      .teamPolicies()
      .then(setP)
      .catch(() => undefined);
  }, []);
  if (!p) return null;
  const save = (next: Policies) => {
    setP(next);
    setSaved(false);
    void api.teamSetPolicies(next).then(() => setSaved(true));
  };
  return (
    <Section title={t("policy.title")} hint={t("policy.hint")}>
      <div className="grid gap-3 text-[13px] sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs text-fg-muted">{t("policy.minPassword")}</span>
          <input
            type="number"
            min={8}
            max={64}
            value={p.minPassword}
            onChange={(e) => save({ ...p, minPassword: Number(e.target.value) })}
            className={`${field} w-24`}
          />
        </label>
        <div className="space-y-1">
          <span className="block text-xs text-fg-muted">{t("policy.require2fa")}</span>
          <Segmented
            value={p.require2fa ? "on" : "off"}
            onChange={(v) => save({ ...p, require2fa: v === "on" })}
            options={[
              { value: "on", label: t("settings.on") },
              { value: "off", label: t("settings.off") },
            ]}
          />
        </div>
        <label className="space-y-1">
          <span className="block text-xs text-fg-muted">{t("policy.sessionDays")}</span>
          <input
            type="number"
            min={0}
            max={365}
            value={p.sessionDays}
            onChange={(e) => save({ ...p, sessionDays: Number(e.target.value) })}
            className={`${field} w-24`}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-fg-muted">{t("policy.retentionDays")}</span>
          <input
            type="number"
            min={0}
            max={3650}
            value={p.retentionDays}
            onChange={(e) => save({ ...p, retentionDays: Number(e.target.value) })}
            className={`${field} w-24`}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-xs text-fg-muted">{t("policy.ipAllow")}</span>
          <input
            value={p.ipAllow}
            onChange={(e) => setP({ ...p, ipAllow: e.target.value })}
            onBlur={() => save(p)}
            placeholder="10.0.0.0/8, 203.0.113.7"
            className={`${field} w-full font-mono`}
          />
        </label>
      </div>
      {saved && <p className="mt-2 text-[11px] text-success">{t("policy.saved")}</p>}
    </Section>
  );
}

const ROLES = ["owner", "manager", "member", "viewer"] as const;

/** Admin: who may see each shared project. A project with no list is open to the whole team. */
export function AccessSection({ users }: { users: TeamUser[] }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<{ projectId: string; name: string; key: string }[]>([]);
  const [access, setAccess] = useState<{ project: string; userId: string; role: string }[]>([]);
  const load = () => {
    void api.teamProjects().then(setProjects);
    void api.teamAccess().then(setAccess);
  };
  useEffect(load, []);
  if (!projects.length) return null;
  const members = users.filter((u) => !u.disabled && u.role !== "admin");
  return (
    <Section title={t("access.title")} hint={t("access.hint")}>
      <div className="overflow-x-auto rounded-ui border border-border">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-fg-subtle">
            <tr>
              <th className="px-2 py-1.5 text-start font-medium">{t("access.project")}</th>
              {members.map((u) => (
                <th key={u.id} className="px-2 py-1.5 text-start font-medium">
                  {u.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((p) => {
              const rows = access.filter((a) => a.project === p.key);
              return (
                <tr key={p.key}>
                  <td className="px-2 py-1.5">
                    {p.name}
                    {!rows.length && <span className="ms-1.5 text-[10.5px] text-fg-subtle">({t("access.open")})</span>}
                  </td>
                  {members.map((u) => {
                    const role = rows.find((r) => r.userId === u.id)?.role ?? "";
                    return (
                      <td key={u.id} className="px-2 py-1">
                        <select
                          value={role}
                          onChange={(e) => void api.teamSetAccess(p.key, u.id, e.target.value || null).then(load)}
                          aria-label={t("access.roleFor", { user: u.displayName, project: p.name })}
                          className="h-7 rounded-md border border-border bg-bg px-1 text-[11.5px]"
                        >
                          <option value="">{rows.length ? t("access.none") : t("access.default")}</option>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`access.role_${r}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Everyone: profile on the hub, two-factor sign-in, signing out other devices. */
export function MyAccountSection() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [me, setMe] = useState<{
    user: { displayName: string; twoFactor: boolean; avatar?: string };
    require2fa: boolean;
  }>();
  const [name, setName] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string }>();
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string>();
  const load = () => {
    api
      .teamWhoami()
      .then((m) => {
        setMe(m);
        setName(m.user.displayName);
      })
      .catch(() => undefined);
  };
  useEffect(load, []);
  if (!me) return null;
  return (
    <Section title={t("account.title")} hint={t("account.hint")}>
      <div className="space-y-4 text-[13px]">
        {me.require2fa && !me.user.twoFactor && (
          <p className="rounded-ui bg-warning-soft px-3 py-2 text-xs text-warning">{t("account.required2fa")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("team.displayName")}
            className={`${field} w-56`}
          />
          <input
            type="color"
            value={me.user.avatar?.startsWith("#") ? me.user.avatar : "#3b82f6"}
            onChange={(e) => void api.teamUpdateMe({ avatar: e.target.value }).then(load)}
            aria-label={t("account.color")}
            data-tip={t("account.color")}
            className="h-8 w-10 rounded-ui border border-border bg-bg"
          />
          <Button
            size="sm"
            disabled={!name.trim() || name === me.user.displayName}
            onClick={() => void api.teamUpdateMe({ displayName: name, language: settings.language }).then(load)}
          >
            {t("env.save")}
          </Button>
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-medium">
            <Smartphone size={14} aria-hidden="true" /> {t("account.twoFactor")}
            {me.user.twoFactor ? <Badge tone="success">{t("settings.on")}</Badge> : <Badge>{t("settings.off")}</Badge>}
          </p>
          {!me.user.twoFactor && !setup && (
            <Button
              size="sm"
              icon={ShieldCheck}
              onClick={() => void api.team2fa("start").then((r) => setSetup(r as { secret: string; uri: string }))}
            >
              {t("account.enable2fa")}
            </Button>
          )}
          {setup && (
            <div className="space-y-2 rounded-ui border border-border p-3 text-xs">
              <p>{t("account.scan")}</p>
              <code className="block font-mono text-[12px] tracking-wider select-all">
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
              <a href={setup.uri} className="text-accent hover:underline">
                {t("account.openApp")}
              </a>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  aria-label={t("account.code")}
                  className={`${field} w-28 font-mono`}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={code.length !== 6}
                  onClick={() =>
                    void api
                      .team2fa("confirm", { code })
                      .then(() => {
                        setSetup(undefined);
                        setCode("");
                        setNote(t("account.enabled"));
                        load();
                      })
                      .catch((err: Error) => setNote(err.message))
                  }
                >
                  {t("account.confirm")}
                </Button>
              </div>
            </div>
          )}
          {me.user.twoFactor && !me.require2fa && (
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                aria-label={t("account.code")}
                className={`${field} w-28 font-mono`}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={code.length !== 6}
                onClick={() =>
                  void api
                    .team2fa("disable", { code })
                    .then(() => {
                      setCode("");
                      load();
                    })
                    .catch((err: Error) => setNote(err.message))
                }
              >
                {t("account.disable2fa")}
              </Button>
            </div>
          )}
          {note && <p className="text-xs text-fg-muted">{note}</p>}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={LogOut}
          onClick={() =>
            window.confirm(t("account.signOutOthersConfirm")) &&
            void api.teamSignOutOthers().then((r) => setNote(t("account.signedOutOthers", { count: r.count })))
          }
        >
          {t("account.signOutOthers")}
        </Button>
      </div>
    </Section>
  );
}

/** Recovery key: it must be kept before the dialog can close (downloaded or copied). */
export function saveRecoveryFile(value: string): void {
  const url = URL.createObjectURL(
    new Blob(
      [
        `God Eye team recovery key\n\n${value}\n\nKeep this in a password manager. Anyone with it can read what your team shares.\n`,
      ],
      { type: "text/plain" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "god-eye-recovery-key.txt";
  a.click();
  URL.revokeObjectURL(url);
}
