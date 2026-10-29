import type { LucideIcon } from "lucide-react";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, field } from "../../components/ui";
import { cn } from "../../lib/cn";

/** Lower case without Turkish dots, so "Günlük" finds "gunluk". */
const plain = (text: string) => text.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/**
 * The way into the tools (a user had never used them: fourteen tabs said nothing). Write what you
 * want to do; the tools whose words match come first, each with what it is for and its first step.
 * When none matches, the helper is asked, with the question already written.
 */
export function ToolsStart({
  tools,
  onOpen,
}: {
  tools: { key: string; icon: LucideIcon }[];
  onOpen: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const words = plain(query)
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const score = (key: string) => {
    const text = plain(`${t(`suite.${key}`)} ${t(`toolsStart.${key}_what`)} ${t(`toolsStart.${key}_words`)}`);
    return words.filter((w) => text.includes(w)).length;
  };
  const ranked = words.length
    ? tools
        .map((x) => ({ ...x, score: score(x.key) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
    : tools;
  const askHelper = () => window.dispatchEvent(new CustomEvent("igrek:helper", { detail: { question: query } }));
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const first = ranked[0];
          if (words.length && first) onOpen(first.key);
          else if (query.trim()) askHelper();
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the page opens to this question
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("toolsStart.placeholder")}
            aria-label={t("toolsStart.placeholder")}
            className={cn(field, "h-9 w-full")}
          />
        </label>
        <Button type="button" icon={Sparkles} disabled={!query.trim()} onClick={askHelper}>
          {t("toolsStart.ask")}
        </Button>
      </form>
      {words.length > 0 && !ranked.length && <p className="text-[13px] text-fg-muted">{t("toolsStart.none")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map(({ key, icon: Icon }) => (
          <Card key={key} className="flex flex-col gap-1.5 p-pad">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Icon size={15} className="text-accent" aria-hidden="true" />
              {t(`suite.${key}`)}
            </p>
            <p className="flex-1 text-[12.5px] text-fg-muted">{t(`toolsStart.${key}_what`)}</p>
            <p className="text-[11.5px] text-fg-subtle">{t(`toolsStart.${key}_first`)}</p>
            <button
              type="button"
              onClick={() => onOpen(key)}
              className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-accent hover:underline"
            >
              {t("toolsStart.open")} <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
