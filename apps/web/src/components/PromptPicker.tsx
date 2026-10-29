import type { SavedPrompt } from "@igrek/core";
import { BookMarked, Copy, CornerDownLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { fill, PROMPT_LIBRARY, variables } from "../lib/prompt-library";
import { Button, Dialog, field } from "./ui";

/**
 * Pick a saved prompt, fill its blanks, then type it into a terminal or copy it (plan.md 2.7).
 * With `open` it is opened from elsewhere (the chat's "+" menu) and shows no button of its own.
 */
export function PromptPicker({
  onUse,
  open: shown,
  onOpenChange,
}: {
  onUse: (text: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [own, setOwn] = useState(false);
  const open = shown ?? own;
  const setOpen = (value: boolean) => (onOpenChange ?? setOwn)(value);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  /** A saved prompt (with its id) or a ready-made one (without). */
  const [chosen, setChosen] = useState<{ id?: string; title: string; body: string }>();
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

  const apply = async (prompt: { id?: string }, text: string) => {
    if (prompt.id) await api.markPromptUsed(prompt.id);
    onUse(text);
    setOpen(false);
  };

  return (
    <>
      {shown === undefined && (
        <Button size="sm" variant="ghost" icon={BookMarked} onClick={() => setOpen(true)}>
          {t("nav.prompts")}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} label={t("nav.prompts")}>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {!chosen ? (
            <>
              <h2 className="text-[15px] font-semibold">{t("nav.prompts")}</h2>
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
              <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                {t("prompts.library")}
              </h3>
              {PROMPT_LIBRARY.map(({ id }) => {
                const ready = { title: t(`prompts.lib_${id}_title`), body: t(`prompts.lib_${id}_body`) };
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => (variables(ready.body).length ? setChosen(ready) : apply({}, ready.body))}
                    className="block w-full rounded-ui border border-border p-2.5 text-start hover:border-accent"
                  >
                    <p className="text-[13px] font-medium">{ready.title}</p>
                    <p className="line-clamp-2 text-xs text-fg-muted">{ready.body}</p>
                  </button>
                );
              })}
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
                    className={cn(field, "w-full")}
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
