import { Download } from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import type { PreviewKind } from "../lib/files";
import { CodeBlock } from "./CodeBlock";
import { LogView } from "./LogView";
import { Markdown } from "./Markdown";
import { Button } from "./ui";

const MAX_ROWS = 500;

const PdfView = lazy(() => import("./RichPreviews").then((m) => ({ default: m.PdfView })));
const DataTree = lazy(() => import("./RichPreviews").then((m) => ({ default: m.DataTree })));
const SheetView = lazy(() => import("./RichPreviews").then((m) => ({ default: m.SheetView })));
const DocxView = lazy(() => import("./RichPreviews").then((m) => ({ default: m.DocxView })));
const PptxView = lazy(() => import("./RichPreviews").then((m) => ({ default: m.PptxView })));

function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= MAX_ROWS; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/**
 * Shows a file the way a person expects (plan.md 2.9): pictures as pictures,
 * PDFs as pages, Markdown rendered, CSV as a table, JSON formatted.
 */
export function FilePreview({ path, kind, text }: { path: string; kind: PreviewKind; text?: string }) {
  const { t } = useTranslation();
  const url = fs.rawUrl(path);

  const csv = useMemo(
    () => (kind === "csv" && text !== undefined ? parseCsv(text, path.endsWith(".tsv") ? "\t" : ",") : []),
    [kind, text, path],
  );
  const json = useMemo(() => {
    if (kind !== "json" || text === undefined) return "";
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, [kind, text]);

  switch (kind) {
    case "image":
      return (
        <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--bg-muted)_0%_25%,var(--bg)_0%_50%)] bg-[length:16px_16px] p-6">
          <img src={url} alt={path} className="max-h-full max-w-full object-contain shadow-ui" />
        </div>
      );
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: user files have no caption tracks */}
          <video src={url} controls className="max-h-full max-w-full" />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full items-center justify-center">
          {/* biome-ignore lint/a11y/useMediaCaption: user files have no caption tracks */}
          <audio src={url} controls />
        </div>
      );
    case "pdf":
      return (
        <Suspense fallback={null}>
          <PdfView path={path} />
        </Suspense>
      );
    case "tree":
      return text === undefined ? null : (
        <Suspense fallback={null}>
          <DataTree path={path} text={text} />
        </Suspense>
      );
    case "sheet":
      return (
        <Suspense fallback={null}>
          <SheetView path={path} />
        </Suspense>
      );
    case "doc":
      return (
        <Suspense fallback={null}>
          <DocxView path={path} />
        </Suspense>
      );
    case "slides":
      return (
        <Suspense fallback={null}>
          <PptxView path={path} />
        </Suspense>
      );
    case "markdown":
      return (
        <div className="h-full overflow-y-auto">
          <Markdown text={text ?? ""} className="prose-godeye mx-auto max-w-3xl px-8 py-6" />
        </div>
      );
    case "csv":
      return (
        <div className="h-full overflow-auto">
          <table className="min-w-full border-collapse text-[12px]">
            <tbody>
              {csv.map((row, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity besides their position
                <tr key={r} className={r === 0 ? "sticky top-0 bg-bg-subtle font-semibold" : "hover:bg-bg-hover"}>
                  {row.map((cell, c) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity besides their position
                    <td key={c} className="max-w-xs truncate border border-border px-2 py-1">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {csv.length > MAX_ROWS && (
            <p className="p-2 text-xs text-fg-subtle">{t("preview.truncated", { count: MAX_ROWS })}</p>
          )}
        </div>
      );
    case "log":
      return <LogView path={path} />;
    case "json":
      return <CodeBlock code={json} lang="json" className="h-full overflow-auto p-4 text-[12px] leading-relaxed" />;
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-fg-muted">
          {t("code.binary")}
          <a href={fs.rawUrl(path, true)}>
            <Button icon={Download}>{t("code.download")}</Button>
          </a>
        </div>
      );
  }
}
