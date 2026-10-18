import DOMPurify from "dompurify";
import { marked } from "marked";
import { memo, useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { highlight, highlightCached, langKey } from "../lib/highlight";
import { Lru } from "../lib/lru";
import { healBlock, splitBlocks } from "../lib/markdown-blocks";
import { innerCode } from "../lib/useHighlight";
import { RICH_LANGS, RichBlock } from "./RichBlocks";

type Words = { copy: string; copied: string; callout: Record<string, string> };

/**
 * Code blocks get colors like VS Code, a language label and a copy button. Done on the rendered
 * DOM after each change, so streaming answers keep working; Shiki's output is built from the
 * already escaped code text. While a block is still being written (`streaming`), only its
 * finished lines are colored, so the colors change once per line instead of once per word.
 */
function enhanceCode(root: HTMLElement, words: Words, streaming: boolean): () => void {
  let live = true;
  const roots: { root: Root; box: HTMLElement }[] = [];
  for (const quote of root.querySelectorAll("blockquote")) {
    if (quote.classList.contains("ge-callout")) continue;
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
  const pres = [...root.querySelectorAll("pre")];
  for (const pre of pres) {
    const code = pre.querySelector("code");
    if (!code) continue;
    const lang = [...code.classList].find((c) => c.startsWith("language-"))?.slice(9);
    const text = code.textContent ?? "";
    // A chart, stats or diagram block becomes a component, once its JSON is complete
    // (while an answer streams in, the half-written block stays plain).
    if (lang && (RICH_LANGS as readonly string[]).includes(lang) && (lang === "mermaid" || parses(text))) {
      const box = document.createElement("div");
      pre.replaceWith(box);
      const r = createRoot(box);
      r.render(<RichBlock lang={lang} code={text.trim()} />);
      roots.push({ root: r, box });
      continue;
    }
    if (!pre.dataset.enhanced) {
      pre.dataset.enhanced = "1";
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
        void navigator.clipboard.writeText(code.textContent ?? "").then(() => {
          copy.textContent = words.copied;
          setTimeout(() => {
            copy.textContent = words.copy;
          }, 1500);
        });
      });
      pre.append(copy);
    }
    if (!langKey(lang)) continue;
    const full = text.replace(/\n$/, "");
    const cut = streaming && pre === pres[pres.length - 1] ? full.lastIndexOf("\n") : full.length;
    const done = cut < 0 ? "" : full.slice(0, cut);
    const rest = full.slice(Math.max(cut, 0));
    if (!done) continue;
    const paint = (html: string) => {
      code.innerHTML = innerCode(html);
      if (rest) code.append(rest);
      pre.classList.add("ge-code");
    };
    const ready = highlightCached(done, lang);
    if (ready) paint(ready);
    else
      void highlight(done, lang).then((html) => {
        if (live && html) paint(html);
      });
  }
  return () => {
    live = false;
    // Unmount after React has finished the current render, and only what left the page
    // (a block drawn again with the same HTML keeps its chart).
    setTimeout(() => {
      for (const { root: r, box } of roots) if (!box.isConnected) r.unmount();
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

/** Sanitized HTML of one block, kept for the blocks seen last (scrolling back, a chat reopened). */
const blockHtml = new Lru<string>(400);

function renderBlock(raw: string): string {
  let html = blockHtml.get(raw);
  if (html === undefined) {
    html = DOMPurify.sanitize(marked.parse(raw, { async: false }));
    blockHtml.set(raw, html);
  }
  return html;
}

const Block = memo(function Block({ raw, words, streaming }: { raw: string; words: Words; streaming: boolean }) {
  const html = renderBlock(raw);
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run again whenever the HTML changes
  useEffect(() => (ref.current ? enhanceCode(ref.current, words, streaming) : undefined), [html, streaming]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
  return <div ref={ref} className="ge-md-block" dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * Markdown from an AI, sanitized before it is shown. Drawn block by block: while an answer
 * streams in (`streaming`), the blocks already finished stay as they are and only the last one
 * is parsed again, with what it left open (bold, inline code) closed for now.
 */
export function Markdown({
  text,
  className = "prose-godeye prose-chat",
  streaming = false,
}: {
  text: string;
  className?: string;
  streaming?: boolean;
}) {
  const { t } = useTranslation();
  const words = useMemo<Words>(
    () => ({
      copy: t("team.copy"),
      copied: t("team.copied"),
      callout: Object.fromEntries(
        ["note", "tip", "important", "warning", "caution"].map((k) => [k, t(`rich.callout_${k}`)]),
      ),
    }),
    [t],
  );
  const blocks = useMemo(() => splitBlocks(text), [text]);
  return (
    <div className={className}>
      {blocks.map((raw, i) => {
        const last = streaming && i === blocks.length - 1;
        return (
          // Blocks only grow at the end, so their place is a stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <Block key={i} raw={last ? healBlock(raw) : raw} words={words} streaming={last} />
        );
      })}
    </div>
  );
}
