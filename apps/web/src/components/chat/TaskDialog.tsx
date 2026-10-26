import type { ChatMessage, TeamMember } from "@igrek/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button, Dialog, field } from "../ui";

/** The first teammate a message names is who the card is for, unless someone else is picked. */
function namedIn(text: string, members: TeamMember[]): string {
  const name = text.match(/(?:^|\s)@([\w.-]{2,32})/g)?.map((m) => m.trim().slice(1).toLowerCase()) ?? [];
  return members.find((m) => name.includes(m.username.toLowerCase()))?.id ?? "";
}

/** A message becomes a card on the project's board, for one teammate. */
export function TaskDialog({
  message,
  members,
  onClose,
}: {
  message?: ChatMessage;
  members: TeamMember[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const firstLine = (message?.text.split("\n")[0] ?? "").replace(/(?:^|\s)@[\w.-]+/g, " ").trim();
  const [title, setTitle] = useState(firstLine);
  const [assignee, setAssignee] = useState(message ? namedIn(message.text, members) : "");
  const [error, setError] = useState<string>();
  const make = async () => {
    if (!message) return;
    try {
      await api.messageToTask(message.id, { title, assignee: assignee || undefined });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={!!message} onClose={onClose} label={t("teamChat.toTask")}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void make();
        }}
      >
        <h2 className="text-[15px] font-semibold">{t("teamChat.toTask")}</h2>
        <p className="text-[12.5px] text-fg-muted">{t("teamChat.toTaskHint")}</p>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.taskTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={cn(field, "w-full")} />
        </label>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.assignee")}</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cn(field, "w-full")}>
            <option value="">{t("teamChat.nobody")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName || m.username} (@{m.username})
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t("teamChat.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={!title.trim()}>
            {t("teamChat.addCard")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
