import type { ChatMessage } from "@igrek/core";
import { Download, FileText, Loader2, Mic, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

const fileUrl = (hash: string) => `/api/chat/files/${hash}`;

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A file in a message: a picture or a voice message shows as it is, anything else as a download. */
export function AttachmentView({ file }: { file: NonNullable<ChatMessage["attachment"]> }) {
  const { t } = useTranslation();
  if (!file.here)
    return (
      <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-fg-subtle">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        {t("teamChat.fileComing", { name: file.name })}
      </p>
    );
  if (/^image\/(png|jpeg|gif|webp)$/.test(file.type))
    return (
      <a href={fileUrl(file.hash)} target="_blank" rel="noreferrer" className="mt-1.5 inline-block">
        <img
          src={fileUrl(file.hash)}
          alt={file.name}
          className="max-h-64 max-w-sm rounded-ui border border-border object-contain"
        />
      </a>
    );
  if (file.type.startsWith("audio/"))
    return (
      // biome-ignore lint/a11y/useMediaCaption: a voice message has no captions; its text comes with Whisper (19.1)
      <audio
        controls
        src={fileUrl(file.hash)}
        className="mt-1.5 h-9 max-w-xs"
        aria-label={t("teamChat.voiceMessage")}
      />
    );
  return (
    <a
      href={fileUrl(file.hash)}
      download={file.name}
      className="mt-1.5 inline-flex max-w-sm items-center gap-2.5 rounded-ui border border-border bg-bg-subtle px-3 py-2 hover:border-accent"
    >
      <FileText size={18} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{file.name}</span>
        <span className="block text-[11.5px] text-fg-subtle">{size(file.size)}</span>
      </span>
      <Download size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
    </a>
  );
}

/** Why the voice button cannot record here, if it cannot; the button stays and says so. */
function recordProblem(): string | undefined {
  if (typeof MediaRecorder === "undefined") return "teamChat.voiceNoRecorder";
  if (!navigator.mediaDevices?.getUserMedia) return "teamChat.voiceNoMic";
  return undefined;
}

/**
 * The paperclip and the voice button beside the composer. A voice message is recorded here
 * (MediaRecorder) and sent like any file; while recording, the time runs and one tap stops it.
 */
export function AttachButtons({
  onFile,
  onError,
}: {
  onFile: (file: File) => Promise<unknown>;
  /** What went wrong (no microphone, a file too big), shown under the composer; undefined clears it. */
  onError: (message?: string) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder>(undefined);
  const [seconds, setSeconds] = useState<number>();
  const [error, setOwnError] = useState<string>();
  const setError = (message?: string) => {
    setOwnError(message);
    onError(message);
  };
  useEffect(() => {
    if (seconds === undefined) return;
    const timer = setTimeout(() => setSeconds((s) => (s === undefined ? s : s + 1)), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  const send = (file: File) => void onFile(file).catch((err: Error) => setError(err.message));
  const record = async () => {
    const problem = recordProblem();
    if (problem) return setError(t(problem));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        setSeconds(undefined);
        const type = rec.mimeType.split(";")[0] || "audio/webm";
        if (chunks.length)
          send(new File(chunks, `${t("teamChat.voiceFile")}.${type.split("/")[1] ?? "webm"}`, { type }));
      };
      recorder.current = rec;
      rec.start();
      setError(undefined);
      setSeconds(0);
    } catch {
      setError(t("teamChat.voiceDenied"));
    }
  };
  const button = "rounded p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-fg";
  return (
    <div className="flex items-center gap-0.5 self-end">
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) send(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={t("teamChat.attach")}
        data-tip={t("teamChat.attach")}
        className={button}
      >
        <Paperclip size={16} aria-hidden="true" />
      </button>
      {seconds === undefined ? (
        <button
          type="button"
          onClick={() => void record()}
          aria-label={t("teamChat.voice")}
          data-tip={error ?? t("teamChat.voice")}
          className={cn(button, error && "text-warning")}
        >
          <Mic size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => recorder.current?.stop()}
          aria-label={t("teamChat.voiceStop")}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] font-medium text-danger hover:bg-bg-hover"
        >
          <Square size={12} aria-hidden="true" />
          {`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
        </button>
      )}
    </div>
  );
}
