import type { LanguageOption } from "@igrek/i18n";
import { languages as fallbackLanguages } from "@igrek/i18n";
import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

export function LanguagePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const { t } = useTranslation();
  const [all, setAll] = useState<LanguageOption[]>(fallbackLanguages);
  const [query, setQuery] = useState("");
  // The first screenful right away, the rest of the ~180 languages a moment later (keeps opening Settings fast).
  const [full, setFull] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFull(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    api
      .languages()
      .then(setAll)
      .catch(() => undefined);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((l) => `${l.native} ${l.english} ${l.code}`.toLowerCase().includes(q));
  }, [all, query]);

  return (
    <div className="overflow-hidden rounded-ui border border-border">
      <label className="flex h-9 items-center gap-2 border-b border-border bg-bg-subtle px-3">
        <Search size={14} className="text-fg-subtle" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("onboarding.search")}
          className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
        />
      </label>
      <ul className="max-h-72 overflow-y-auto p-1" aria-label={t("settings.language")}>
        {(full || query ? shown : shown.slice(0, 30)).map((language) => (
          <li key={language.code}>
            <button
              type="button"
              aria-pressed={value === language.code}
              data-nav-item
              onClick={() => onChange(language.code)}
              className={cn(
                "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-start text-[13px] hover:bg-bg-hover",
                value === language.code && "bg-accent-soft",
              )}
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                <span className="font-medium text-fg">{language.native}</span>
                {language.native !== language.english && <span className="text-fg-subtle">{language.english}</span>}
              </span>
              {!language.bundled && <span className="text-[11px] text-fg-subtle">{t("settings.languageSoon")}</span>}
              {value === language.code && <Check size={15} className="text-accent" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
