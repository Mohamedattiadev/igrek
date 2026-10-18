import { Code2, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeBlock } from "./CodeBlock";

/** The Igrek colors the page gets, read from the app at the time it is drawn. */
const TOKENS = [
  "--bg",
  "--bg-subtle",
  "--fg",
  "--fg-muted",
  "--border",
  "--accent",
  "--success",
  "--warning",
  "--danger",
];

/**
 * A whole HTML page an AI wrote (a ```html-report block, plan.md 16.2), shown in a sandboxed frame:
 * scripts may run but the page has no access to Igrek (no same origin) and cannot load anything
 * from the network (its content security policy allows only what is inline). It gets Igrek's
 * colors and font, and grows with its content.
 */
export function HtmlReport({ html }: { html: string }) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const [full, setFull] = useState(false);
  const [code, setCode] = useState(false);
  const doc = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const vars = TOKENS.map((v) => `${v}:${style.getPropertyValue(v).trim()}`).join(";");
    return [
      "<!doctype html><html><head><meta charset='utf-8'>",
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:">`,
      `<style>:root{${vars}}html,body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,sans-serif}body{padding:12px}a{color:var(--accent)}table{border-collapse:collapse}td,th{border:1px solid var(--border);padding:4px 8px}</style>`,
      // Tells the app how tall the page is, so the frame needs no scroll bar of its own.
      "<script>new ResizeObserver(()=>parent.postMessage({igrekReportHeight:document.documentElement.scrollHeight},'*')).observe(document.documentElement)</script>",
      "</head><body>",
      html,
      "</body></html>",
    ].join("");
  }, [html]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const h = Number((event.data as { igrekReportHeight?: unknown })?.igrekReportHeight);
      if (Number.isFinite(h) && h > 0) setHeight(Math.min(Math.max(h, 80), 4000));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <div
      className={
        full
          ? "fixed inset-4 z-50 flex flex-col rounded-ui border border-border bg-bg shadow-ui"
          : "not-prose my-2 rounded-ui border border-border"
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1 text-[12px] text-fg-subtle">
        <span className="min-w-0 flex-1">{t("report.htmlTitle")}</span>
        <button type="button" onClick={() => setCode((v) => !v)} className="flex items-center gap-1 hover:text-fg">
          <Code2 size={13} aria-hidden="true" />
          {code ? t("report.htmlPage") : t("report.htmlCode")}
        </button>
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          aria-label={full ? t("report.htmlSmall") : t("report.htmlFull")}
          title={full ? t("report.htmlSmall") : t("report.htmlFull")}
          className="hover:text-fg"
        >
          {full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
      {code ? (
        <CodeBlock code={html} lang="html" className="ge-codeblock max-h-96 overflow-auto p-2.5" />
      ) : (
        <iframe
          ref={frame}
          title={t("report.htmlTitle")}
          sandbox="allow-scripts"
          srcDoc={doc}
          style={full ? undefined : { height }}
          className={full ? "w-full flex-1" : "block w-full"}
        />
      )}
    </div>
  );
}
