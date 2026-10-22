import { useEffect, useState } from "react";
import { LoadError } from "../components/LoadError";
import { api } from "../lib/api";
import { ChiefChat } from "./Chat";

/** "/chief": the chief's one chat (started, or continued from its last session), right here. */
export function ChiefPage() {
  const [chatId, setChatId] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts it again after an error
  useEffect(() => {
    let current = true;
    api
      .chief()
      .then((chat) => current && setChatId(chat.id))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [attempt]);
  if (chatId) return <ChiefChat chatId={chatId} />;
  return <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />;
}
