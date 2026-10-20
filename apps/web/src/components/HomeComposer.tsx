import type { ChatMode, ProjectListItem } from "@igrek/core";
import { FolderKanban, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Button, Segmented } from "./ui";

const LAST_PROJECT = "igrek.home.project";
const MODES: ChatMode[] = ["normal", "acceptEdits", "plan"];
const SUGGESTIONS = ["explain", "changes", "bugs", "tests"] as const;

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
    <section
      data-tour="composer"
      aria-label={t("home.title")}
      className="rounded-xl border border-border bg-bg-subtle p-4"
    >
      <h2 className="mb-2 text-[15px] font-semibold">{t("home.title")}</h2>
      <div className="rounded-ui border border-border bg-bg p-2 transition-colors focus-within:border-accent">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(8, Math.max(3, text.split("\n").length))}
          placeholder={t("home.placeholder")}
          aria-label={t("home.title")}
          className="w-full resize-none bg-transparent px-2 py-1 text-[14px] outline-none placeholder:text-fg-subtle"
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-ui border border-border bg-bg-subtle ps-2 text-[12.5px]">
            <FolderKanban size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            <span className="sr-only">{t("home.project")}</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-full min-w-0 max-w-56 truncate rounded-ui bg-transparent pe-1 outline-none"
            >
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label={t("home.mode")}
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({ value: m, label: t(`chat.mode_${m}`), tip: t(`chat.modeHint_${m}`) }))}
          />
          <div className="flex-1" />
          <span className="hidden text-[11px] text-fg-subtle md:inline">{t("home.enter")}</span>
          <Button variant="primary" icon={Send} onClick={() => void send()} disabled={!text.trim() || busy}>
            {busy ? t("home.starting") : t("chat.send")}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setText(t(`home.s_${key}`))}
            className="rounded-full border border-border bg-bg px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {t(`home.s_${key}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
