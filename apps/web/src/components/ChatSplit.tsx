import type { ChatInfo } from "@igrek/core";
import { MessageSquare, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { shownTitle } from "../lib/chat";
import { relativeTime } from "../lib/format";
import { Button, Dialog } from "./ui";

/**
 * Which chat goes beside this one: a new chat in the same project, or one that is already open
 * (any project). Comparing two answers, or one chat planning while the other builds.
 */
export function SplitPicker({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onPick: (chatId: string) => void;
}) {
  const { t } = useTranslation();
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Closed and opened again quickly: only the latest list may land.
    let current = true;
    api
      .chats()
      .then((list) => current && setChats(list))
      .catch(() => current && setChats([]));
    return () => {
      current = false;
    };
  }, [open]);
  const here = chats.find((c) => c.id === current);
  const others = chats
    .filter((c) => c.id !== current && c.status !== "exited")
    .sort((a, b) => b.startedAt - a.startedAt);
  const fresh = async () => {
    if (!here) return;
    setBusy(true);
    try {
      onPick((await api.startChat({ projectId: here.projectId, mode: here.mode })).id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={t("chat.splitTitle")}>
      <div className="space-y-3 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">{t("chat.splitTitle")}</h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">{t("chat.splitHint")}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={fresh} disabled={!here || busy}>
          {t("chat.splitNew")}
        </Button>
        {others.length > 0 && (
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t("chat.splitOpen")}</h3>
            {others.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => onPick(chat.id)}
                className="flex w-full items-center gap-2.5 rounded-ui px-2 py-1.5 text-start hover:bg-bg-hover"
              >
                <MessageSquare size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{shownTitle(chat.title, t)}</span>
                  <span className="block truncate text-[11.5px] text-fg-muted">
                    {chat.cwd.split("/").pop()} · {relativeTime(chat.startedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
