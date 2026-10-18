import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fs } from "../lib/api";
import { cn } from "../lib/cn";

const LEVEL =
  /\b(ERROR|ERR|FATAL|CRIT(ICAL)?|PANIC|EXCEPTION|FAIL(ED)?)\b|\b(WARN(ING)?)\b|\b(INFO|NOTICE)\b|\b(DEBUG|TRACE)\b/i;

function tone(line: string): string {
  const match = line.match(LEVEL);
  if (!match) return "";
  if (match[1]) return "text-danger";
  if (match[4]) return "text-warning";
  if (match[7]) return "text-accent";
  return "text-fg-subtle";
}

/** Log viewer: colored by level, filterable, follows the file like `tail -f` (plan.md 2.9). */
export function LogView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fs
        .tail(path)
        .then((r) => !stop && setText(r.text))
        .catch(() => undefined);
    void load();
    if (!follow) return;
    const timer = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [path, follow]);

  const lines = useMemo(() => {
    const q = filter.toLowerCase();
    return text
      .split("\n")
      .filter((line) => (!q || line.toLowerCase().includes(q)) && (!errorsOnly || tone(line) === "text-danger"));
  }, [text, filter, errorsOnly]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when new lines arrive
  useEffect(() => {
    if (follow) box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines, follow]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("preview.logFilter")}
          className="h-6 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[12px] outline-none"
        />
        <label className="flex items-center gap-1 text-[11px] text-fg-muted">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
          {t("preview.logErrors")}
        </label>
        <button
          type="button"
          onClick={() => setFollow((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 text-[11px]",
            follow ? "text-accent" : "text-fg-subtle",
          )}
        >
          {follow ? <Pause size={11} /> : <Play size={11} />}
          {t("preview.logFollow")}
        </button>
      </div>
      <pre ref={box} className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11.5px] leading-[1.55]">
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no identity
          <div key={i} className={tone(line)}>
            {line || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
