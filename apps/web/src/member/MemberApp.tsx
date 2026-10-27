import { Hand, KeyRound, LogOut, RefreshCw, Shield } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { Badge, Button, Card, EmptyState, Segmented, StatusDot } from "../components/ui";
import type { MemberClient, MemberProject, MemberTask } from "./client";
import { MemberChat } from "./MemberChat";
import { SessionList, SessionView } from "./MemberSessions";

const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";

/** Re-renders whenever the client has something new; the version counter is all React needs to compare. */
function useClient(client: MemberClient): number {
  const [version] = useState(() => ({ n: 0 }));
  return useSyncExternalStore(
    (notify) =>
      client.subscribe(() => {
        version.n++;
        notify();
      }),
    () => version.n,
  );
}

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

function BoardView({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState("");
  const me = client.state.phase === "ready" ? client.state.user : undefined;
  const tasks = [...project.tasks.values()].filter((x) => !x.deleted);
  const take = (task: MemberTask, yes: boolean) =>
    client.claim(project.key, task.id, yes).catch((e: Error) => setError(e.message));
  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {me && me.role !== "viewer" && (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void client.addTask(project.key, title).then(() => setTitle(""));
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("member.newCard")}
            aria-label={t("member.newCard")}
            className={field}
          />
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {t("member.add")}
          </Button>
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        {(["todo", "doing", "review", "done"] as const).map((col) => (
          <section key={col} className="space-y-2 rounded-ui border border-border bg-bg-subtle p-2">
            <h3 className="text-[11.5px] font-semibold uppercase text-fg-muted">{t(`board.col_${col}`)}</h3>
            {tasks
              .filter((x) => x.status === col)
              .map((task) => (
                <Card key={task.id} className="space-y-2 p-2.5">
                  <p className="text-[13px] font-medium">{task.title}</p>
                  {task.claimedBy ? (
                    <p className="flex items-center gap-1.5 rounded-ui bg-bg-subtle px-1.5 py-1 text-[12px]">
                      <span className="flex size-5 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold">
                        {task.claimedBy.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">
                          {task.claimedBy.id === me?.id ? t("board.you") : task.claimedBy.name}
                        </span>{" "}
                        <span className="text-fg-muted">{t("board.onIt")}</span>
                      </span>
                      {me && task.claimedBy.id === me.id && (
                        <button
                          type="button"
                          onClick={() => void take(task, false)}
                          className="ms-auto text-[11px] text-fg-subtle hover:text-fg"
                        >
                          {t("board.release")}
                        </button>
                      )}
                    </p>
                  ) : (
                    me &&
                    me.role !== "viewer" && (
                      <button
                        type="button"
                        onClick={() => void take(task, true)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-ui border border-accent bg-accent-soft py-1 text-[12px] font-medium text-accent hover:bg-accent hover:text-white"
                      >
                        <Hand size={13} aria-hidden="true" /> {t("board.take")}
                      </button>
                    )
                  )}
                  {task.assignee && (
                    <p className="text-[11px] text-fg-muted">
                      <Badge>{task.assignee.name}</Badge>
                    </p>
                  )}
                </Card>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectView({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"sessions" | "chat" | "decisions" | "board">("sessions");
  const [session, setSession] = useState<string>();
  if (session)
    return <SessionView client={client} project={project} id={session} onBack={() => setSession(undefined)} />;
  const open = [...project.tasks.values()].filter((x) => !x.deleted && x.status !== "done").length;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">{project.name}</h2>
          <p className="text-[12.5px] text-fg-subtle">
            {t("member.stats", { sessions: project.sessions.size, count: open })}
          </p>
        </div>
        <Segmented
          label={project.name}
          value={tab}
          onChange={setTab}
          options={[
            { value: "sessions", label: t("member.sessions") },
            { value: "chat", label: t("member.chat") },
            { value: "board", label: t("member.board") },
            { value: "decisions", label: t("member.decisions") },
          ]}
        />
      </header>
      {tab === "sessions" && <SessionList project={project} onOpen={setSession} />}
      {tab === "chat" && <MemberChat client={client} project={project} />}
      {tab === "decisions" && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
          {[...project.memory.values()]
            .filter((m) => m.status !== "rejected")
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((m) => (
              <li key={m.id} className="flex items-start gap-2 px-4 py-2.5 text-[13px]">
                <Badge>{t(`memory.${m.section}`, { defaultValue: m.section })}</Badge>
                <span className="min-w-0 flex-1">{m.text}</span>
                <span className="shrink-0 text-[11px] text-fg-subtle">{m.author}</span>
              </li>
            ))}
          {project.memory.size === 0 && (
            <li className="px-4 py-6 text-center text-xs text-fg-subtle">{t("member.nothingYet")}</li>
          )}
        </ul>
      )}
      {tab === "board" && <BoardView client={client} project={project} />}
    </div>
  );
}

function Ready({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  if (client.state.phase !== "ready") return null;
  const { user, connected } = client.state;
  const projects = [...client.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const project = projects.find((p) => p.key === selected) ?? projects[0];
  return (
    <div className="min-h-screen bg-bg-subtle">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-bg px-4">
        <Logo />
        <span className="text-[14px] font-semibold tracking-tight">{t("member.title")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11.5px] text-fg-muted">
          <StatusDot tone={connected ? "success" : "warning"} />
          {connected ? t("member.live") : t("member.offline")}
        </span>
        {client.online.size > 0 && (
          <span
            className="hidden text-[11.5px] text-fg-subtle sm:inline"
            title={[...client.online].map((id) => client.nameOf(id)).join(", ")}
          >
            {t("member.online", { count: client.online.size })}
          </span>
        )}
        <div className="flex-1" />
        <span className="hidden text-[12.5px] font-medium sm:inline">{user.displayName}</span>
        <Badge>{t(`member.role_${user.role}`)}</Badge>
        <Button
          size="sm"
          variant="ghost"
          icon={LogOut}
          aria-label={t("member.signOut")}
          onClick={() => void client.signOut()}
        />
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:flex-row md:p-6">
        <nav aria-label={t("member.projects")} className="shrink-0 md:w-56">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("member.projects")}
          </p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {projects.map((p) => (
              <li key={p.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelected(p.key)}
                  aria-current={p.key === project?.key ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-start text-[13px] ${p.key === project?.key ? "bg-bg font-medium shadow-sm ring-1 ring-border" : "text-fg-muted hover:bg-bg-hover"}`}
                >
                  <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          {project ? (
            <ProjectView key={project.key} client={client} project={project} />
          ) : (
            <EmptyState icon={Shield} title={t("member.noProjects")} body={t("member.noProjectsBody")} />
          )}
        </main>
      </div>
    </div>
  );
}

/** The web member's page (plan.md 4.3): read the team's work in the browser, comment, take cards. */
export function MemberApp({ client }: { client: MemberClient }) {
  useClient(client);
  const s = client.state;
  if (s.phase === "signedOut") return <SignIn client={client} />;
  if (s.phase === "changePassword") return <ChangePassword client={client} />;
  if (s.phase === "waitingForKey") return <Waiting client={client} fingerprint={s.fingerprint} />;
  return <Ready client={client} />;
}
