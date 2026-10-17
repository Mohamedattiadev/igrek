import { RefreshCw, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";

/** A page that couldn't load: what happened, in plain words, and a "Try again" button. */
export function LoadError({ error, onRetry }: { error?: string; onRetry: () => void }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="m-6 flex flex-wrap items-center gap-3 rounded-ui border border-warning bg-warning-soft px-4 py-3 text-[13px]"
    >
      <WifiOff size={15} className="text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{error}</span>
      <Button size="sm" icon={RefreshCw} onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}
