import type { ChatChannel, SessionDetail } from "@igrek/core";
import { MessagesSquare, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useTeamPeople } from "../TeamAvatar";
import { Button, Dialog, field } from "../ui";

/**
 * From a Claude session to the team chat: a message in one of the project's channels (Igrek can
 * draft it from the session), and if asked a card on the board for a teammate.
 */
export function ShareToChat({ session }: { session: SessionDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const people = useTeamPeople();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channel, setChannel] = useState("");
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [task, setTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    void api
      .chatChannels()
      .then((list) => {
        if (!current) return;
        const mine = list.filter((c) => c.projectId === session.projectId);
        setChannels(mine);
        setChannel((c) => c || mine[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [open, session.projectId]);
  if (!people.status?.configured || session.author) return null;
  const draft = () => {
    setBusy(true);
    setError(undefined);
    void api
      .sessionChatDraft(session.id)
      .then((r) => setText(r.draft))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  const send = async () => {
    setError(undefined);
    try {
      await api.sessionToChat(session.id, { channel, text, assignee: assignee || undefined, task });
      setOpen(false);
      void navigate(`/chat?c=${encodeURIComponent(channel)}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const members = people.status.members;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={MessagesSquare}
        onClick={() => setOpen(true)}
        data-tip={t("teamChat.shareTip")}
      >
        <span className="hidden lg:inline">{t("teamChat.share")}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("teamChat.share")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("teamChat.shareTitle")}</h2>
          {channels.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("teamChat.notShared")}</p>
          ) : (
            <>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                aria-label={t("teamChat.channel")}
                className={cn(field, "w-full")}
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    # {c.name}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder={t("teamChat.sharePlaceholder")}
                  aria-label={t("teamChat.sharePlaceholder")}
                  className="w-full resize-y rounded-ui border border-border bg-bg p-2 text-[13px] outline-none focus:border-accent"
                />
                <Button size="sm" variant="ghost" icon={Sparkles} usesModel disabled={busy} onClick={draft}>
                  {busy ? t("briefing.writing") : t("teamChat.draft")}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={task} onChange={(e) => setTask(e.target.checked)} />
                {t("teamChat.alsoTask")}
              </label>
              {task && (
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  aria-label={t("teamChat.assignee")}
                  className={cn(field, "w-full")}
                >
                  <option value="">{t("teamChat.nobody")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.username} (@{m.username})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("teamChat.cancel")}
            </Button>
            <Button variant="primary" disabled={!text.trim() || !channel} onClick={() => void send()}>
              {t("teamChat.send")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
