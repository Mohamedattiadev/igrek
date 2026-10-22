import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LoadError } from "../components/LoadError";
import { api } from "../lib/api";

/** "/chief": opens the chief's one chat (started, or continued from its last session) and goes there. */
export function ChiefPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts it again after an error
  useEffect(() => {
    let current = true;
    api
      .chief()
      .then((chat) => current && void navigate(`/c/${chat.id}`, { replace: true }))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [attempt]);
  return <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />;
}
