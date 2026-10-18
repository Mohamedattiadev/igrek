import { AlertTriangle, CheckCircle2, CircleAlert, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mermaid } from "./Mermaid";

/**
 * Rich blocks inside Markdown (chat answers, reports): an AI writes a fenced block with a little
 * JSON and it is drawn as a real chart, stat tiles or meters. Languages: chart, stats, progress,
 * mermaid. Bad JSON shows the text with a note instead of a blank.
 *
 *   ```chart  {"type":"bar","title":"Commits per day","labels":["Mon","Tue"],"series":[{"name":"You","values":[4,7]}]}
 *   ```stats  [{"label":"Tests","value":"254","delta":"+12","tone":"good"}]
 *   ```progress [{"label":"Coverage","value":72,"max":100}]
 */
export const RICH_LANGS = ["chart", "stats", "progress", "mermaid"] as const;

type Tone = "good" | "warning" | "bad" | "neutral";
interface Series {
  name: string;
  values: number[];
}
interface ChartSpec {
  type?: "bar" | "hbar" | "line";
  title?: string;
  unit?: string;
  labels: string[];
  series: Series[];
}
interface Stat {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  hint?: string;
  tone?: Tone;
}
interface Meter {
  label: string;
  value: number;
  max?: number;
  tone?: Tone;
  note?: string;
}

const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return `${+n.toFixed(2)}`;
}

