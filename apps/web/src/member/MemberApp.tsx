import { KeyRound, LogOut, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui";
import type { MemberClient } from "./client";
import { GuestCall } from "./GuestCall";
import { useClient } from "./hooks";
import { field } from "./MemberBoard";
import { MemberShell } from "./MemberShell";

function SignIn({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const state = client.state.phase === "signedOut" ? client.state : undefined;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await client.signIn(username.trim(), password, code || undefined);
    setBusy(false);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto mt-24 max-w-sm space-y-3 px-4">
      <h1 className="flex items-center gap-2 text-[17px] font-semibold">
        <Logo className="size-7" /> {t("member.title")}
      </h1>
      <p className="text-xs text-fg-muted">{t("member.signInHint")}</p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t("member.username")}
        aria-label={t("member.username")}
        className={field}
        autoComplete="username"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("member.password")}
        aria-label={t("member.password")}
        className={field}
        autoComplete="current-password"
      />
      {state?.needs2fa && (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("member.code")}
          aria-label={t("member.code")}
          className={field}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={busy || !username || !password}>
        {t("member.signIn")}
      </Button>
    </form>
  );
}

function ChangePassword({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        client.changePassword(password).catch((err: Error) => setError(err.message));
      }}
      className="mx-auto mt-24 max-w-sm space-y-3 px-4"
    >
      <h1 className="text-[16px] font-semibold">{t("member.newPassword")}</h1>
      <p className="text-xs text-fg-muted">{t("member.newPasswordHint")}</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label={t("member.newPassword")}
        className={field}
        autoComplete="new-password"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={password.length < 8}>
        {t("member.save")}
      </Button>
    </form>
  );
}

function Waiting({ client, fingerprint }: { client: MemberClient; fingerprint: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-24 max-w-md space-y-3 px-4">
      <h1 className="flex items-center gap-2 text-[16px] font-semibold">
        <KeyRound size={17} className="text-warning" aria-hidden="true" /> {t("member.waitTitle")}
      </h1>
      <p className="text-[13px] text-fg-muted">{t("member.waitBody")}</p>
      <p className="font-mono text-[13px]">
        {t("member.fingerprint")}: <span className="rounded bg-bg-subtle px-1.5 py-0.5">{fingerprint}</span>
      </p>
      <div className="flex gap-2">
        <Button icon={RefreshCw} onClick={() => void client.resume()}>
          {t("member.retry")}
        </Button>
        <Button variant="ghost" icon={LogOut} onClick={() => void client.signOut()}>
          {t("member.signOut")}
        </Button>
      </div>
    </div>
  );
}

/** The web member's page (plan.md 4.3, 20.1): the team's work in the browser, as in Igrek. */
export function MemberApp({ client }: { client: MemberClient }) {
  useClient(client);
  // A guest's one-time link to a call: no sign-in, no team, just that call (plan.md 20.8).
  const guest = location.hash.match(/^#\/guest\/([^/]+)\/([^/]+)\/?(.*)$/);
  if (guest)
    return <GuestCall token={guest[1] ?? ""} meetingKey={guest[2] ?? ""} title={decodeURIComponent(guest[3] ?? "")} />;
  const s = client.state;
  if (s.phase === "signedOut") return <SignIn client={client} />;
  if (s.phase === "changePassword") return <ChangePassword client={client} />;
  if (s.phase === "waitingForKey") return <Waiting client={client} fingerprint={s.fingerprint} />;
  return <MemberShell client={client} />;
}
