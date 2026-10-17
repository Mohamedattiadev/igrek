import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useServerEvent } from "../lib/live";

// ---- who writes in which language (one shared, cached lookup) -------------------------------

let languagesOf: Promise<Map<string, string>> | undefined;
function memberLanguages(): Promise<Map<string, string>> {
  languagesOf ??= api
    .team()
    .then(
      (s) => new Map((s.members ?? []).flatMap((m) => (m.language ? [[m.id, m.language] as [string, string]] : []))),
    )
    .catch(() => new Map());
  return languagesOf;
}

function useAuthorLanguage(authorId?: string): string | undefined {
  const [lang, setLang] = useState<string>();
  useEffect(() => {
    if (authorId) void memberLanguages().then((m) => setLang(m.get(authorId)));
  }, [authorId]);
  useServerEvent("team-changed", () => {
    languagesOf = undefined;
    if (authorId) void memberLanguages().then((m) => setLang(m.get(authorId)));
  });
  return lang;
}

// ---- translations, batched into one request per moment ---------------------------------------

const done = new Map<string, string | null>();
const waiting = new Map<string, ((value: string | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | undefined;

function request(text: string, force: boolean): Promise<string | null> {
  const hit = done.get(text);
  if (hit !== undefined && !(hit === null && force)) return Promise.resolve(hit);
  return new Promise((resolve) => {
    waiting.set(text, [...(waiting.get(text) ?? []), resolve]);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = [...waiting.keys()].slice(0, 40);
      const callbacks = batch.map((t) => waiting.get(t) ?? []);
      for (const t of batch) waiting.delete(t);
      void api
        .translate(batch, force)
        .then((r) => r.texts)
        .catch(() => batch.map(() => undefined))
        .then((texts) =>
          batch.forEach((t, i) => {
            const value = texts[i] ?? null;
            done.set(t, value);
            for (const cb of callbacks[i] ?? []) cb(value);
          }),
        );
    }, 40);
  });
}

/**
 * A teammate's text in your language when they write in another one, with "show original"
 * (plan.md 7.4). Your own texts and same-language texts are shown as they are.
 */
export function TeamText({ text, authorId }: { text: string; authorId?: string }) {
  const { t, i18n } = useTranslation();
  const lang = useAuthorLanguage(authorId);
  const differs = !!lang && lang.split("-")[0] !== i18n.language.split("-")[0];
  const [translated, setTranslated] = useState<string | null>();
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    if (differs && text.trim()) void request(text, false).then(setTranslated);
  }, [differs, text]);
  if (!differs) return <>{text}</>;
  if (translated === null)
    return (
      <>
        {text}{" "}
        <button
          type="button"
          onClick={() => void request(text, true).then(setTranslated)}
          className="inline-flex items-center gap-0.5 text-[11px] text-fg-subtle hover:text-accent"
        >
          <Languages size={11} aria-hidden="true" /> {t("translate.do")}
        </button>
      </>
    );
  if (translated === undefined) return <>{text}</>;
  return (
    <>
      {original ? text : translated}{" "}
      <button
        type="button"
        onClick={() => setOriginal((v) => !v)}
        className="inline-flex items-center gap-0.5 text-[11px] text-fg-subtle hover:text-accent"
        data-tip={t("translate.tip")}
      >
        <Languages size={11} aria-hidden="true" />{" "}
        {original ? t("translate.showTranslated") : t("translate.showOriginal")}
      </button>
    </>
  );
}
