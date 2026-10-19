import type { LibraryItem, LibrarySuggestion } from "@igrek/core";
import { BookOpen, ChevronDown, Globe, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { sameBook } from "../lib/books";
import { cn } from "../lib/cn";
import { useServerEvent } from "../lib/live";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import { Button, Card } from "./ui";

function SuggestionRow({ suggestion, onAdd }: { suggestion: LibrarySuggestion; onAdd: () => void }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const readers = suggestion.personaIds
    .map(
      (id) =>
        label(
          personas.find((p) => p.id === id),
          id,
        ).name,
    )
    .join(", ");
  return (
    <li className="flex items-center gap-3 py-2">
      <Globe size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{suggestion.title}</p>
        <p className="truncate text-[11.5px] text-fg-muted">
          {suggestion.projects?.length
            ? t("library.suggestUsedBy", { projects: suggestion.projects.join(", ") })
            : t("library.suggestFor", { experts: readers })}
        </p>
      </div>
      <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>
        {t("library.add")}
      </Button>
    </li>
  );
}

/**
 * What to add next, so the library does not start empty: the docs of what the projects are built
 * with, the free references the experts work from, and the books they recommend that are not here.
 */
export function LibrarySuggestions({
  items,
  onBook,
}: {
  items: LibraryItem[];
  /** A recommended book was picked: get the add box ready for its file. */
  onBook: (personaId: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [suggestions, setSuggestions] = useState<LibrarySuggestion[]>([]);
  const [books, setBooks] = useState(false);
  const [error, setError] = useState<string>();
  const load = () => {
    let current = true;
    api
      .librarySuggestions()
      .then((list) => current && setSuggestions(list))
      .catch(() => current && setSuggestions([]));
    return () => {
      current = false;
    };
  };
  useEffect(load, []);
  useServerEvent("library-changed", load);
  const add = (list: LibrarySuggestion[]) => {
    setError(undefined);
    void Promise.all(list.map((s) => api.addLibraryUrl(s.url, s.personaIds)))
      .then(load)
      .catch((err: Error) => setError(err.message));
  };
  const docs = suggestions.filter((s) => s.kind === "doc");
  const references = suggestions.filter((s) => s.kind === "web");
  const missing = personas.flatMap((p) =>
    p.profile.reading
      .filter((book) => !items.some((item) => sameBook(item.title, book.title)))
      .map((book) => ({ persona: p, book })),
  );
  if (!suggestions.length && !missing.length) return null;
  const group = (title: string, hint: string, list: LibrarySuggestion[]) =>
    list.length > 0 && (
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold">{title}</h3>
            <p className="text-[12px] text-fg-muted">{hint}</p>
          </div>
          <Button size="sm" icon={Plus} onClick={() => add(list)}>
            {t("library.addAll", { count: list.length })}
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {list.map((s) => (
            <SuggestionRow key={s.url} suggestion={s} onAdd={() => add([s])} />
          ))}
        </ul>
      </div>
    );
  return (
    <Card className="space-y-4 p-pad">
      <div>
        <h2 className="text-[14px] font-semibold">{t("library.suggestTitle")}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">{t("library.suggestHint")}</p>
      </div>
      {group(t("library.suggestDocs"), t("library.suggestDocsHint"), docs)}
      {group(t("library.suggestRefs"), t("library.suggestRefsHint"), references)}
      {missing.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setBooks((v) => !v)}
            aria-expanded={books}
            className="flex w-full items-center gap-1.5 text-start text-[13px] font-semibold"
          >
            <ChevronDown size={14} className={cn("transition-transform", !books && "-rotate-90")} aria-hidden="true" />
            {t("library.suggestBooks", { count: missing.length })}
          </button>
          <p className="text-[12px] text-fg-muted">{t("library.suggestBooksHint")}</p>
          {books && (
            <ul className="divide-y divide-border">
              {missing.map(({ persona, book }) => (
                <li key={`${persona.id}-${book.title}`} className="flex items-center gap-3 py-1.5">
                  <BookOpen size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">
                    <span className="font-medium">{book.title}</span>
                    <span className="text-fg-muted">
                      {" "}
                      · {book.author} · {label(persona).name}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onBook(persona.id, book.title)}>
                    {t("library.haveIt")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </Card>
  );
}
