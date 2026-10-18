import type { ChatInfo, ChatPill as Pill } from "@godeye/core";
import { useTranslation } from "react-i18next";
import { Badge } from "./ui";

/** Most urgent first (plan.md 16.3). */
export const PILL_ORDER: Pill[] = ["approval", "question", "working", "plan", "done"];
const TONE = { approval: "warning", question: "accent", working: "success", plan: "accent", done: "neutral" } as const;

/** What a chat needs at a glance: a step to approve, a question to answer, working, a plan, an unseen answer. */
export function ChatPill({ chat }: { chat: ChatInfo }) {
  const { t } = useTranslation();
  if (!chat.pill) return <span className="text-[11px] text-fg-subtle">{t(`chat.${chat.status}`)}</span>;
  return (
    <Badge tone={TONE[chat.pill]}>
      {chat.pill === "working" && <span className="me-1 size-1.5 animate-pulse rounded-full bg-current" />}
      {t(`chat.pill_${chat.pill}`)}
    </Badge>
  );
}

/** Chats that wait for the user, most urgent first. */
export function needsYou(chats: ChatInfo[]): ChatInfo[] {
  return chats
    .filter((c) => c.pill && c.pill !== "working")
    .sort((a, b) => PILL_ORDER.indexOf(a.pill as Pill) - PILL_ORDER.indexOf(b.pill as Pill));
}