/** Clean axis ticks from 0 (or the minimum, when below 0) to a round maximum. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - Math.min(0, min), 1);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(Math.min(0, min) / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if ((out.at(-1) ?? 0) < max) out.push((out.at(-1) ?? 0) + step);
  return out;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg-muted">
      {series.map((s, i) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ spec }: { spec: ChartSpec }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-fg-subtle">
            <th className="py-1 pe-3 text-start font-medium" />
            {spec.series.map((s) => (
              <th key={s.name} className="py-1 pe-3 text-end font-medium">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.labels.map((label, i) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1 pe-3">{label}</td>
              {spec.series.map((s) => (
                <td key={s.name} className="py-1 pe-3 text-end tabular-nums">
                  {s.values[i] ?? ""}
                  {spec.unit && s.values[i] !== undefined ? ` ${spec.unit}` : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Frame({ spec, children }: { spec: ChartSpec; children: ReactNode }) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  return (
    <figure className="not-prose my-3 space-y-2 rounded-ui border border-border bg-bg p-3">
      <div className="flex items-start gap-2">
        <figcaption className="min-w-0 flex-1 text-[13px] font-semibold text-fg">
          {spec.title}
          {spec.unit && <span className="ms-1.5 text-[11.5px] font-normal text-fg-subtle">({spec.unit})</span>}
        </figcaption>
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-bg-hover hover:text-fg"
        >
          {table ? t("rich.chart") : t("rich.table")}
        </button>
      </div>
      <Legend series={spec.series} />
      {table ? <DataTable spec={spec} /> : children}
    </figure>
  );
}

/** Vertical columns, grouped by label; value on the cap of the highest column only. */
function Columns({ spec }: { spec: ChartSpec }) {
  const [hover, setHover] = useState<number>();
  const values = spec.series.flatMap((s) => s.values);
  const axis = ticks(Math.min(...values), Math.max(...values));
  const lo = axis[0] ?? 0;
  const hi = axis.at(-1) ?? 1;
  const W = 560;
  const H = 200;
  const left = 36;
  const bottom = 22;
  const plotW = W - left - 4;
  const plotH = H - bottom - 8;
  const y = (v: number) => 8 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / Math.max(spec.labels.length, 1);
  const n = spec.series.length;
  const bar = Math.min(24, (band * 0.7 - 2 * (n - 1)) / n);
  const peak = Math.max(...values);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={spec.title}>
        {axis.map((v) => (
          <g key={v}>
            <line x1={left} x2={W - 4} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--fg-subtle)">
              {compact(v)}
            </text>
          </g>
        ))}
        {spec.labels.map((label, i) => {
          const x0 = left + band * i + (band - (bar * n + 2 * (n - 1))) / 2;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover only shows the same values as the table view
            <g key={label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
              <rect x={left + band * i} y={8} width={band} height={plotH} fill="transparent" />
              {spec.series.map((s, j) => {
                const v = s.values[i] ?? 0;
                const top = y(Math.max(v, 0));
                const h = Math.max(Math.abs(y(v) - y(0)), 1);
                const r = Math.min(4, bar / 2, h);
                const x = x0 + j * (bar + 2);
                const d =
                  v >= 0
                    ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${top + h} Z`
                    : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + bar - r} Q${x + bar},${top + h} ${x + bar},${top + h - r} V${top} Z`;
                return (
                  <g key={s.name}>
                    <path
                      d={d}
                      fill={SERIES[j % SERIES.length]}
                      opacity={hover === undefined || hover === i ? 1 : 0.45}
                    />
                    {n === 1 && v === peak && (
                      <text x={x + bar / 2} y={top - 4} textAnchor="middle" fontSize={10.5} fill="var(--fg-muted)">
                        {compact(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={left + band * i + band / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--fg-subtle)"
              >
                {label.length > 12 ? `${label.slice(0, 11)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== undefined && <Tip spec={spec} index={hover} />}
    </div>
  );
}

/** Horizontal bars: long category names read best; value at the tip of every bar (few bars). */
function Bars({ spec }: { spec: ChartSpec }) {
  const s = spec.series[0] ?? { name: "", values: [] };
  const max = Math.max(...s.values, 0) || 1;
  return (
    <ul className="space-y-1.5">
      {spec.labels.map((label, i) => {
        const v = s.values[i] ?? 0;
        return (
          <li key={label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2 text-[12px]">
            <span className="truncate text-fg-muted" title={label}>
              {label}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 rounded-e-[4px]"
                style={{ width: `${Math.max((v / max) * 85, 0.5)}%`, background: SERIES[0] }}
              />
              <span className="tabular-nums text-fg-muted">
                {compact(v)}
                {spec.unit ? ` ${spec.unit}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Lines over the labels with a crosshair; the last value of each line is labeled at its end. */
function Lines({ spec }: { spec: ChartSpec }) {
  const [hover, setHover] = useState<number>();
  const values = spec.series.flatMap((s) => s.values);
  const axis = ticks(Math.min(...values), Math.max(...values));
  const lo = axis[0] ?? 0;
  const hi = axis.at(-1) ?? 1;
  const W = 560;
  const H = 200;
  const left = 36;
  const right = 40;
  const bottom = 22;
  const plotW = W - left - right;
  const plotH = H - bottom - 8;
  const count = Math.max(spec.labels.length - 1, 1);
  const x = (i: number) => left + (plotW * i) / count;
  const y = (v: number) => 8 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const every = Math.ceil(spec.labels.length / 8);
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={spec.title}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(spec.labels.length - 1, Math.round(((px - left) / plotW) * count))));
        }}
        onMouseLeave={() => setHover(undefined)}
      >
        {axis.map((v) => (
          <g key={v}>
            <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--fg-subtle)">
              {compact(v)}
            </text>
          </g>
        ))}
        {spec.labels.map((label, i) =>
          i % every === 0 ? (
            <text key={label} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--fg-subtle)">
              {label.length > 10 ? `${label.slice(0, 9)}…` : label}
            </text>
          ) : null,
        )}
        {hover !== undefined && (
          <line x1={x(hover)} x2={x(hover)} y1={8} y2={8 + plotH} stroke="var(--border-strong)" strokeWidth={1} />
        )}
        {spec.series.map((s, j) => {
          const color = SERIES[j % SERIES.length];
          const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const lastI = s.values.length - 1;
          const last = s.values[lastI];
          return (
            <g key={s.name}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {last !== undefined && (
                <>
                  <circle cx={x(lastI)} cy={y(last)} r={4} fill={color} stroke="var(--bg)" strokeWidth={2} />
                  <text x={x(lastI) + 7} y={y(last) + 3.5} fontSize={10.5} fill="var(--fg-muted)">
                    {compact(last)}
                  </text>
                </>
              )}
              {hover !== undefined && s.values[hover] !== undefined && (
                <circle
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r={4}
                  fill={color}
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </svg>
      {hover !== undefined && <Tip spec={spec} index={hover} />}
    </div>
  );
}

function Tip({ spec, index }: { spec: ChartSpec; index: number }) {
  return (
    <div className="pointer-events-none absolute end-1 top-1 rounded-md border border-border bg-bg px-2 py-1 text-[11.5px] shadow-ui">
      <p className="font-medium text-fg">{spec.labels[index]}</p>
      {spec.series.map((s, j) => (
        <p key={s.name} className="flex items-center gap-1.5 text-fg-muted">
          <span className="size-2 rounded-sm" style={{ background: SERIES[j % SERIES.length] }} />
          {spec.series.length > 1 && <span>{s.name}</span>}
          <span className="tabular-nums text-fg">
            {s.values[index] ?? ""}
            {spec.unit ? ` ${spec.unit}` : ""}
          </span>
        </p>
      ))}
    </div>
  );
}

const TONE_ICON = { good: CheckCircle2, warning: AlertTriangle, bad: CircleAlert, neutral: Minus } as const;
const TONE_TEXT = {
  good: "text-success",
  warning: "text-warning",
  bad: "text-danger",
  neutral: "text-fg-subtle",
} as const;

function Stats({ items }: { items: Stat[] }) {
  const { t } = useTranslation();
  return (
    <div className="not-prose my-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
      {items.map((s) => {
        const tone = s.tone ?? "neutral";
        const Icon = TONE_ICON[tone];
        const up = s.delta?.trim().startsWith("+");
        const down = s.delta?.trim().startsWith("-");
        return (
          <div key={s.label} className="rounded-ui border border-border bg-bg p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
              {s.tone && s.tone !== "neutral" && (
                <Icon size={12} className={TONE_TEXT[tone]} aria-label={t(`rich.tone_${tone}`)} />
              )}
              <span className="truncate">{s.label}</span>
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-fg">
              {s.value}
              {s.unit && <span className="ms-1 text-[12px] font-normal text-fg-subtle">{s.unit}</span>}
            </p>
            {(s.delta || s.hint) && (
              <p className="mt-1 flex items-center gap-1 text-[11.5px] text-fg-muted">
                {up && <TrendingUp size={12} aria-hidden="true" />}
                {down && <TrendingDown size={12} aria-hidden="true" />}
                {s.delta && <span className="tabular-nums">{s.delta}</span>}
                {s.hint && <span className="truncate text-fg-subtle">{s.hint}</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Meters({ items }: { items: Meter[] }) {
  const { t } = useTranslation();
  return (
    <ul className="not-prose my-3 space-y-2.5 rounded-ui border border-border bg-bg p-3">
      {items.map((m) => {
        const max = m.max ?? 100;
        const pct = Math.max(0, Math.min(100, (m.value / (max || 1)) * 100));
        const tone = m.tone ?? "neutral";
        const fill =
          tone === "bad"
            ? "var(--danger)"
            : tone === "warning"
              ? "var(--warning)"
              : tone === "good"
                ? "var(--success)"
                : "var(--series-1)";
        const Icon = TONE_ICON[tone];
        return (
          <li key={m.label}>
            <div className="mb-1 flex items-center gap-1.5 text-[12px]">
              {m.tone && m.tone !== "neutral" && (
                <Icon size={12} className={TONE_TEXT[tone]} aria-label={t(`rich.tone_${tone}`)} />
              )}
              <span className="min-w-0 flex-1 truncate text-fg">{m.label}</span>
              <span className="tabular-nums text-fg-muted">
                {m.value}
                {max === 100 ? "%" : ` / ${max}`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
            </div>
            {m.note && <p className="mt-0.5 text-[11px] text-fg-subtle">{m.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function Broken({ code, error }: { code: string; error: string }) {
  const { t } = useTranslation();
  return (
    <div className="not-prose my-3 rounded-ui border border-warning bg-warning-soft/30 p-2 text-xs">
      <p className="text-warning">{t("rich.broken", { error })}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-fg-muted">{code}</pre>
    </div>
  );
}

function asChart(raw: unknown): ChartSpec {
  const spec = raw as ChartSpec;
  if (!Array.isArray(spec?.labels) || !Array.isArray(spec?.series) || !spec.series.length)
    throw new Error("labels and series are needed");
  for (const s of spec.series)
    if (!Array.isArray(s?.values) || s.values.some((v) => typeof v !== "number"))
      throw new Error("every series needs numeric values");
  return { ...spec, series: spec.series.slice(0, SERIES.length), labels: spec.labels.map(String) };
}

/** One rich block from its fence language and text. */
export function RichBlock({ lang, code }: { lang: string; code: string }) {
  if (lang === "mermaid") return <Mermaid code={code} className="my-3" />;
  try {
    const raw = JSON.parse(code) as unknown;
    if (lang === "stats") {
      if (!Array.isArray(raw)) throw new Error("a list of stats is needed");
      return <Stats items={raw as Stat[]} />;
    }
    if (lang === "progress") {
      if (!Array.isArray(raw)) throw new Error("a list is needed");
      return <Meters items={raw as Meter[]} />;
    }
    const spec = asChart(raw);
    return (
      <Frame spec={spec}>
        {spec.type === "line" ? (
          <Lines spec={spec} />
        ) : spec.type === "hbar" ? (
          <Bars spec={spec} />
        ) : (
          <Columns spec={spec} />
        )}
      </Frame>
    );
  } catch (err) {
    return <Broken code={code} error={(err as Error).message} />;
  }
}
