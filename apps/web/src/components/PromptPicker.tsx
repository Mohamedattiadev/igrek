import type { SavedPrompt } from "@godeye/core";
import { BookMarked, Copy, CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, Dialog } from "./ui";

export function variables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string))];
}

export function fill(body: string, values: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, name: string) => values[name] || match);
}

/** Pick a saved prompt, fill its blanks, then type it into a terminal or copy it (plan.md 2.7). */
export function PromptPicker({ onUse }: { onUse: (text: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [chosen, setChosen] = useState<SavedPrompt>();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open)
      api
        .prompts()
        .then(setPrompts)
        .catch(() => undefined);
    else {
      setChosen(undefined);
      setValues({});
    }
  }, [open]);

  const apply = async (prompt: SavedPrompt, text: string) => {
    await api.markPromptUsed(prompt.id);
    onUse(text);
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="ghost" icon={BookMarked} onClick={() => setOpen(true)}>
        {t("nav.prompts")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("nav.prompts")}>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {!chosen ? (
            <>
              <h2 className="text-[15px] font-semibold">{t("nav.prompts")}</h2>
              {prompts.length === 0 && <p className="text-[13px] text-fg-muted">{t("prompts.empty")}</p>}
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => (variables(prompt.body).length ? setChosen(prompt) : apply(prompt, prompt.body))}
                  className="block w-full rounded-ui border border-border p-2.5 text-start hover:border-accent"
                >
                  <p className="text-[13px] font-medium">{prompt.title}</p>
                  <p className="line-clamp-2 text-xs text-fg-muted">{prompt.body}</p>
                </button>
              ))}
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold">{t("prompts.fill")}</h2>
              {variables(chosen.body).map((name) => (
                <label key={name} className="block space-y-1">
                  <span className="text-xs font-medium text-fg-muted">{name}</span>
                  <input
                    value={values[name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                    className="h-8 w-full rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
                  />
                </label>
              ))}
              <pre className="whitespace-pre-wrap rounded-ui bg-bg-subtle p-2.5 text-xs">
                {fill(chosen.body, values)}
              </pre>
              <div className="flex justify-end gap-2">
                <Button icon={Copy} onClick={() => navigator.clipboard?.writeText(fill(chosen.body, values))}>
                  {t("prompts.copy")}
                </Button>
                <Button
                  variant="primary"
                  icon={CornerDownLeft}
                  onClick={() => apply(chosen, fill(chosen.body, values))}
                >
                  {t("prompts.use")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
