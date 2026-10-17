import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/** Markdown from an AI, sanitized before it is shown. */
export function Markdown({ text, className = "prose-godeye prose-chat" }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
