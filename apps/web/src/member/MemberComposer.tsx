import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachButtons } from "../components/chat/Attachments";
import { Button } from "../components/ui";
import { Quoted } from "./MemberMessage";

export interface ComposerQuote {
  id: string;
  author?: string;
  text: string;
}

/**
 * The box to write in, as in Igrek: Enter sends, Shift+Enter makes a new line; a quoted reply
 * shows above it; editing my own message fills it and Esc cancels; files and voice messages go
 * beside it (channels only: direct messages carry text, as on a computer).
 */
export function MemberComposer({
  placeholder,
  quote,
  onClearQuote,
  editing,
  onCancelEdit,
  onSend,
  onFile,
  onTyping,
}: {
  placeholder: string;
  quote?: ComposerQuote;
  onClearQuote?: () => void;
  /** The text of my message being edited. */
  editing?: string;
  onCancelEdit?: () => void;
  onSend: (text: string) => Promise<void>;
  onFile?: (file: File) => Promise<void>;
  onTyping?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing !== undefined) setText(editing);
    box.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (quote) box.current?.focus();
  }, [quote]);
  const send = () => {
    if (!text.trim()) return;
    setError(undefined);
    onSend(text.trim())
      .then(() => setText(""))
      .catch((err: Error) => setError(err.message));
  };
  return (
    <div className="space-y-1">
      {quote && (
        <div className="flex items-start gap-2">
          <Quoted author={quote.author} text={quote.text} />
          <Button size="sm" variant="ghost" icon={X} onClick={onClearQuote} aria-label={t("teamChat.cancel")} />
        </div>
      )}
      {editing !== undefined && <p className="text-[11.5px] text-accent">{t("teamChat.editing")}</p>}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-accent">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && editing !== undefined) {
              setText("");
              onCancelEdit?.();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[13.5px] outline-none"
        />
        {onFile && editing === undefined && <AttachButtons onFile={onFile} onError={setError} />}
        <Button
          size="sm"
          variant="primary"
          icon={Send}
          disabled={!text.trim()}
          onClick={send}
          aria-label={t("teamChat.send")}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
