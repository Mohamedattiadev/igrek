import type { TerminalTool } from "@godeye/core";
import { ChevronDown, Plus, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Button } from "./ui";

const TOOLS: TerminalTool[] = ["claude", "codex", "gemini", "shell"];

/** "New session" button with a tool menu; opens the new terminal right away. */
export function NewSession({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .system()
      .then((s) => setInstalled(Object.fromEntries(s.tools.map((tool) => [tool.id, tool.found]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const start = async (tool: TerminalTool) => {
    setOpen(false);
    setError(undefined);
    try {
      const term = await api.startTerminal({ projectId, tool });
      navigate(`/t/${term.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        <Button variant="primary" size="sm" icon={Plus} onClick={() => start("claude")} className="rounded-e-none">
          {t("term.new")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("term.new")}
          className="rounded-s-none border-s border-white/20 px-1.5"
        >
          <ChevronDown size={13} />
        </Button>
      </div>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 w-48 rounded-ui border border-border bg-bg p-1 shadow-ui">
          {TOOLS.map((tool) => {
            const ok = tool === "shell" || installed[tool] !== false;
            return (
              <button
                key={tool}
                type="button"
                disabled={!ok}
                onClick={() => start(tool)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-bg-hover disabled:opacity-40"
              >
                <SquareTerminal size={14} className="text-fg-subtle" />
                <span className="flex-1">{t(`term.${tool}`)}</span>
                {!ok && <span className="text-[10px] text-fg-subtle">{t("term.notInstalled")}</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="absolute end-0 top-full mt-1 w-64 text-end text-xs text-danger">{error}</p>}
    </div>
  );
}
