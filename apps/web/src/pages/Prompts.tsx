import type { SavedPrompt } from "@godeye/core";
import { BookMarked, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { variables } from "../components/PromptPicker";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";

function Editor({ prompt, onClose }: { prompt?: Partial<SavedPrompt>; onClose: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [body, setBody] = useState(prompt?.body ?? "");
  const [tags, setTags] = useState((prompt?.tags ?? []).join(", "));
  const save = async () => {
    await api.savePrompt({ id: prompt?.id, title, body, tags: tags.split(",") });
    onClose(true);
  };
  return (
    <div className="space-y-3 p-5">
      <h2 className="text-[15px] font-semibold">{prompt?.id ? t("prompts.titleLabel") : t("prompts.new")}</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("prompts.titleLabel")}
        className="h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={t("prompts.bodyLabel")}
        className="w-full resize-y rounded-ui border border-border bg-bg p-3 font-mono text-[12.5px] outline-none focus:border-accent"
      />
      <p className="text-[11px] text-fg-subtle">{t("prompts.bodyHint")}</p>
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={t("prompts.tags")}
        className="h-8 w-full rounded-ui border border-border bg-bg px-3 text-[12.5px] outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>
          {t("memory.cancel")}
        </Button>
        <Button variant="primary" disabled={!title.trim() || !body.trim()} onClick={save}>
          {t("prompts.save")}
        </Button>
      </div>
    </div>
  );
}

/** Saved prompts library (plan.md 2.7). Most used rise to the top. */
export function PromptsPage() {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [editing, setEditing] = useState<Partial<SavedPrompt>>();
  const load = () => {
    api
      .prompts()
      .then(setPrompts)
      .catch(() => undefined);
  };
  useEffect(load, []);

  return (
    <>
      <PageHeader
        title={t("prompts.title")}
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({})}>
            {t("prompts.new")}
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-4xl p-6">
        {prompts.length === 0 ? (
          <EmptyState icon={BookMarked} title={t("prompts.title")} body={t("prompts.empty")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {prompts.map((prompt) => (
                <li key={prompt.id} data-nav-item tabIndex={-1} className="group space-y-1 px-pad py-3">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[13.5px] font-medium">{prompt.title}</p>
                    {prompt.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                    <span className="text-[11px] text-fg-subtle">{t("prompts.uses", { count: prompt.uses })}</span>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap font-mono text-xs text-fg-muted">{prompt.body}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    {variables(prompt.body).map((v) => (
                      <Badge key={v} tone="accent">{`{${v}}`}</Badge>
                    ))}
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Copy}
                      onClick={() => navigator.clipboard?.writeText(prompt.body)}
                    >
                      {t("prompts.copy")}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(prompt)}>
                      {t("memory.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={async () => {
                        await api.deletePrompt(prompt.id);
                        load();
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(undefined)} label={t("prompts.new")}>
        {editing && (
          <Editor
            prompt={editing}
            onClose={(saved) => {
              setEditing(undefined);
              if (saved) load();
            }}
          />
        )}
      </Dialog>
    </>
  );
}
