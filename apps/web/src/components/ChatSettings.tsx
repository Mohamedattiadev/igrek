import type { ChatInfo, ChatMode } from "@igrek/core";
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DETAIL_LEVELS, type DetailLevel } from "../lib/chat-log";
import { modelName } from "../lib/format";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import { Dialog, field } from "./ui";

const CHAT_MODES: ChatMode[] = ["normal", "acceptEdits", "auto", "plan"];
export const CHAT_MODELS = ["", "opus", "sonnet", "haiku"];

interface Props {
  info?: ChatInfo;
  /** A fresh chat (nothing said yet) may still become another expert's chat. */
  fresh: boolean;
  detail: DetailLevel;
  onDetail: (level: DetailLevel) => void;
  onMode: (mode: ChatMode) => void;
  onModel: (model: string) => void;
  onPersona: (personaId: string) => void;
}

/**
 * The chat's choices (expert, approvals, model, detail) behind one button, so the box keeps only
 * what is used on every message. A mode other than "ask me" stays visible on the button.
 */
export function ChatSettings({ info, fresh, detail, onDetail, onMode, onModel, onPersona }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { personas } = usePersonas();
  const personaLabel = usePersonaLabel();
  const mode = info?.mode ?? "normal";
  const model = CHAT_MODELS.find((m) => m && info?.model?.includes(m)) ?? "";
  const id = useId();
  /** `name` ties the label to the select inside `control`, which carries the same id. */
  const row = (name: string, label: string, hint: string, control: ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${name}`} className="block text-[12.5px] font-medium">
        {label}
      </label>
      {control}
      <p className="text-[11.5px] text-fg-muted">{hint}</p>
    </div>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tip={t(`chat.modeHint_${mode}`)}
        className="flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span className="truncate">
          {t("chat.settings")}
          {mode !== "normal" && <span className="text-fg"> · {t(`chat.mode_${mode}`)}</span>}
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("chat.settings")}>
        <div className="space-y-4 p-5">
          <h2 className="text-[15px] font-semibold">{t("chat.settings")}</h2>
          {fresh &&
            personas.length > 0 &&
            row(
              "persona",
              t("persona.picker"),
              t("chat.settingsExpertHint"),
              <select
                id={`${id}-persona`}
                value={info?.persona?.id ?? ""}
                onChange={(e) => onPersona(e.target.value)}
                className={`${field} w-full`}
              >
                <option value="">{t("persona.none")}</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personaLabel(p).name}
                  </option>
                ))}
              </select>,
            )}
          {row(
            "mode",
            t("chat.modeLabel"),
            t(`chat.modeHint_${mode}`),
            <select
              id={`${id}-mode`}
              value={mode}
              onChange={(e) => onMode(e.target.value as ChatMode)}
              className={`${field} w-full`}
            >
              {CHAT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`chat.mode_${m}`)}
                </option>
              ))}
            </select>,
          )}
          {row(
            "model",
            t("chat.model"),
            t("chat.modelTip"),
            <select
              id={`${id}-model`}
              value={model}
              onChange={(e) => e.target.value && onModel(e.target.value)}
              className={`${field} w-full`}
            >
              {CHAT_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m ? modelName(`claude-${m}`) : info?.model ? modelName(info.model) : t("chat.modelDefault")}
                </option>
              ))}
            </select>,
          )}
          {row(
            "detail",
            t("chat.detail"),
            t("chat.detailTip"),
            <select
              id={`${id}-detail`}
              value={detail}
              onChange={(e) => onDetail(e.target.value as DetailLevel)}
              className={`${field} w-full`}
            >
              {DETAIL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`chat.detail_${level}`)}
                </option>
              ))}
            </select>,
          )}
        </div>
      </Dialog>
    </>
  );
}
