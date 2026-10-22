import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { cn } from "../lib/cn";

type Model = {
  state: "missing" | "downloading" | "ready" | "failed";
  progress?: number;
  sizeMb: number;
  error?: string;
};
type Phase = "idle" | "downloading" | "recording" | "working";

/** Whisper hears at most 30 seconds at a time; a recording stops by itself there. */
const MAX_MS = 30_000;

/** A recording (any format the browser made) as 16 kHz mono samples, the way Whisper wants them. */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16_000)), 16_000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

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
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

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
      const samples = await toSamples(blob);
      const res = await fetch(`/api/speech?lang=${encodeURIComponent(i18n.language.split("-")[0] ?? "en")}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/octet-stream" },
        body: samples.slice(0, MAX_MS * 16).buffer,
      });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? t("voice.failed"));
      if (body.text) onText(body.text);
      else setError(t("voice.nothing"));
    } catch (err) {
      setError((err as Error).message || t("voice.failed"));
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
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
