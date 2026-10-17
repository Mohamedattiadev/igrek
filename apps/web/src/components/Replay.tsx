import type { TranscriptMessage } from "@godeye/core";
import { ChevronLeft, ChevronRight, FilePen, Pause, Play, SkipBack } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { Badge, Button, Card } from "./ui";

const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

/** The file a tool step changed, from its line ("Edit: /path/to/file.ts"). */
function editedFile(m: TranscriptMessage, cwd?: string): string | undefined {
  if (m.kind !== "tool" || !m.toolName || !EDITS.has(m.toolName)) return undefined;
  const path = m.text.replace(/^[\w]+:\s*/, "").split(/\s/)[0];
  if (!path) return undefined;
  return cwd && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

/**
 * Agent replay (plan.md 13.1): every step of a session, one at a time, like rewinding a video.
 * Play, pause, step, or drag the bar; the side shows the files changed up to that point.
 */
export function Replay({ messages, cwd }: { messages: TranscriptMessage[]; cwd?: string }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const start = messages[0]?.ts ?? 0;
  const step = messages[index];
  useEffect(() => {
    if (!playing) return;
    if (index >= messages.length - 1) {
      setPlaying(false);
      return;
    }
    // Real gaps, shortened: long thinking pauses don't make you wait.
    const gap = Math.min(2500, Math.max(250, ((messages[index + 1]?.ts ?? 0) - (step?.ts ?? 0)) / 4)) / speed;
    const timer = setTimeout(() => setIndex((i) => i + 1), gap);
    return () => clearTimeout(timer);
  }, [playing, index, speed, messages, step]);
  const changed = useMemo(() => {
    const files = new Map<string, number>();
    for (const m of messages.slice(0, index + 1)) {
      const f = editedFile(m, cwd);
      if (f) files.set(f, (files.get(f) ?? 0) + 1);
    }
    return [...files];
  }, [messages, index, cwd]);
  const toolCount = messages.slice(0, index + 1).filter((m) => m.kind === "tool").length;
  if (!messages.length) return <p className="text-[13px] text-fg-subtle">{t("replay.empty")}</p>;
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={SkipBack}
            aria-label={t("replay.start")}
            onClick={() => setIndex(0)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={ChevronLeft}
            aria-label={t("replay.back")}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <Button size="sm" variant="primary" icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)}>
            {playing ? t("replay.pause") : t("replay.play")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={ChevronRight}
            aria-label={t("replay.next")}
            onClick={() => setIndex((i) => Math.min(messages.length - 1, i + 1))}
          />
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded px-1.5 text-xs",
                speed === s ? "bg-bg-active font-medium" : "text-fg-muted hover:bg-bg-hover",
              )}
            >
              {s}x
            </button>
          ))}
          <span className="ms-auto font-mono text-xs text-fg-muted">
            {index + 1} / {messages.length} · +{clock((step?.ts ?? start) - start)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={messages.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          aria-label={t("replay.position")}
          className="w-full accent-[var(--accent)]"
        />
        {step && (
          <Card className="space-y-2 p-pad">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  step.kind === "error"
                    ? "danger"
                    : step.kind === "tool"
                      ? "accent"
                      : step.role === "user"
                        ? "neutral"
                        : "success"
                }
              >
                {step.kind === "tool" ? (step.toolName ?? t("replay.tool")) : t(`replay.kind_${step.kind}`)}
              </Badge>
              <span className="text-[11px] text-fg-subtle">{new Date(step.ts).toLocaleTimeString()}</span>
            </div>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
              {step.text.slice(0, 20_000)}
            </pre>
          </Card>
        )}
        <ol className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
          {messages.map((m, i) => (
            <li
              key={m.id}
              className={cn(
                "flex-1",
                m.kind === "error"
                  ? "bg-danger"
                  : m.kind === "tool"
                    ? "bg-accent/50"
                    : m.role === "user"
                      ? "bg-fg-subtle"
                      : "bg-success/50",
                i > index && "opacity-25",
              )}
            />
          ))}
        </ol>
      </div>
      <aside className="w-full shrink-0 space-y-2 text-xs lg:w-64">
        <Card className="space-y-1 p-3">
          <p className="font-medium">{t("replay.sofar")}</p>
          <p className="text-fg-muted">{t("replay.steps", { count: toolCount })}</p>
          {changed.length ? (
            <ul className="space-y-0.5">
              {changed.map(([f, n]) => (
                <li key={f} className="flex items-center gap-1.5">
                  <FilePen size={12} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono" title={f}>
                    {f}
                  </span>
                  {n > 1 && <span className="text-fg-subtle">{n}x</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-subtle">{t("replay.noChanges")}</p>
          )}
        </Card>
      </aside>
    </div>
  );
}
