import { Building2, House, type LucideIcon, Menu, MessagesSquare, Network, Shield } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { EmptyState, StatusDot } from "../components/ui";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import i18n, { loadBundled } from "../lib/i18n";
import type { MemberClient, MemberNotice } from "./client";
import { useNarrow, useRoute } from "./hooks";
import { MemberChat } from "./MemberChat";
import { MemberCompany } from "./MemberCompany";
import { MemberHome, myCards } from "./MemberHome";
import { PersonAvatar } from "./MemberMessage";
import { MemberOrg } from "./MemberOrg";
import { MemberProfile } from "./MemberProfile";
import { MemberProjectPage } from "./MemberProject";
import { channelsOf } from "./model";

/** Unread messages in every channel and direct talk, for the badges and the tab's title. */
function unreadTotal(client: MemberClient): number {
  let n = 0;
  for (const p of client.projects.values()) for (const c of channelsOf(p)) n += client.unreadIn(p, c.id);
  for (const id of client.members.keys()) n += client.unreadDirect(id);
  return n;
}

function Item({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
  lead,
}: {
  icon?: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
  lead?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded-ui px-2.5 text-[13px] transition-colors",
        active ? "bg-bg-active font-medium text-accent-hover" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
      )}
    >
      {lead ?? (Icon && <Icon size={18} strokeWidth={1.75} className="shrink-0" />)}
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      {!!badge && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-strong">
          {badge}
        </span>
      )}
    </button>
  );
}

/** The strip on the left, laid out like Igrek's: the main pages, the projects, the profile at the bottom. */
function Sidebar({
  client,
  route,
  go,
  drawer,
}: {
  client: MemberClient;
  route: string;
  go: (to: string) => void;
  drawer: boolean;
}) {
  const { t } = useTranslation();
  const me = client.me();
  const projects = [...client.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const [page, key] = route.split("/");
  return (
    <nav
      aria-label={t("nav.menu")}
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-e border-border bg-bg-subtle py-2",
        drawer ? "fixed inset-y-0 start-0 z-50 w-64 shadow-ui px-2" : "w-48 items-stretch px-2",
      )}
    >
      <div className="mb-2 flex h-9 shrink-0 items-center gap-2 px-2" aria-hidden>
        <Logo />
        <span className="text-[14px] font-semibold tracking-tight">Igrek</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Item
          icon={House}
          label={t("member.home")}
          active={page === "home"}
          badge={myCards(client).length}
          onClick={() => go("home")}
        />
        <Item
          icon={MessagesSquare}
          label={t("member.chat")}
          active={page === "chat"}
          badge={unreadTotal(client)}
          onClick={() => go("chat")}
        />
        <Item icon={Network} label={t("nav.org")} active={page === "org"} onClick={() => go("org")} />
        {me?.role === "admin" && (
          <Item icon={Building2} label={t("company.title")} active={page === "company"} onClick={() => go("company")} />
        )}
        <p className="px-2.5 pt-3 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">
          {t("member.projects")}
        </p>
        {projects.map((p) => (
          <Item
            key={p.key}
            label={p.name}
            active={page === "project" && key === p.key}
            onClick={() => go(`project/${p.key}`)}
            lead={
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[10.5px] font-semibold text-accent">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            }
          />
        ))}
      </div>
      <div className="flex shrink-0 gap-0.5 border-t border-border pt-2">
        {me && (
          <Item
            label={me.displayName}
            active={page === "profile"}
            onClick={() => go("profile")}
            lead={<PersonAvatar client={client} id={me.id} size={20} />}
          />
        )}
      </div>
    </nav>
  );
}

function TopBar({ client, onMenu }: { client: MemberClient; onMenu?: () => void }) {
  const { t } = useTranslation();
  const connected = client.state.phase === "ready" && client.state.connected;
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-bg px-3">
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label={t("nav.menu")}
          className="flex size-8 shrink-0 items-center justify-center rounded-ui text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}
      <span className="text-[14px] font-semibold tracking-tight">{t("member.title")}</span>
      <div className="flex-1" />
      {client.online.size > 0 && (
        <span
          className="hidden text-[11.5px] text-fg-subtle sm:inline"
          title={[...client.online].map((id) => client.nameOf(id)).join(", ")}
        >
          {t("member.online", { count: client.online.size })}
        </span>
      )}
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11.5px] text-fg-muted"
        title={
          client.checked
            ? client.checked.matches
              ? t("sync.matchesTip", { when: relativeTime(client.checked.at) })
              : t("sync.repairing", { count: client.checked.repaired })
            : undefined
        }
      >
        <StatusDot tone={connected && !client.waiting() ? "success" : "warning"} />
        {/* Sync health on the screen (plan.md 20.10): live, or what waits for the hub. */}
        {client.waiting()
          ? t("org.waitingSync", { count: client.waiting() })
          : connected
            ? t("member.live")
            : t("member.offline")}
      </span>
    </header>
  );
}

