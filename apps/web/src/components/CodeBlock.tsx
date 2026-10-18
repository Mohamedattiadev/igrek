import { cn } from "../lib/cn";
import { useHighlight } from "../lib/useHighlight";

/** A read-only code block colored like VS Code; plain text until the colors are ready. */
export function CodeBlock({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  const html = useHighlight(code, lang);
  const base = cn("font-mono whitespace-pre", className);
  // Long lines scroll sideways: keyboard users reach the block with Tab and scroll it with the arrows.
  return html ? (
    <pre
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (WCAG 2.1.1)
      tabIndex={0}
      data-lang={lang}
      className={cn("ge-code", base)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output, built from escaped code text
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <pre
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (WCAG 2.1.1)
      tabIndex={0}
      data-lang={lang}
      className={base}
    >
      {code}
    </pre>
  );
}
