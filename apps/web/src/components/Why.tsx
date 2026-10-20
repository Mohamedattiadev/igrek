import { CircleHelp, ListTodo, MessageSquare, UsersRound } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import type { Why } from "../lib/why";
import { Dialog } from "./ui";

/** How a chat answers "why?" for one of its steps; outside a chat there is no answer to give. */
export const WhyContext = createContext<((eventId: string) => Why) | undefined>(undefined);

function Part({ icon: Icon, title, children }: { icon: typeof MessageSquare; title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
        <Icon size={12} aria-hidden="true" />
        {title}
      </h3>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * "Why?" beside a changed file (Igrek: know why): the request that led to the change, the plan
 * step it belonged to and an expert's note, all taken from the conversation itself.
 */
export function WhyButton({ eventId, file }: { eventId: string; file: string }) {
  const { t } = useTranslation();
  const whyOf = useContext(WhyContext);
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [why, setWhy] = useState<Why>();
  if (!whyOf) return null;
  const expert = why?.expert;
  const empty = why && !why.request && !why.step && !expert;
  return (
    <>
      <button
        type="button"
        onClick={() => setWhy(whyOf(eventId))}
        data-tip={t("why.tip")}
        className="flex shrink-0 items-center gap-1 rounded px-1 text-[11.5px] text-fg-subtle hover:bg-bg-hover hover:text-fg"
      >
        <CircleHelp size={12} aria-hidden="true" />
        {t("why.button")}
      </button>
      <Dialog open={!!why} onClose={() => setWhy(undefined)} label={t("why.title")} wide>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <div>
            <h2 className="text-[15px] font-semibold">{t("why.title")}</h2>
            <p className="mt-0.5 truncate font-mono text-[12px] text-fg-muted">{file}</p>
          </div>
          {why?.request && (
            <Part icon={MessageSquare} title={t("why.request")}>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-ui bg-bg-subtle p-2.5">
                {why.request}
              </p>
            </Part>
          )}
          {why?.step && (
            <Part icon={ListTodo} title={t("why.step")}>
              <p>{why.step}</p>
            </Part>
          )}
          {expert && (
            <Part icon={UsersRound} title={t("why.expert")}>
              <p className="font-medium">
                {label(
                  personas.find((p) => p.id === expert.id),
                  expert.id,
                ).name || t("why.expertUnknown")}
              </p>
              {expert.question && <p className="text-fg-muted">{expert.question}</p>}
              {expert.note && (
                <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-ui bg-bg-subtle p-2.5 text-[12.5px]">
                  {expert.note}
                </p>
              )}
            </Part>
          )}
          {empty && <p className="text-[13px] text-fg-muted">{t("why.none")}</p>}
          <p className="text-[11.5px] text-fg-subtle">{t("why.source")}</p>
        </div>
      </Dialog>
    </>
  );
}
