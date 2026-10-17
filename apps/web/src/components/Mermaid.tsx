import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

let loaded: Promise<typeof import("mermaid").default> | undefined;
let ready = "";

/** Mermaid is big; it is loaded the first time a diagram is shown. */
async function mermaid() {
  loaded ??= import("mermaid").then((m) => m.default);
  const m = await loaded;
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "neutral";
  if (ready !== theme) {
    m.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
    ready = theme;
  }
  return m;
}

/** A Mermaid diagram (ER, flowchart, sequence…), drawn as SVG. Bad syntax shows the error, not a blank. */
export function Mermaid({ code, className }: { code: string; className?: string }) {
  const { t } = useTranslation();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let stop = false;
    setError(undefined);
    mermaid()
      .then((m) => m.render(`m${id}${Date.now()}`, code))
      .then(({ svg }) => {
        if (!stop && box.current) box.current.innerHTML = svg;
      })
      .catch((err: Error) => !stop && setError(err.message));
    return () => {
      stop = true;
    };
  }, [code, id]);
  if (error)
    return (
      <div className="rounded-ui border border-warning bg-warning-soft/30 p-2 text-xs">
        <p className="font-medium">{t("diagram.error")}</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-fg-muted">{error.slice(0, 400)}</pre>
      </div>
    );
  return <div ref={box} className={className ?? "overflow-auto [&_svg]:mx-auto [&_svg]:max-w-full"} />;
}
