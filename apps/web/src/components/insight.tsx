import type { CategoryScore } from "@godeye/core";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { dateTime } from "../lib/format";

/** Grade colours are status colours (good / warning / bad), always shown with the letter. */
export function gradeTone(grade: CategoryScore["grade"]): "success" | "warning" | "danger" {
  return grade === "A" || grade === "B" ? "success" : grade === "C" || grade === "D" ? "warning" : "danger";
}

const STROKE = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" };

export function ScoreRing({
  score,
  grade,
  size = 56,
}: {
  score: number;
  grade: CategoryScore["grade"];
  size?: number;
}) {
  const { t } = useTranslation();
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const tone = gradeTone(grade);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={t("insight.scoreLabel", { score, grade })}
      data-tip={t("insight.scoreTip", { score, grade })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          className="ge-ring"
          style={{ "--ring-from": (c * score) / 100 } as CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("font-semibold", size >= 56 ? "text-[15px]" : "text-[12px]")}>{score}</span>
        <span className="mt-0.5 text-[10px] font-medium text-fg-subtle">{grade}</span>
      </div>
    </div>
  );
}

/** Score over time. One series: no legend, the heading names it; hover shows each point. */
export function Trend({ points, height = 64 }: { points: { at: number; score: number }[]; height?: number }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number>();
  const width = 320;
  if (points.length < 2) return <p className="text-xs text-fg-subtle">{t("insight.trendEmpty")}</p>;
  const pad = 6;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (score: number) => pad + ((100 - score) * (height - pad * 2)) / 100;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const active = hover === undefined ? undefined : points[hover];
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full max-w-[320px] overflow-visible"
        role="img"
        aria-label={t("insight.trendLabel", { from: points[0]?.score, to: points.at(-1)?.score })}
        onPointerLeave={() => setHover(undefined)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <line x1={pad} x2={width - pad} y1={y(50)} y2={y(50)} stroke="var(--border)" strokeDasharray="2 3" />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {active && hover !== undefined && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad} y2={height - pad} stroke="var(--border-strong)" />
            <circle
              cx={x(hover)}
              cy={y(active.score)}
              r={4}
              fill="var(--series-1)"
              stroke="var(--bg)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {active && (
        <div className="pointer-events-none absolute -top-7 left-0 rounded-md bg-fg px-2 py-0.5 text-[11px] text-bg">
          {active.score} · {dateTime(active.at)}
        </div>
      )}
    </div>
  );
}

/** Mermaid, loaded only when a diagram is shown; strict mode (no scripts, no HTML from the text). */
export function Diagram({ code }: { code: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    void import("mermaid").then(async ({ default: mermaid }) => {
      const dark = document.documentElement.dataset.theme === "dark";
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "neutral",
        fontFamily: "inherit",
      });
      try {
        const { svg } = await mermaid.render(`m${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, id]);
  if (error) return <p className="text-xs text-fg-subtle">{t("insight.diagramFailed")}</p>;
  return <div ref={ref} className="overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" />;
}
