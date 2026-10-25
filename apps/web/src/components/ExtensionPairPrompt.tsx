import { Puzzle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useServerEvent } from "../lib/live";
import { Button, Dialog } from "./ui";

/**
 * The browser extension asks to pair (extension/panel.js): its code is shown here and in the
 * extension, and only "Allow" here gives it a key. No key to copy and paste any more.
 */
export function ExtensionPairPrompt() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<{ id: string; code: string }[]>([]);
  const load = useCallback(() => {
    api
      .extensionRequests()
      .then(setRequests)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useServerEvent("extension-pair", load);
  const request = requests[0];
  const decide = (allow: boolean) =>
    request &&
    void api
      .decideExtension(request.id, allow)
      .catch(() => undefined)
      .finally(load);
  return (
    <Dialog open={!!request} onClose={() => decide(false)} label={t("extension.pairAsk")}>
      {request && (
        <div className="space-y-3 p-5 text-[13px]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Puzzle size={16} className="text-accent" aria-hidden="true" />
            {t("extension.pairAsk")}
          </h2>
          <p className="text-fg-muted">{t("extension.pairBody")}</p>
          <p className="text-center font-mono text-[24px] tracking-[0.3em]">{request.code}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => decide(false)}>
              {t("extension.pairDeny")}
            </Button>
            <Button variant="primary" onClick={() => decide(true)}>
              {t("extension.pairAllow")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
