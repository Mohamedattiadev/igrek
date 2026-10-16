import type { EnhanceStats } from "@godeye/core";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Button } from "./ui";

const field = "h-8 rounded-ui border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent";

/** The user's own shorthands ("dyy" → "doğrusunu yap") and the weekly note (plan.md 4.5.4). */
export function EnhanceSettings() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [stats, setStats] = useState<EnhanceStats>();
  const [draft, setDraft] = useState({ short: "", long: "" });
  useEffect(() => {
    api
      .enhanceStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);
  const shortcuts = settings.enhanceShortcuts ?? {};
  const save = (next: Record<string, string>) => update({ enhanceShortcuts: next });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium">{t("enhance.shortcuts")}</p>
        <p className="text-[11px] text-fg-subtle">{t("enhance.shortcutsHint")}</p>
        {Object.entries(shortcuts).map(([short, long]) => (
          <div key={short} className="flex items-center gap-2 text-[13px]">
            <code className="w-20 shrink-0 font-mono">{short}</code>
            <span className="min-w-0 flex-1 truncate text-fg-muted">{long}</span>
            <button
              type="button"
              aria-label={t("enhance.shortcutRemove")}
              className="rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-danger"
              onClick={() => {
                const { [short]: _gone, ...rest } = shortcuts;
                void save(rest);
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${field} w-24 font-mono`}
            placeholder="dyy"
            aria-label={t("enhance.shortcutShort")}
            value={draft.short}
            onChange={(e) => setDraft({ ...draft, short: e.target.value.trim().toLowerCase() })}
          />
          <input
            className={`${field} min-w-48 flex-1`}
            placeholder={t("enhance.shortcutLongPh")}
            aria-label={t("enhance.shortcutLong")}
            value={draft.long}
            onChange={(e) => setDraft({ ...draft, long: e.target.value })}
          />
          <Button
            size="sm"
            icon={Plus}
            disabled={!draft.short || !draft.long.trim()}
            onClick={() => {
              void save({ ...shortcuts, [draft.short]: draft.long.trim() });
              setDraft({ short: "", long: "" });
            }}
          >
            {t("enhance.shortcutAdd")}
          </Button>
        </div>
        {stats && stats.suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-subtle">
            <span>{t("enhance.suggested")}</span>
            {stats.suggestions.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => setDraft({ short: word, long: "" })}
                className="rounded-full border border-border px-2 py-0.5 font-mono hover:border-accent hover:text-accent"
                data-tip={t("enhance.suggestedTip", { word })}
              >
                {word}
              </button>
            ))}
          </div>
        )}
      </div>

      {stats && stats.week.total > 0 && (
        <div className="space-y-1 rounded-ui bg-bg-subtle p-3 text-xs">
          <p className="font-medium">
            {t("enhance.weekly", { count: stats.week.total, enhanced: stats.week.enhanced + stats.week.edited })}
          </p>
          {stats.missing[0] && (
            <p className="text-fg-muted">
              {t("enhance.weeklyMissing", { part: t(`enhance.part_${stats.missing[0].part}`) })}
            </p>
          )}
          {stats.errorsEnhanced !== null && stats.errorsOriginal !== null && (
            <p className="text-fg-muted">
              {t("enhance.weeklyErrors", { enhanced: stats.errorsEnhanced, original: stats.errorsOriginal })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
