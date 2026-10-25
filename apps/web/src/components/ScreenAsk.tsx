import { Camera, MousePointer2, Send } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ScreenStep } from "../lib/api";
import { desktop, inDesktopApp } from "../lib/desktop";
import { ScreenSteps } from "./ScreenSteps";
import { Button, Dialog, Segmented } from "./ui";

const VOICE = "igrek.screen.voice";

function readVoice(): boolean {
  try {
    return localStorage.getItem(VOICE) === "1";
  } catch {
    return false;
  }
}

function keepVoice(on: boolean): void {
  try {
    localStorage.setItem(VOICE, on ? "1" : "0");
  } catch {
    // Remembering the choice is only a convenience.
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Shot {
  /** The picture as taken (never sent as it is). */
  data: string;
  width: number;
  height: number;
  /** Blacked out before anything leaves: found by Igrek, or drawn by the user. */
  boxes: Box[];
  ocr: boolean;
}

function loadImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The picture could not be read"));
    img.src = `data:image/png;base64,${data}`;
  });
}

/** The picture with every box filled black, as PNG base64: this is what the model gets. */
async function blackedOut(shot: Shot): Promise<string> {
  const img = await loadImage(shot.data);
  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "#000";
  for (const b of shot.boxes) ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

/**
 * The screen helper (desktop app, Ctrl+Shift+Space; after Clicky): a question about what is on the
 * screen. The picture is taken only when the user presses the button, every private detail Igrek
 * finds on it is blacked out on this computer, the user can black out more by dragging, and only the
 * blacked-out picture is sent, after "Send". The answer can point at a place on the picture.
 */
export function ScreenAsk() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  /** Ask about the screen, or have something done on it step by step. */
  const [mode, setMode] = useState<"ask" | "do">("ask");
  const [voice, setVoice] = useState(readVoice);
  const [steps, setSteps] = useState<ScreenStep[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [shot, setShot] = useState<Shot>();
  const [preview, setPreview] = useState<string>();
  const [answer, setAnswer] = useState<{ answer: string; point?: { x: number; y: number; label: string } }>();
  const [busy, setBusy] = useState<"capture" | "ask">();
  const [error, setError] = useState<string>();
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("igrek:screen-ask", show);
    return () => window.removeEventListener("igrek:screen-ask", show);
  }, []);
  useEffect(() => {
    if (!shot) return setPreview(undefined);
    let current = true;
    void blackedOut(shot).then((data) => current && setPreview(data));
    return () => {
      current = false;
    };
  }, [shot]);
  if (!inDesktopApp) return null;

  const capture = async () => {
    setBusy("capture");
    setError(undefined);
    setAnswer(undefined);
    try {
      const data = await desktop<string>("capture_screen");
      const img = await loadImage(data);
      const scan = await api.screenScan(data);
      setShot({ data, width: img.naturalWidth, height: img.naturalHeight, boxes: scan.boxes, ocr: scan.ocr });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const send = async () => {
    if (!shot || !question.trim()) return;
    setBusy("ask");
    setError(undefined);
    try {
      const image = await blackedOut(shot);
      const size = { width: shot.width, height: shot.height };
      const reply =
        mode === "ask"
          ? await api.screenAsk({ image, question, ...size })
          : await api.screenAct({ image, goal: question, ...size, done });
      setAnswer(reply);
      setSteps("steps" in reply ? reply.steps : []);
      if (voice && reply.answer)
        void desktop("speak", { text: reply.answer, language: i18n.language }).catch(() => undefined);
      // Where the answer points shows on the real screen too, for a few seconds.
      if ("point" in reply && reply.point)
        void desktop("show_pointer", { ...reply.point, ...size }).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  /** From a point on the shown picture to the picture's own pixels. */
  const toPicture = (event: PointerEvent) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || !shot) return { x: 0, y: 0 };
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * shot.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * shot.height),
    };
  };
  const close = () => {
    setOpen(false);
    setShot(undefined);
    setAnswer(undefined);
    setSteps([]);
    setDone([]);
  };

  return (
    <Dialog open={open} onClose={close} label={t("screen.ask.title")} wide>
      <div className="space-y-3 p-5 text-[13px]">
        <h2 className="text-[15px] font-semibold">{t("screen.ask.title")}</h2>
        <p className="text-fg-muted">{t("screen.ask.body")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label={t("screen.ask.mode")}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setSteps([]);
              setDone([]);
            }}
            options={[
              { value: "ask", label: t("screen.ask.modeAsk") },
              { value: "do", label: t("screen.ask.modeDo") },
            ]}
          />
          <label className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <input
              type="checkbox"
              checked={voice}
              onChange={(e) => {
                setVoice(e.target.checked);
                keepVoice(e.target.checked);
              }}
            />
            {t("screen.ask.voice")}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("screen.ask.placeholder")}
            aria-label={t("screen.ask.placeholder")}
            className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2"
          />
          <Button icon={Camera} onClick={() => void capture()} disabled={!!busy}>
            {shot ? t("screen.ask.again") : t("screen.ask.take")}
          </Button>
          <Button
            usesModel
            variant="primary"
            icon={Send}
            onClick={() => void send()}
            disabled={!shot || !question.trim() || !!busy}
          >
            {t("screen.ask.send")}
          </Button>
        </div>
        {busy && (
          <p className="text-fg-subtle">{busy === "capture" ? t("screen.ask.taking") : t("screen.ask.asking")}</p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {shot && (
          <p className="text-[12px] text-fg-muted">
            {shot.ocr ? t("screen.ask.hidden", { count: shot.boxes.length }) : t("screen.ask.noOcr")}{" "}
            {t("screen.ask.drag")}
          </p>
        )}
        {answer && (
          <div className="rounded-ui border border-border bg-bg-subtle p-3">
            <p className="whitespace-pre-wrap">{answer.answer}</p>
          </div>
        )}
        {shot && steps.length > 0 && (
          <ScreenSteps
            key={steps.map((x) => `${x.action}${x.x}${x.text}`).join("|")}
            steps={steps}
            size={{ width: shot.width, height: shot.height }}
            onDone={(what) => setDone((list) => [...list, what])}
          />
        )}
        {mode === "do" && done.length > 0 && <p className="text-[12px] text-fg-subtle">{t("screen.ask.next")}</p>}
        {preview && shot && (
          <div className="relative overflow-hidden rounded-ui border border-border">
            <img
              ref={imgRef}
              src={`data:image/png;base64,${preview}`}
              alt={t("screen.ask.previewAlt")}
              draggable={false}
              className="block w-full cursor-crosshair select-none"
              onPointerDown={(e) => {
                drag.current = toPicture(e);
              }}
              onPointerUp={(e) => {
                const start = drag.current;
                drag.current = undefined;
                const end = toPicture(e);
                if (!start || Math.abs(end.x - start.x) < 4 || Math.abs(end.y - start.y) < 4) return;
                const box = {
                  x: Math.min(start.x, end.x),
                  y: Math.min(start.y, end.y),
                  w: Math.abs(end.x - start.x),
                  h: Math.abs(end.y - start.y),
                };
                setShot({ ...shot, boxes: [...shot.boxes, box] });
              }}
            />
            {answer?.point && (
              <span
                className="pointer-events-none absolute flex -translate-x-1 -translate-y-1 items-center gap-1 text-accent"
                style={{
                  left: `${(answer.point.x / shot.width) * 100}%`,
                  top: `${(answer.point.y / shot.height) * 100}%`,
                }}
              >
                <MousePointer2 size={22} className="fill-accent drop-shadow" aria-hidden="true" />
                {answer.point.label && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-fg">
                    {answer.point.label}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <p className="text-[11.5px] text-fg-subtle">{t("screen.ask.privacy")}</p>
      </div>
    </Dialog>
  );
}
