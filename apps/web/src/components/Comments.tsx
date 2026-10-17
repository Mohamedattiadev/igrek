import { MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { useTeamPeople } from "./TeamAvatar";
import { TeamText } from "./TeamText";
import { Button, Card } from "./ui";

interface CommentRow {
  id: string;
  author?: string;
  authorId?: string;
  mine: boolean;
  text: string;
  at: number;
}

/** Comments with @mentions on a session, decision or section (plan.md 4.4). Shared with the team like the rest of the project. */
export function Comments({
  projectId,
  kind,
  id,
}: {
  projectId: string;
  kind: "session" | "memory" | "section" | "channel";
  id: string;
}) {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const load = () => {
    api
      .comments(kind, id)
      .then(setRows)
      .catch(() => undefined);
  };
  useEffect(load, [kind, id]);
  useServerEvent("sessions-changed", load);
  useServerEvent("team-changed", load);
  if (!people.status?.configured) return null;
  const mention = text.match(/@([\w.-]*)$/)?.[1];
  const matches =
    mention !== undefined
      ? (people.status?.members ?? [])
          .filter((m) => m.username.toLowerCase().startsWith(mention.toLowerCase()))
          .slice(0, 5)
      : [];
  const send = () => {
    if (!text.trim()) return;
    void api.addComment({ projectId, targetKind: kind, targetId: id, text }).then(() => {
      setText("");
      load();
    });
  };
  return (
    <Card className="space-y-2 p-pad">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        <MessageSquare size={12} aria-hidden="true" /> {t("comments.title")}
      </h3>
      <div className={kind === "channel" ? "max-h-[50vh] space-y-2 overflow-auto" : "space-y-2"}>
        {rows.map((r) => (
          <div key={r.id} className="text-[13px]">
            <span className="font-medium">{r.mine ? t("team.you") : r.author}</span>
            <span className="ms-2 text-[11px] text-fg-subtle">{relativeTime(r.at)}</span>
            <p className="whitespace-pre-wrap text-fg-muted">
              <TeamText text={r.text} authorId={r.authorId} />
            </p>
          </div>
        ))}
      </div>
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setText(text.replace(/@[\w.-]*$/, `@${m.username} `));
                input.current?.focus();
              }}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-accent"
            >
              @{m.username}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={t("comments.placeholder")}
          aria-label={t("comments.placeholder")}
          className="min-h-8 flex-1 resize-none rounded-ui border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent"
        />
        <Button size="sm" icon={Send} disabled={!text.trim()} onClick={send} aria-label={t("comments.send")} />
      </div>
    </Card>
  );
}
