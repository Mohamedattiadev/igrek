import { FileText, Hash, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { request } from "../lib/api";
import { cn } from "../lib/cn";
import { useServerEvent } from "../lib/live";
import { Comments } from "./Comments";
import { Markdown } from "./Markdown";
import { Button, Card, EmptyState } from "./ui";

interface Channel {
  id: string;
  projectId: string;
  project: string;
  name: string;
  last: number;
  unread: number;
  messages: number;
}

/**
 * Team chat (plan.md 13.3): channels per shared project, end-to-end encrypted like every team
 * message, so WhatsApp isn't needed for the work. "What did we talk about" sums up a channel.
 */
export function TeamChat() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>();
  const [newName, setNewName] = useState("");
  const [summary, setSummary] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      void request<Channel[]>("/api/channels")
        .then(setChannels)
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  useServerEvent("sessions-changed", load);
  const selected = channels?.find((c) => c.id === params.get("channel")) ?? channels?.[0];
  if (channels && !channels.length)
    return <EmptyState icon={Hash} title={t("chatTeam.emptyTitle")} body={t("chatTeam.emptyBody")} />;
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <nav className="shrink-0 space-y-1 md:w-56" aria-label={t("chatTeam.channels")}>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {(channels ?? []).map((c) => (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSummary(undefined);
                  setParams({ channel: c.id }, { replace: true });
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-ui px-2.5 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                  selected?.id === c.id && "bg-bg-active font-medium",
                )}
              >
                <Hash size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {c.name} <span className="text-xs font-normal text-fg-subtle">{c.project}</span>
                </span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{c.unread}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName
                .trim()
                .toLowerCase()
                .replace(/[^\p{L}\p{N}-]+/gu, "-")
                .slice(0, 30);
              if (!name) return;
              setNewName("");
              setParams({ channel: `${selected.projectId}:${name}` }, { replace: true });
              setChannels((list) =>
                list?.some((c) => c.id === `${selected.projectId}:${name}`)
                  ? list
                  : [
                      ...(list ?? []),
                      { ...selected, id: `${selected.projectId}:${name}`, name, last: 0, unread: 0, messages: 0 },
                    ],
              );
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("chatTeam.newChannel", { project: selected.project })}
              aria-label={t("chatTeam.newChannel", { project: selected.project })}
              className="h-7 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2 text-xs outline-none focus:border-accent"
            />
            <Button size="sm" type="submit" icon={Plus} aria-label={t("chatTeam.add")} />
          </form>
        )}
      </nav>
      {selected && (
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[13px] font-semibold">
              # {selected.name} <span className="font-normal text-fg-muted">· {selected.project}</span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              icon={FileText}
              disabled={busy || !selected.messages}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  setSummary(
                    (
                      await request<{ summary: string }>(`/api/channels/${encodeURIComponent(selected.id)}/summary`, {
                        method: "POST",
                        body: "{}",
                      })
                    ).summary,
                  );
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t("briefing.writing") : t("chatTeam.summary")}
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          {summary && (
            <Card className="p-pad text-[13px]">
              <Markdown text={summary} className="prose-igrek" />
            </Card>
          )}
          <Comments key={selected.id} projectId={selected.projectId} kind="channel" id={selected.id} />
        </div>
      )}
    </div>
  );
}
