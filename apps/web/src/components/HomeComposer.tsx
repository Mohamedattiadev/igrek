import type { ChatMode, ProjectListItem } from "@igrek/core";
import { FolderKanban, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Button } from "./ui";

const LAST_PROJECT = "igrek.home.project";
const MODES: ChatMode[] = ["normal", "acceptEdits", "plan"];

function readLast(): string | undefined {
  try {
    return localStorage.getItem(LAST_PROJECT) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The one place to type: write what you want, pick the project, Enter. A chat opens in that
 * project and the message goes out by itself.
 */
export function HomeComposer({ projects }: { projects: ProjectListItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const choices = useMemo(
    () => projects.filter((p) => !p.hidden && p.status !== "archived").sort((a, b) => b.lastActivity - a.lastActivity),
    [projects],
  );
  const [projectId, setProjectId] = useState(() => {
    const last = readLast();
    return choices.find((p) => p.id === last)?.id ?? choices[0]?.id ?? "";
  });
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ChatMode>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const send = async (value = text.trim()) => {
    if (!value || !projectId || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      localStorage.setItem(LAST_PROJECT, projectId);
    } catch {
      // The choice is only a convenience.
    }
    try {
      const chat = await api.startChat({ projectId, mode });
      void navigate(`/c/${chat.id}?draft=${encodeURIComponent(value)}&send=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!choices.length) return null;
  return (
    <section data-tour="composer" aria-label={t("home.title")}>
      <div className="rounded-xl border border-border bg-bg-subtle p-2 transition-colors focus-within:border-fg-subtle">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(8, Math.max(1, text.split("\n").length))}
          placeholder={t("home.placeholder")}
          aria-label={t("home.title")}
          className="w-full resize-none bg-transparent px-2 py-1 text-[14px] outline-none placeholder:text-fg-subtle"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2 text-[12.5px] text-fg-muted hover:bg-bg-hover">
            <FolderKanban size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            <span className="sr-only">{t("home.project")}</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-full min-w-0 max-w-56 cursor-pointer [field-sizing:content] truncate bg-transparent outline-none"
            >
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ChatMode)}
            aria-label={t("home.mode")}
            data-tip={t(`chat.modeHint_${mode}`)}
            className="h-7 cursor-pointer [field-sizing:content] rounded-full bg-transparent px-2 text-[12.5px] text-fg-muted outline-none hover:bg-bg-hover"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(`chat.mode_${m}`)}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Button size="sm" variant="primary" icon={Send} onClick={() => void send()} disabled={!text.trim() || busy}>
            {busy ? t("home.starting") : t("chat.send")}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
