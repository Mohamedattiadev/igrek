import type { UiElement, UiNote } from "@igrek/core";
import { MessageSquareText, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, request } from "../lib/api";
import { useServerEvent } from "../lib/live";
import { Button, Card } from "./ui";

export const saveUiNote = (projectId: string, element: UiElement, text: string) =>
  request<{ id: string }>(`/api/projects/${projectId}/ui-notes`, {
    method: "POST",
    body: JSON.stringify({ element, text }),
  });

const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** What a chat gets for the notes: where each is, and what to change there. */
function prompt(notes: UiNote[], intro: string): string {
  const where = (e: UiElement) =>
    [
      e.url.startsWith("igrek:") ? `Igrek screen ${e.url.slice(6)}` : `page ${e.url}`,
      `<${e.tag}> ${e.selector}`,
      e.source ? `source ${e.source}` : "",
      e.text ? `"${e.text}"` : "",
    ]
      .filter(Boolean)
      .join(", ");
  return `${intro}\n\n${notes.map((n, i) => `${i + 1}. ${where(n.element)}\n   ${n.text}`).join("\n")}`;
}

/**
 * The notes left on parts of the screen (plan.md 19.5), mine and teammates': each one sent to a
 * new chat on its own, or all of them at once; closed once dealt with.
 */
export function UiNotesPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<UiNote[]>([]);
  const load = useCallback(
    () =>
      void request<UiNote[]>(`/api/projects/${projectId}/ui-notes`)
        .then(setNotes)
        .catch(() => undefined),
    [projectId],
  );
  useEffect(load, [load]);
  useServerEvent("ui-notes-changed", (m) => m.projectId === projectId && load());
  const toChat = async (list: UiNote[]) => {
    const chat = await api.startChat({ projectId });
    void navigate(`/c/${chat.id}?draft=${encodeURIComponent(prompt(list, t("uiNotes.prompt")))}`);
  };
  const close = (ids: string[]) =>
    void request(`/api/projects/${projectId}/ui-notes/close`, { method: "POST", body: JSON.stringify({ ids }) }).then(
      load,
    );
  if (!notes.length) return null;
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex items-center gap-2">
        <MessageSquareText size={14} className="text-accent" aria-hidden="true" />
        <p className="flex-1 text-[13px] font-semibold">{t("uiNotes.title", { count: notes.length })}</p>
        {notes.length > 1 && (
          <Button size="sm" variant="primary" icon={Send} onClick={() => void toChat(notes)}>
            {t("uiNotes.applyAll")}
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border text-[12.5px]">
        {notes.map((n) => (
          <li key={n.id} className="space-y-1 py-1.5">
            <p className="flex items-baseline gap-2">
              <span className="font-medium">{n.mine ? capital(t("team.you")) : n.author}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">
                &lt;{n.element.tag}&gt; {n.element.text ?? n.element.selector}
              </span>
            </p>
            <p>{n.text}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={Send} onClick={() => void toChat([n])}>
                {t("uiNotes.apply")}
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => close([n.id])}>
                {t("uiNotes.close")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
