import { useEffect, useState } from "react";
import { highlight } from "./highlight";

/** The inner HTML of a highlighted block (spans only), or undefined while loading or for plain text. */
export function useHighlight(code: string, lang: string | undefined): string | undefined {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let live = true;
    setHtml(undefined);
    void highlight(code, lang)
      .then((out) => live && setHtml(out ? innerCode(out) : undefined))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [code, lang]);
  return html;
}

/** Shiki returns <pre ...><code>…</code></pre>; we keep our own <pre> and take what is inside <code>. */
export function innerCode(html: string): string {
  return html.match(/<code[^>]*>([\s\S]*)<\/code>/)?.[1] ?? html;
}
