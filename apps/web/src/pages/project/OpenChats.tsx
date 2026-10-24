import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ChatPill } from "../../components/ChatPill";
import { Card } from "../../components/ui";
import { shownTitle } from "../../lib/chat";
import { useChats } from "../../lib/live";

/**
 * The project's chats that are open in Igrek, above its sessions: a chat only becomes a session once
 * Claude has answered in it, and a tester who had just opened one could not find it here.
 */
export function OpenChats({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const chats = useChats().filter((chat) => chat.projectId === projectId);
  if (chats.length === 0) return null;
  return (
    <section aria-labelledby="open-chats" className="space-y-2">
      <h2 id="open-chats" className="text-[13px] font-semibold">
        {t("project.openChats")}
      </h2>
      <Card>
        <div className="divide-y divide-border">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              to={`/c/${chat.id}`}
              data-nav-item
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
            >
              <MessageSquare size={15} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{shownTitle(chat.title, t)}</span>
              <ChatPill chat={chat} />
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
