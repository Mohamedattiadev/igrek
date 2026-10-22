import { KeyRound, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { Button, CopyButton } from "./ui";

/**
 * The browser extension (extension/ in the repository): a pairing key to paste into it once, how
 * many browsers are paired, and forgetting them all. A key opens only the extension's few routes.
 */
export function ExtensionPanel() {
  const { t } = useTranslation();
  const [paired, setPaired] = useState<number>();
  const [key, setKey] = useState<string>();
  useEffect(() => {
    let current = true;
    request<{ paired: number }>("/api/extension")
      .then((r) => current && setPaired(r.paired))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return (
    <div className="space-y-3 text-[13px]">
      <ol className="list-decimal space-y-1 ps-5 text-fg-muted">
        <li>{t("extension.step1")}</li>
        <li>{t("extension.step2")}</li>
        <li>{t("extension.step3")}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={KeyRound}
          onClick={() =>
            void request<{ key: string }>("/api/extension/pair", { method: "POST" }).then((r) => {
              setKey(r.key);
              setPaired((n) => (n ?? 0) + 1);
            })
          }
        >
          {t("extension.pair")}
        </Button>
        {(paired ?? 0) > 0 && (
          <Button
            variant="ghost"
            icon={Unplug}
            onClick={() =>
              window.confirm(t("extension.forgetConfirm")) &&
              void request<{ paired: number }>("/api/extension", { method: "DELETE" }).then((r) => {
                setPaired(r.paired);
                setKey(undefined);
              })
            }
          >
            {t("extension.forget")}
          </Button>
        )}
        {paired !== undefined && <span className="text-fg-subtle">{t("extension.paired", { count: paired })}</span>}
      </div>
      {key && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-border bg-bg-subtle p-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12px]">{key}</code>
          <CopyButton text={key} />
          <p className="w-full text-[11.5px] text-fg-subtle">{t("extension.keyOnce")}</p>
        </div>
      )}
    </div>
  );
}
