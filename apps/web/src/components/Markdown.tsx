import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { highlight, langKey } from "../lib/highlight";
import { innerCode } from "../lib/useHighlight";
import { RICH_LANGS, RichBlock } from "./RichBlocks";

/**
 * Code blocks get colors like VS Code, a language label and a copy button. Done on the rendered
 * DOM after each change, so streaming answers keep working; Shiki's output is built from the
 * already escaped code text.
 */
function enhanceCode(
  root: HTMLElement,
  words: { copy: string; copied: string; callout: Record<string, string> },
): () => void {
  let live = true;
  const roots: Root[] = [];
  for (const quote of root.querySelectorAll("blockquote")) {
    const first = quote.querySelector("p");
    const m = first?.firstChild?.textContent?.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
    if (!first?.firstChild || !m?.[1]) continue;
    const kind = m[1].toLowerCase();
    first.firstChild.textContent = (first.firstChild.textContent ?? "").slice(m[0].length);
    quote.classList.add("ge-callout", `ge-callout-${kind}`);
    const title = document.createElement("span");
    title.className = "ge-callout-title";
    title.textContent = words.callout[kind] ?? kind;
    quote.prepend(title);
  }
  for (const pre of root.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    if (!code || pre.dataset.enhanced) continue;
    pre.dataset.enhanced = "1";
    const lang = [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
    const text = code.textContent ?? "";
    // A chart, stats or diagram block becomes a component, once its JSON is complete
    // (while an answer streams in, the half-written block stays plain).
    if (lang && (RICH_LANGS as readonly string[]).includes(lang) && (lang === "mermaid" || parses(text))) {
      const box = document.createElement("div");
      pre.replaceWith(box);
      const r = createRoot(box);
      r.render(<RichBlock lang={lang} code={text.trim()} />);
      roots.push(r);
      continue;
    }
    pre.classList.add("ge-codeblock");
    if (lang) {
      const label = document.createElement("span");
      label.className = "ge-code-lang";
      label.textContent = lang;
      pre.append(label);
    }
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "ge-code-copy";
    copy.textContent = words.copy;
    copy.setAttribute("aria-label", words.copy);
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(text).then(() => {
        copy.textContent = words.copied;
        setTimeout(() => {
          copy.textContent = words.copy;
        }, 1500);
      });
    });
    pre.append(copy);
    if (langKey(lang))
      void highlight(text.replace(/\n$/, ""), lang).then((html) => {
        if (!live || !html) return;
        code.innerHTML = innerCode(html);
        pre.classList.add("ge-code");
      });
  }
  return () => {
    live = false;
    // Unmount after React has finished the current render.
    setTimeout(() => {
      for (const r of roots) r.unmount();
    });
  };
}

function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Markdown from an AI, sanitized before it is shown. */
export function Markdown({ text, className = "prose-godeye prose-chat" }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run again whenever the HTML changes
  useEffect(
    () =>
      ref.current
        ? enhanceCode(ref.current, {
            copy: t("team.copy"),
            copied: t("team.copied"),
            callout: Object.fromEntries(
              ["note", "tip", "important", "warning", "caution"].map((k) => [k, t(`rich.callout_${k}`)]),
            ),
          })
        : undefined,
    [html],
  );
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
