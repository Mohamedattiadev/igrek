import type { ChatEvent } from "@igrek/core";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileImage,
  FileText,
  Maximize,
  MessageSquarePlus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import { cn } from "../lib/cn";
import { nameOf, previewKind } from "../lib/files";
import { madeFiles } from "../lib/made-files";
import { FilePreview } from "./FilePreview";
import { Button, Dialog } from "./ui";

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** A picture with zoom (buttons, or Ctrl and the wheel) and "fit": a report screenshot was too small to read. */
function ImageView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<number>();
  const step = (dir: 1 | -1) =>
    setZoom((z) => {
      const now = z ?? 1;
      const next = dir > 0 ? ZOOMS.find((x) => x > now) : [...ZOOMS].reverse().find((x) => x < now);
      return next ?? now;
    });
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1 text-[12px]">
        <Button size="sm" variant="ghost" icon={ZoomOut} onClick={() => step(-1)} aria-label={t("chat.zoomOut")} />
        <span className="w-12 text-center tabular-nums text-fg-muted">
          {zoom ? `${Math.round(zoom * 100)}%` : t("chat.zoomFit")}
        </span>
        <Button size="sm" variant="ghost" icon={ZoomIn} onClick={() => step(1)} aria-label={t("chat.zoomIn")} />
        <Button size="sm" variant="ghost" icon={Maximize} onClick={() => setZoom(undefined)}>
          {t("chat.zoomFit")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setZoom(1)}>
          100%
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(var(--bg-muted)_0%_25%,var(--bg)_0%_50%)] bg-[length:16px_16px]"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          step(e.deltaY < 0 ? 1 : -1);
        }}
      >
        <img
          src={fs.rawUrl(path)}
          alt={nameOf(path)}
          className={cn("mx-auto", zoom ? "max-w-none" : "h-full max-w-full object-contain p-4")}
          style={zoom ? { width: `${zoom * 100}%` } : undefined}
        />
      </div>
    </div>
  );
}

/**
 * The PDFs and pictures a chat made, behind one button above the box (a long row of names crowded
 * it), opened in a window over the chat: pictures can be zoomed, copied, or sent back to be changed.
 * Only files that are really there are shown (an answer may name one it did not make).
 */
export function MadeFiles({
  events,
  cwd,
  onAsk,
}: {
  events: ChatEvent[];
  cwd: string;
  /** "Change this file": the request goes into the box, the user finishes it. */
  onAsk: (text: string) => void;
}) {
  const { t } = useTranslation();
  const named = useMemo(() => madeFiles(events, cwd), [events, cwd]);
  const [there, setThere] = useState<string[]>([]);
  const [list, setList] = useState(false);
  const [open, setOpen] = useState<string>();
  const [copied, setCopied] = useState(false);
  const key = named.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the list of names
  useEffect(() => {
    let current = true;
    void Promise.all(
      named.map((path) =>
        fetch(fs.rawUrl(path), { method: "HEAD" })
          .then((r) => (r.ok ? path : undefined))
          .catch(() => undefined),
      ),
    ).then((found) => current && setThere(found.filter((p): p is string => p !== undefined)));
    return () => {
      current = false;
    };
  }, [key]);
  if (!there.length) return null;
  const kind = open ? previewKind(open) : undefined;
  const copy = async (path: string) => {
    try {
      // The picture itself where the browser allows it, its path otherwise.
      if (previewKind(path) === "image" && "ClipboardItem" in window) {
        const blob = await (await fetch(fs.rawUrl(path))).blob();
        const png = blob.type === "image/png" ? blob : undefined;
        if (png) await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        else await navigator.clipboard.writeText(path);
      } else await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      await navigator.clipboard.writeText(path).catch(() => undefined);
    }
  };
  return (
    <div className="relative mb-1.5 text-[12.5px]">
      <button
        type="button"
        onClick={() => setList((v) => !v)}
        aria-expanded={list}
        className="inline-flex items-center gap-1.5 rounded-ui border border-border bg-bg-subtle px-2 py-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        <FileImage size={13} aria-hidden="true" />
        {t("chat.madeCount", { count: there.length })}
        <ChevronDown size={12} className={cn("transition-transform", list && "rotate-180")} aria-hidden="true" />
      </button>
      {list && (
        <div className="mt-1 flex flex-wrap gap-1.5 rounded-ui border border-border bg-bg p-1.5">
          {there.map((path) => {
            const Icon = previewKind(path) === "image" ? FileImage : FileText;
            return (
              <button
                key={path}
                type="button"
                onClick={() => setOpen(path)}
                title={path}
                className="inline-flex max-w-56 items-center gap-1 rounded-ui border border-border bg-bg-subtle px-2 py-0.5 hover:bg-bg-hover"
              >
                <Icon size={12} className="shrink-0 text-fg-muted" aria-hidden="true" />
                <span className="truncate">{nameOf(path)}</span>
              </button>
            );
          })}
        </div>
      )}
      <Dialog open={open !== undefined} onClose={() => setOpen(undefined)} label={open ? nameOf(open) : ""} wide>
        {open && kind && (
          <div className="flex h-[min(82vh,960px)] flex-col">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={open}>
                {nameOf(open)}
              </span>
              <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={() => void copy(open)}>
                {copied ? t("chat.madeCopied") : t("chat.madeCopy")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={MessageSquarePlus}
                onClick={() => {
                  onAsk(t("chat.madeEditAsk", { path: open }));
                  setOpen(undefined);
                }}
              >
                {t("chat.madeEdit")}
              </Button>
              <a
                href={fs.rawUrl(open, true)}
                className="inline-flex items-center gap-1 px-2 text-[12px] text-accent-hover underline"
              >
                <Download size={12} aria-hidden="true" />
                {t("chat.madeDownload")}
              </a>
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => setOpen(undefined)}
                aria-label={t("chat.madeClose")}
              />
            </div>
            <div className="min-h-0 flex-1">
              {kind === "image" ? <ImageView path={open} /> : <FilePreview path={open} kind={kind} />}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
