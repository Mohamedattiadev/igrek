import { Check, Hand, KeyRound, LogOut, MessageSquare, RefreshCw, Shield } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { Badge, Button, Card, EmptyState, Segmented, StatusDot } from "../components/ui";
import { relativeTime } from "../lib/format";
import type { MemberClient, MemberProject, MemberTask } from "./client";

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

function Comments({
  client,
  project,
  kind,
  id,
}: {
  client: MemberClient;
  project: MemberProject;
  kind: string;
  id: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const list = [...project.comments.values()]
    .filter((c) => c.targetKind === kind && c.targetId === id)
    .sort((a, b) => a.at - b.at);
  const viewer = client.state.phase === "ready" && client.state.user.role === "viewer";
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
        <MessageSquare size={14} aria-hidden="true" /> {t("member.comments")}
      </h3>
      {list.map((c) => (
        <p key={c.id} className="text-[13px]">
          <span className="font-medium">{c.author}</span>{" "}
          <span className="text-[11px] text-fg-subtle">{relativeTime(c.at)}</span>
          <br />
          {c.text}
        </p>
      ))}
      {!viewer && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void client.comment(project.key, kind, id, text.trim()).then(() => setText(""));
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("member.commentPlaceholder")}
            aria-label={t("member.commentPlaceholder")}
            className={field}
          />
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            {t("member.send")}
          </Button>
        </form>
      )}
    </div>
  );
}

function SessionView({
  client,
  project,
  id,
  onBack,
}: {
  client: MemberClient;
  project: MemberProject;
  id: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const s = project.sessions.get(id);
  if (!s) return null;
  const messages = (project.messages.get(id) ?? []).filter((m) => m.kind !== "tool");
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-[12px] text-accent hover:underline">
        ← {t("member.sessions")}
      </button>
      <h2 className="text-[15px] font-semibold">{s.summary?.title || s.title || s.id.slice(0, 8)}</h2>
      <p className="text-[11.5px] text-fg-subtle">
        {s.author} · {s.tool} · {relativeTime(s.updatedAt)}
      </p>
      {s.summary?.summary && <Card className="p-pad text-[13px]">{s.summary.summary}</Card>}
      {messages.length > 0 ? (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "rounded-ui bg-accent-soft/40 p-2 text-[13px]" : "p-2 text-[13px]"}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">{t("member.summaryOnly")}</p>
      )}
      <Comments client={client} project={project} kind="session" id={id} />
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
                <Card key={task.id} className="space-y-1 p-2">
                  <p className="text-[13px] font-medium">{task.title}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
                    {task.claimedBy && <span className="font-medium text-fg">{task.claimedBy.name}</span>}
                    {task.assignee && <Badge>{task.assignee.name}</Badge>}
                    {me && me.role !== "viewer" && !task.claimedBy && (
                      <button
                        type="button"
                        onClick={() => void take(task, true)}
                        className="inline-flex items-center gap-0.5 text-accent hover:underline"
                      >
                        <Hand size={11} aria-hidden="true" /> {t("board.take")}
                      </button>
                    )}
                    {me && task.claimedBy?.id === me.id && (
                      <button
                        type="button"
                        onClick={() => void take(task, false)}
                        className="text-accent hover:underline"
                      >
                        {t("board.release")}
                      </button>
                    )}
                  </p>
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
  const [tab, setTab] = useState<"sessions" | "decisions" | "board">("sessions");
  const [session, setSession] = useState<string>();
  const sessions = [...project.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (session)
    return <SessionView client={client} project={project} id={session} onBack={() => setSession(undefined)} />;
  return (
    <div className="space-y-3">
      <h2 className="text-[16px] font-semibold">{project.name}</h2>
      <Segmented
        label={project.name}
        value={tab}
        onChange={setTab}
        options={[
          { value: "sessions", label: t("member.sessions") },
          { value: "decisions", label: t("member.decisions") },
          { value: "board", label: t("member.board") },
        ]}
      />
      {tab === "sessions" &&
        (sessions.length ? (
          <ul className="divide-y divide-border rounded-ui border border-border">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSession(s.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {s.summary?.title || s.title || s.id.slice(0, 8)}
                  </span>
                  <span className="text-[11px] text-fg-subtle">
                    {s.author} · {relativeTime(s.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-subtle">{t("member.nothingYet")}</p>
        ))}
      {tab === "decisions" && (
        <ul className="space-y-1.5">
          {[...project.memory.values()]
            .filter((m) => m.status !== "rejected")
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((m) => (
              <li key={m.id} className="text-[13px]">
                <Badge>{t(`memory.${m.section}`, { defaultValue: m.section })}</Badge> {m.text}
                <span className="ms-1 text-[11px] text-fg-subtle">· {m.author}</span>
              </li>
            ))}
          {project.memory.size === 0 && <li className="text-xs text-fg-subtle">{t("member.nothingYet")}</li>}
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
    <div className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Logo />
        <span className="text-[13.5px] font-semibold">{t("member.title")}</span>
        <StatusDot tone={connected ? "success" : "warning"} />
        <span className="text-[11.5px] text-fg-subtle">{connected ? t("member.live") : t("member.offline")}</span>
        {client.online.size > 0 && (
          <span
            className="text-[11.5px] text-fg-subtle"
            title={[...client.online].map((id) => client.nameOf(id)).join(", ")}
          >
            · {t("member.online", { count: client.online.size })}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[12.5px]">{user.displayName}</span>
        <Badge>{t(`member.role_${user.role}`)}</Badge>
        <Button
          size="sm"
          variant="ghost"
          icon={LogOut}
          aria-label={t("member.signOut")}
          onClick={() => void client.signOut()}
        />
      </header>
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <nav aria-label={t("member.projects")} className="shrink-0 space-y-1 md:w-56">
          <p className="text-[11px] font-semibold uppercase text-fg-subtle">{t("member.projects")}</p>
          {projects.map((p) => (
            <button
              type="button"
              key={p.key}
              onClick={() => setSelected(p.key)}
              className={`flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-start text-[13px] ${p.key === project?.key ? "bg-bg-active font-medium" : "hover:bg-bg-hover"}`}
            >
              {p.key === project?.key && <Check size={12} aria-hidden="true" />}
              {p.name}
            </button>
          ))}
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
