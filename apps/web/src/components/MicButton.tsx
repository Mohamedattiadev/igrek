import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { cn } from "../lib/cn";
import { transcribe as recognise, recordingProblem } from "../lib/speech";

type Model = {
  state: "missing" | "downloading" | "ready" | "failed";
  progress?: number;
  sizeMb: number;
  error?: string;
};
type Phase = "idle" | "downloading" | "recording" | "working";

/** A long message is fine: it is recognised in 30-second parts; past five minutes it stops by itself. */
const MAX_MS = 5 * 60_000;

/**
 * Speak instead of typing (plan.md 11), recognised by Igrek on this computer (apps/server/src/speech.ts):
 * the voice goes to no one, and it works in every browser, Brave and Chromium too, where the browser's
 * own recognition does not. The first use downloads the model once, after asking.
 */
export function MicButton({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState(0);
  const recorder = useRef<MediaRecorder>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  /** The model is there, or downloaded now (after asking); false when the user said no or it failed. */
  const ensureModel = async (): Promise<boolean> => {
    let model = await request<Model>("/api/speech");
    if (model.state === "ready") return true;
    if (model.state !== "downloading" && !window.confirm(t("voice.download", { size: model.sizeMb }))) return false;
    setPhase("downloading");
    if (model.state !== "downloading") model = await request<Model>("/api/speech/download", { method: "POST" });
    while (model.state === "downloading") {
      setProgress(model.progress ?? 0);
      await new Promise((r) => setTimeout(r, 1000));
      model = await request<Model>("/api/speech");
    }
    setPhase("idle");
    if (model.state !== "ready") setError(model.error ?? t("voice.failed"));
    return model.state === "ready";
  };

  const transcribe = async (blob: Blob) => {
    setPhase("working");
    try {
      const text = await recognise(blob, i18n.language.split("-")[0] ?? "en", (done, of) => setProgress(done / of));
      if (text) onText(text);
      else setError(t("voice.nothing"));
    } catch (err) {
      setError((err as Error).message || t("voice.failed"));
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    // This window cannot record at all (no MediaRecorder or microphone access): say so, do not hide.
    const problem = recordingProblem();
    if (problem) return setError(t(problem));
    setError(undefined);
    if (!(await ensureModel().catch(() => false))) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t("voice.denied"));
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearTimeout(timer.current);
      for (const track of stream.getTracks()) track.stop();
      void transcribe(new Blob(chunks, { type: rec.mimeType }));
    };
    recorder.current = rec;
    rec.start();
    setPhase("recording");
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
  };

  const busy = phase === "downloading" || phase === "working";
  const label =
    phase === "recording"
      ? t("voice.stop")
      : phase === "downloading"
        ? t("voice.downloading", { pct: Math.round(progress * 100) })
        : phase === "working"
          ? t("voice.working")
          : t("voice.start");
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (phase === "recording" ? recorder.current?.stop() : void start())}
      aria-label={label}
      aria-pressed={phase === "recording"}
      data-tip={error ?? (phase === "idle" ? t("voice.tip") : label)}
      className={cn(
        "rounded-md p-1.5 disabled:opacity-60",
        phase === "recording" ? "bg-danger-soft text-danger" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
        error && phase === "idle" && "text-danger",
        className,
      )}
    >
      {phase === "recording" ? (
        <Square size={13} fill="currentColor" aria-hidden="true" />
      ) : busy ? (
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      ) : (
        <Mic size={15} aria-hidden="true" />
      )}
    </button>
  );
}
