import type { LearnHit } from "@igrek/learn";
import { BookOpen, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { actions, type WhatIsRequest } from "../lib/actions";
import { hitLink, learnApi } from "../lib/learn-api";
import { Button, Dialog } from "./ui";

/**
 * "What is this?" from the code editor (plan.md 14.1): the cheatsheet items that match the
 * selected code, found locally; a short explanation from the small model only when asked.
 */
export function WhatIs() {
  const { t } = useTranslation();
  const [request, setRequest] = useState<WhatIsRequest>();
  const [hits, setHits] = useState<LearnHit[]>();
  const [answer, setAnswer] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(
    () =>
      actions.onWhatIs((r) => {
        setRequest(r);
        setHits(undefined);
        setAnswer(undefined);
        setError(undefined);
        void learnApi
          .what(r.code, r.fileLang, false)
          .then((out) => setHits(out.hits))
          .catch((e: Error) => setError(e.message));
      }),
    [],
  );
  const close = () => setRequest(undefined);
  return (
    <Dialog open={!!request} onClose={close} label={t("learn.whatIs")} wide>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">{t("learn.whatIs")}</h2>
        <pre className="max-h-32 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[12px]">
          {request?.code.trim().slice(0, 600)}
        </pre>
        {!hits && !error && <p className="animate-pulse text-xs text-fg-muted">{t("learn.looking")}</p>}
        {hits && (
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={`${h.sheet}/${h.id}`}>
                <Link
                  to={hitLink(h)}
                  onClick={close}
                  className="flex items-center gap-2 rounded-ui px-2 py-1.5 hover:bg-bg-hover"
                >
                  <BookOpen size={13} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{h.title}</span>
                  <span className="truncate font-mono text-[11px] text-fg-subtle">{h.sheet}</span>
                </Link>
              </li>
            ))}
            {!hits.length && <li className="text-xs text-fg-subtle">{t("learn.noMatch")}</li>}
          </ul>
        )}
        {answer && <p className="rounded-ui bg-accent-soft px-3 py-2 text-[13px] leading-relaxed">{answer}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {!answer && (
            <Button
              usesModel
              size="sm"
              icon={Lightbulb}
              disabled={busy || !request}
              onClick={() => {
                if (!request) return;
                setBusy(true);
                void learnApi
                  .what(request.code, request.fileLang, true)
                  .then((out) => setAnswer(out.answer))
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? t("learn.explaining") : t("learn.explain")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={close}>
            {t("learn.close")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