/** Where a notice leads: a card's board, a meeting, the company's cards or channels, or a chat. */
function routeOf(open: string): string {
  if (open.startsWith("project:")) return `project/${open.slice(8)}/board`;
  if (open.startsWith("org:meet:")) return `org/meetings/${open.slice(9)}`;
  if (open.startsWith("org:")) return `org/${open === "org:cards" ? "cards" : "channels"}`;
  return `chat/${open}`;
}

/** A browser notice for a message to me while I look elsewhere; a click opens it. */
function useNotices(client: MemberClient, route: string, go: (to: string) => void): void {
  useEffect(() => {
    client.onNotice = (n: MemberNotice) => {
      const here = route === `chat/${n.open}` && document.visibilityState === "visible";
      if (here || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const body = n.body.startsWith("meet:") ? i18n.t(`meet.notice_${n.body.slice(5)}`) : n.body;
      const notice = new Notification(n.title, { body, tag: n.open });
      notice.onclick = () => {
        window.focus();
        go(routeOf(n.open));
      };
    };
    return () => {
      client.onNotice = () => undefined;
    };
  }, [client, route, go]);
}

function Page({
  client,
  route,
  go,
  narrow,
}: {
  client: MemberClient;
  route: string;
  go: (to: string) => void;
  narrow: boolean;
}) {
  const { t } = useTranslation();
  const [page, ...rest] = route.split("/");
  if (page === "chat")
    return (
      <MemberChat
        client={client}
        open={rest.join("/") || undefined}
        onOpen={(k) => go(k ? `chat/${k}` : "chat")}
        narrow={narrow}
      />
    );
  if (page === "project") {
    const project = client.projects.get(rest[0] ?? "");
    if (!project) return <EmptyState icon={Shield} title={t("member.noProjects")} body={t("member.noProjectsBody")} />;
    return (
      <MemberProjectPage
        key={project.key}
        client={client}
        project={project}
        tab={rest[1]}
        onTab={(tab) => go(`project/${project.key}/${tab}`)}
      />
    );
  }
  if (page === "org") return <MemberOrg client={client} tab={rest[0]} meeting={rest[1]} go={go} />;
  if (page === "company" && client.me()?.role === "admin") return <MemberCompany client={client} />;
  if (page === "profile") return <MemberProfile client={client} />;
  return <MemberHome client={client} go={go} />;
}

/** The web member's page once ready (plan.md 20.1): Igrek's layout, its pages, in the browser. */
export function MemberShell({ client }: { client: MemberClient }) {
  const narrow = useNarrow();
  const [route, go] = useRoute();
  const [drawer, setDrawer] = useState(false);
  const unread = unreadTotal(client);
  const language = client.me()?.language;
  useNotices(client, route, go);
  useEffect(() => {
    document.title = unread ? `(${unread}) Igrek Team` : "Igrek Team";
  }, [unread]);
  // The language the person chose (in Igrek or here) wins over the browser's, once known.
  useEffect(() => {
    const code = language?.split("-")[0];
    if (code && (code === "en" || code === "tr") && !i18n.language.startsWith(code))
      void loadBundled(code).then(() => i18n.changeLanguage(code));
  }, [language]);
  // The drawer closes when the page changes (also by the back button) and with Esc.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new route is the reason to close it
  useEffect(() => setDrawer(false), [route]);
  useEffect(() => {
    if (!drawer) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [drawer]);
  const pick = (to: string) => {
    setDrawer(false);
    go(to);
  };
  return (
    <div className="flex h-full bg-bg">
      {!narrow && <Sidebar client={client} route={route} go={pick} drawer={false} />}
      {narrow && drawer && (
        <>
          <button
            type="button"
            aria-label={i18n.t("helper.close")}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setDrawer(false)}
          />
          <Sidebar client={client} route={route} go={pick} drawer />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar client={client} onMenu={narrow ? () => setDrawer(true) : undefined} />
        <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg-subtle">
          <Page client={client} route={route} go={pick} narrow={narrow} />
        </main>
      </div>
    </div>
  );
}
