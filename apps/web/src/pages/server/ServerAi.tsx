import type { ServerInfo } from "@igrek/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadError } from "../../components/LoadError";
import { api } from "../../lib/api";
import { ChiefChat } from "../Chat";

/**
 * The server's own AI chat: one thread per server that goes on where it stopped, with the chief's
 * tools. It reads the server freely; every change it wants waits for the user's approval (index.ts
 * tells it so in the thread's note).
 */
export function ServerAi({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const [chatId, setChatId] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` opens it again after an error
  useEffect(() => {
    let current = true;
    setError(undefined);
    api
      .chief(`server:${server.id}`)
      .then((chat) => current && setChatId(chat.id))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [server.id, attempt]);
  if (!chatId) return <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />;
  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-96 flex-col overflow-hidden rounded-ui border border-border">
      <ChiefChat key={chatId} chatId={chatId} draft={t("serverFix.aiDraft", { name: server.name })} />
    </div>
  );
}
