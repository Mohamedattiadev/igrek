import { FileText, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Added = { name: string; path: string; readable: string[] };

/**
 * Files for a Claude chat (plan.md 19.1): a PDF, a text, a CSV, an Excel or Word file goes to
 * Igrek's folder for this chat, and the message names its path so Claude reads it with its own
 * tools; for Excel, Word and PowerPoint the text Igrek took out of it is named too.
 */
export function useChatAttachments(chatId: string) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<Added[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string>();
  const picker = useRef<HTMLInputElement>(null);
  const add = async (list: File[]) => {
    setError(undefined);
    setBusy((n) => n + list.length);
    for (const file of list) {
      try {
        const res = await fetch(
          `/api/chats/${encodeURIComponent(chatId)}/files?name=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/octet-stream" },
            body: file,
          },
        );
        const body = (await res.json()) as Added & { error?: string };
        if (!res.ok) throw new Error(body.error ?? t("chat.fileFailed"));
        setFiles((f) => [...f, body]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };
  /** The lines that go at the end of the message: what to read, where. */
  const note = () =>
    files.length
      ? `\n\n${t("chat.filesForClaude")}\n${files
          .flatMap((f) => [f.path, ...f.readable].map((p) => `- ${p}`))
          .join("\n")}`
      : "";
  const view = (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {(files.length > 0 || busy > 0 || error) && (
        <div className="flex flex-wrap items-center gap-2">
          {files.map((f, i) => (
            <span
              key={f.path}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2 py-1 text-[12.5px]"
            >
              <FileText size={13} className="text-accent" aria-hidden="true" />
              {f.name}
              {f.readable.length > 0 && <span className="text-fg-subtle">{t("chat.fileReadable")}</span>}
              <button
                type="button"
                aria-label={t("chat.removeFile", { name: f.name })}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-fg-subtle hover:text-fg"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {busy > 0 && <Loader2 size={14} className="animate-spin text-fg-subtle" aria-label={t("chat.fileAdding")} />}
          {error && <span className="text-[12px] text-danger">{error}</span>}
        </div>
      )}
    </>
  );
  return { pick: () => picker.current?.click(), view, note, clear: () => setFiles([]), add, ready: busy === 0 };
}
