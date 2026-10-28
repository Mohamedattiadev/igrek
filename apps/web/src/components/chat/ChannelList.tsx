import type { ChatChannel, TeamMember } from "@igrek/core";
import { Activity, FolderKanban, Hash, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { TeamAvatar } from "../TeamAvatar";
import { Button, Dialog, field } from "../ui";

function NewChannel({
  projects,
  open,
  onClose,
  onMade,
}: {
  projects: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onMade: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string>();
  const make = async () => {
    setError(undefined);
    try {
      const { id } = await api.createChannel({ projectId: projectId || (projects[0]?.id ?? ""), name, topic });
      setName("");
      setTopic("");
      onMade(id);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={t("teamChat.newChannel")}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void make();
        }}
      >
        <h2 className="text-[15px] font-semibold">{t("teamChat.newChannel")}</h2>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.project")}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={cn(field, "w-full")}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.channelName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teamChat.channelNameHint")}
            className={cn(field, "w-full")}
            autoFocus
          />
        </label>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.topic")}</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("teamChat.topicHint")}
            className={cn(field, "w-full")}
          />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t("teamChat.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            {t("teamChat.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Each teammate, for a direct conversation sealed for the two of you; unread ones bold with their count. */
function DirectList({
  people,
  selected,
  onPick,
}: {
  people: { member: TeamMember; unread: number }[];
  selected?: string;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!people.length) return null;
  return (
    <section>
      <h2 className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {t("teamChat.direct")}
      </h2>
      <ul>
        {people.map(({ member, unread }) => {
          const id = `dm:${member.id}`;
          return (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                aria-current={selected === id ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px]",
                  selected === id ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover",
                  unread > 0 && selected !== id && "font-semibold text-fg",
                )}
              >
                <TeamAvatar member={member} size={18} />
                <span className="min-w-0 flex-1 truncate">{member.displayName || member.username}</span>
                {unread > 0 && selected !== id && (
                  <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-white">{unread}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Channels grouped by project, like a Slack sidebar, then direct messages: unread ones bold with their count. */
export function ChannelList({
  channels,
  people = [],
  selected,
  timeline,
  onTimeline,
  onPick,
  onMade,
}: {
  channels: ChatChannel[];
  people?: { member: TeamMember; unread: number }[];
  selected?: string;
  timeline: boolean;
  onTimeline: () => void;
  onPick: (id: string) => void;
  onMade: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [making, setMaking] = useState(false);
  const projects = [...new Map(channels.map((c) => [c.projectId, { id: c.projectId, name: c.project }])).values()];
  return (
    <nav aria-label={t("teamChat.channels")} className="flex h-full flex-col">
      <div className="px-2 pt-3">
        <button
          type="button"
          onClick={onTimeline}
          aria-current={timeline ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-ui px-2 py-1.5 text-start text-[13px] font-medium",
            timeline ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover",
          )}
        >
          <Activity size={14} aria-hidden="true" />
          {t("timeline.title")}
        </button>
      </div>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t("teamChat.channels")}</h2>
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() => setMaking(true)}
          aria-label={t("teamChat.newChannel")}
          data-tip={t("teamChat.newChannel")}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {projects.map((p) => (
          <section key={p.id}>
            <h3 className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-fg-muted">
              <FolderKanban size={12} aria-hidden="true" />
              <span className="truncate">{p.name}</span>
            </h3>
            <ul>
              {channels
                .filter((c) => c.projectId === p.id)
                .map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c.id)}
                      aria-current={!timeline && selected === c.id ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-ui px-2 py-1 text-start text-[13px]",
                        !timeline && selected === c.id
                          ? "bg-accent-soft text-accent"
                          : "text-fg-muted hover:bg-bg-hover",
                        c.unread > 0 && selected !== c.id && "font-semibold text-fg",
                      )}
                    >
                      <Hash size={13} className="shrink-0 opacity-70" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.unread > 0 && selected !== c.id && (
                        <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-white">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <DirectList people={people} selected={timeline ? undefined : selected} onPick={onPick} />
      </div>
      <NewChannel
        projects={projects}
        open={making}
        onClose={() => setMaking(false)}
        onMade={(id) => {
          setMaking(false);
          onMade(id);
        }}
      />
    </nav>
  );
}
