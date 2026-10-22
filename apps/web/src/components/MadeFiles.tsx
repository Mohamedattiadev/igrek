import type { ChatEvent } from "@igrek/core";
import { Download, FileImage, FileText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import { nameOf, previewKind } from "../lib/files";
import { madeFiles } from "../lib/made-files";
import { FilePreview } from "./FilePreview";
import { Button, Dialog } from "./ui";

/**
 * The PDFs and pictures a chat made, opened in a window over the chat: no leaving it to find the
 * file. Only files that are really there are shown (an answer may name one it did not make).
 */
export function MadeFiles({ events, cwd }: { events: ChatEvent[]; cwd: string }) {
  const { t } = useTranslation();
  const named = useMemo(() => madeFiles(events, cwd), [events, cwd]);
  const [there, setThere] = useState<string[]>([]);
  const [open, setOpen] = useState<string>();
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
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="text-fg-muted">{t("chat.made")}</span>
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
      <Dialog open={open !== undefined} onClose={() => setOpen(undefined)} label={open ? nameOf(open) : ""} wide>
        {open && kind && (
          <div className="flex h-[min(78vh,900px)] flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={open}>
                {nameOf(open)}
              </span>
              <a
                href={fs.rawUrl(open, true)}
                className="inline-flex items-center gap-1 text-[12px] text-accent-hover underline"
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
              <FilePreview path={open} kind={kind} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
