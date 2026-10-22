import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Button } from "./ui";

/**
 * One click when Claude's limit is spent: the chat goes on in Codex, in a terminal here, with what
 * was asked, the last answer and the changed files (private details left out).
 */
export function ContinueInCodex({ chatId }: { chatId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const term = await api.continueInCodex(chatId);
      void navigate(`/t/${term.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="sm" icon={ArrowRightLeft} disabled={busy} onClick={() => void run()} data-tip={t("chat.codexTip")}>
        {t("chat.codexGo")}
      </Button>
      {error && <span className="basis-full text-[12px] text-danger">{error}</span>}
    </>
  );
}
