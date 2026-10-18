import DOMPurify from "dompurify";
import { ChevronDown, ChevronRight, MessageSquareText, Minus, Plus, Search } from "lucide-react";
import { type DependencyList, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { actions } from "../lib/actions";
import { fs } from "../lib/api";
import { cn } from "../lib/cn";
import { nameOf } from "../lib/files";

/**
 * Heavier previews (plan.md 2.9), split off so their libraries load only when
 * such a file is opened.
 */

async function bytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(fs.rawUrl(path), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Could not open the file (${res.status})`);
  return res.arrayBuffer();
}

function useLoad<T>(load: () => Promise<T>, deps: DependencyList): { data?: T; error?: string } {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const run = () => {
    let alive = true;
    setState({});
    load()
      .then((data) => alive && setState({ data }))
      .catch((err: Error) => alive && setState({ error: err.message }));
    return () => {
      alive = false;
    };
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: callers pass their own deps
  useEffect(run, deps);
  return state;
}

function Problem({ text }: { text: string }) {
  return <p className="p-4 text-xs text-danger">{text}</p>;
}

// ---- JSON / YAML / TOML as a tree ----------------------------------------------------------

function TreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObject = value !== null && typeof value === "object";
  const entries = isObject ? Object.entries(value as Record<string, unknown>) : [];
  const label = <span className="font-mono text-[12px] text-accent">{name}</span>;
  if (!isObject) {
    const tone =
      typeof value === "string" ? "text-success" : typeof value === "number" ? "text-warning" : "text-fg-muted";
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingInlineStart: depth * 14 + 18 }}>
        {label}
        <span className={cn("min-w-0 break-all font-mono text-[12px]", tone)}>
          {typeof value === "string" ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 py-0.5 hover:bg-bg-hover"
        style={{ paddingInlineStart: depth * 14 }}
      >
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        {label}
        <span className="text-[11px] text-fg-subtle">
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && entries.slice(0, 1000).map(([k, v]) => <TreeNode key={k} name={k} value={v} depth={depth + 1} />)}
    </div>
  );
}

export function DataTree({ path, text }: { path: string; text: string }) {
  const { t } = useTranslation();
  const ext = path.split(".").pop()?.toLowerCase();
  const parsed = useLoad(async () => {
    if (ext === "yaml" || ext === "yml") return (await import("yaml")).parseAllDocuments(text).map((d) => d.toJS());
    if (ext === "toml") return (await import("smol-toml")).parse(text);
    return JSON.parse(text);
  }, [path, text]);
  if (parsed.error) return <Problem text={t("preview.parseError", { error: parsed.error })} />;
  if (parsed.data === undefined) return null;
  const root =
    Array.isArray(parsed.data) && (ext === "yaml" || ext === "yml") && parsed.data.length === 1
      ? parsed.data[0]
      : parsed.data;
  return (
    <div className="h-full overflow-auto p-3">
      <TreeNode name={nameOf(path)} value={root} depth={0} />
    </div>
  );
}

// ---- Excel ---------------------------------------------------------------------------------

export function SheetView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState(0);
  const loaded = useLoad(async () => {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    return readXlsxFile(await bytes(path));
  }, [path]);
  const rows = { data: loaded.data?.[sheet]?.data };
  if (loaded.error) return <Problem text={loaded.error} />;
  return (
    <div className="flex h-full flex-col">
      {loaded.data && loaded.data.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b border-border px-2 py-1">
          {loaded.data.map(({ sheet: name }, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setSheet(i)}
              className={cn(
                "rounded px-2 py-0.5 text-[12px]",
                i === sheet ? "bg-bg-active font-medium" : "hover:bg-bg-hover",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-[12px]">
          <tbody>
            {(rows.data ?? []).slice(0, 1000).map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity besides their position
              <tr key={r} className={r === 0 ? "sticky top-0 bg-bg-subtle font-semibold" : "hover:bg-bg-hover"}>
                {row.map((cell, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity besides their position
                  <td key={c} className="max-w-xs truncate border border-border px-2 py-1">
                    {cell instanceof Date ? cell.toLocaleString() : String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {(rows.data?.length ?? 0) > 1000 && (
          <p className="p-2 text-xs text-fg-subtle">{t("preview.truncated", { count: 1000 })}</p>
        )}
      </div>
    </div>
  );
}

// ---- Word ----------------------------------------------------------------------------------

export function DocxView({ path }: { path: string }) {
  const html = useLoad(async () => {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: await bytes(path) });
    return DOMPurify.sanitize(result.value);
  }, [path]);
  if (html.error) return <Problem text={html.error} />;
  return (
    <article
      className="prose-igrek mx-auto h-full max-w-3xl overflow-y-auto px-8 py-6"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify above
      dangerouslySetInnerHTML={{ __html: html.data ?? "" }}
    />
  );
}

// ---- PowerPoint: the text of each slide -----------------------------------------------------

export function PptxView({ path }: { path: string }) {
  const { t } = useTranslation();
  const slides = useLoad(async () => {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await bytes(path));
    const files = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const out: string[][] = [];
    for (const f of files) {
      const xml = (await zip.file(f)?.async("string")) ?? "";
      // Each paragraph (<a:p>) becomes a line; runs (<a:t>) inside it are joined.
      const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
        .map((p) => [...(p[1] ?? "").matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((r) => r[1] ?? "").join(""))
        .map((s) =>
          s
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, "&"),
        )
        .filter((s) => s.trim());
      out.push(paragraphs);
    }
    return out;
  }, [path]);
  if (slides.error) return <Problem text={slides.error} />;
  return (
    <div className="h-full space-y-3 overflow-y-auto bg-bg-subtle p-4">
      {slides.data?.map((lines, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: slides are in order
        <section key={i} className="mx-auto max-w-3xl rounded-ui border border-border bg-bg p-4">
          <p className="mb-2 text-[11px] text-fg-subtle">{t("preview.slide", { n: i + 1 })}</p>
          {lines.map((line, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are in order
            <p key={j} className={cn("text-[13px]", j === 0 && "text-[15px] font-semibold")}>
              {line}
            </p>
          ))}
          {!lines.length && <p className="text-xs text-fg-subtle">{t("preview.noText")}</p>}
        </section>
      ))}
    </div>
  );
}

// ---- PDF: pages, thumbnails, search, zoom, "ask about this page" --------------------------------

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

function PdfPage({
  doc,
  number,
  scale,
  className,
}: {
  doc: PdfDoc;
  number: number;
  scale: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: { cancel: () => void } | undefined;
    void doc.getPage(number).then((page) => {
      const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const el = canvas.current;
      if (!el) return;
      el.width = viewport.width;
      el.height = viewport.height;
      el.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const render = page.render({ canvasContext: ctx, viewport, canvas: el });
      task = render;
      render.promise.catch(() => undefined);
    });
    return () => task?.cancel();
  }, [doc, number, scale]);
  return <canvas ref={canvas} className={className} />;
}

export function PdfView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<number[]>();
  const doc = useLoad(async () => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return pdfjs.getDocument({ data: await bytes(path) }).promise;
  }, [path]);
  const pageText = async (n: number) => {
    if (!doc.data) return "";
    const content = await (await doc.data.getPage(n)).getTextContent();
    return content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  };
  const search = async () => {
    if (!doc.data || !query.trim()) return setHits(undefined);
    const found: number[] = [];
    for (let n = 1; n <= doc.data.numPages; n++)
      if ((await pageText(n)).toLowerCase().includes(query.toLowerCase())) found.push(n);
    setHits(found);
    if (found[0]) setPage(found[0]);
  };
  const pages = useMemo(() => Array.from({ length: doc.data?.numPages ?? 0 }, (_, i) => i + 1), [doc.data]);
  if (doc.error) return <Problem text={doc.error} />;
  if (!doc.data) return null;
  const pdf = doc.data;
  const tool = (icon: ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {icon}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1 text-[12px]">
        <span className="text-fg-muted">{t("preview.pageOf", { page, total: pdf.numPages })}</span>
        {tool(<Minus size={13} />, t("preview.zoomOut"), () => setScale((s) => Math.max(0.5, s - 0.2)))}
        <span className="w-10 text-center font-mono text-[11px]">{Math.round(scale * 100)}%</span>
        {tool(<Plus size={13} />, t("preview.zoomIn"), () => setScale((s) => Math.min(3, s + 0.2)))}
        <label className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5">
          <Search size={12} className="text-fg-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder={t("preview.searchPdf")}
            aria-label={t("preview.searchPdf")}
            className="w-40 bg-transparent text-[12px] outline-none"
          />
        </label>
        {hits && <span className="text-[11px] text-fg-subtle">{t("preview.hits", { count: hits.length })}</span>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() =>
            void pageText(page).then((text) =>
              actions.quickAsk({
                question: t("preview.askPageQ"),
                attachment: { name: `${nameOf(path)} · ${t("preview.page", { n: page })}`, text },
              }),
            )
          }
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] text-fg-muted hover:bg-bg-hover hover:text-accent"
        >
          <MessageSquareText size={12} aria-hidden="true" /> {t("preview.askPage")}
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-28 shrink-0 space-y-2 overflow-y-auto border-e border-border bg-bg-subtle p-2">
          {pages.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={cn(
                "block w-full rounded border p-0.5",
                n === page
                  ? "border-accent"
                  : hits?.includes(n)
                    ? "border-warning"
                    : "border-transparent hover:border-border",
              )}
              aria-label={t("preview.page", { n })}
            >
              <PdfPage doc={pdf} number={n} scale={0.15} className="mx-auto bg-white" />
              <span className="text-[10px] text-fg-subtle">{n}</span>
            </button>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-auto bg-bg-muted p-4">
          <PdfPage doc={pdf} number={page} scale={scale} className="mx-auto bg-white shadow-ui" />
        </div>
      </div>
    </div>
  );
}
