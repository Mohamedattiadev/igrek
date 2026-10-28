import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui";
import { relativeTime } from "../lib/format";
import type { MemberClient } from "./client";
import type { MemberProject } from "./model";

const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";

/** Comments on a session, a decision or a card, like in Igrek; viewers only read them. */
export function MemberComments({
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
            void client.comment(project.key, { kind, id }, text).then(() => setText(""));
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
