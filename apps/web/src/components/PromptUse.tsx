import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { useProjects } from "../lib/live";
import { fill, variables } from "../lib/prompt-library";
import { Button, Dialog } from "./ui";

/**
 * A prompt into a new chat: pick the project, fill the blanks, check the text, open the chat with
 * it in the box. Nothing is sent until the user presses send there.
 */
export function PromptUse({
  prompt,
  onClose,
}: {
  prompt?: { title: string; body: string; savedId?: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const chosen = projectId || projects[0]?.id || "";
  const text = prompt ? fill(prompt.body, values) : "";
  const open = async () => {
    if (!prompt || !chosen) return;
    setBusy(true);
    setError(undefined);
    try {
      if (prompt.savedId) await api.markPromptUsed(prompt.savedId).catch(() => undefined);
      const chat = await api.startChat({ projectId: chosen });
      void navigate(`/c/${chat.id}?draft=${encodeURIComponent(text)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!prompt} onClose={onClose} label={t("prompts.useTitle")}>
      {prompt && (
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">
          <div>
            <h2 className="text-[15px] font-semibold">{prompt.title}</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">{t("prompts.startHint")}</p>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-fg-muted">{t("prompts.project")}</span>
            <select
              value={chosen}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 w-full rounded-ui border border-border bg-bg px-2 text-[13px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {variables(prompt.body).map((name) => (
            <label key={name} className="block space-y-1">
              <span className="text-xs font-medium text-fg-muted">{name}</span>
              <input
                value={values[name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                className="h-8 w-full rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
              />
            </label>
          ))}
          <pre className="whitespace-pre-wrap rounded-ui bg-bg-subtle p-2.5 text-xs">{text}</pre>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("memory.cancel")}
            </Button>
            <Button variant="primary" icon={MessageSquarePlus} onClick={open} disabled={!chosen || busy}>
              {t("prompts.start")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
