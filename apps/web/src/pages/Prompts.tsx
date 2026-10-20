import type { SavedPrompt } from "@igrek/core";
import { Copy, MessageSquarePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PromptUse } from "../components/PromptUse";
import { Badge, Button, Card, Dialog, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { duplicates, PROMPT_CATEGORIES, PROMPT_LIBRARY, variables } from "../lib/prompt-library";
import { deferDelete, usePendingDeletes } from "../lib/undo";

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

/** One ready-made prompt: what it does, and the two ways to use it. */
function LibraryItem({
  id,
  saved,
  onAdd,
  onUse,
}: {
  id: string;
  saved: boolean;
  onAdd: () => void;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col rounded-ui border border-border bg-bg p-3">
      <p className="text-[13px] font-medium">{t(`prompts.lib_${id}_title`)}</p>
      <p className="mt-1 line-clamp-3 flex-1 text-xs text-fg-muted">{t(`prompts.lib_${id}_body`)}</p>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        {saved ? (
          <Badge tone="success">{t("prompts.added")}</Badge>
        ) : (
          <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>
            {t("prompts.addMine")}
          </Button>
        )}
        <Button size="sm" icon={MessageSquarePlus} onClick={onUse}>
          {t("prompts.useInChat")}
        </Button>
      </div>
    </li>
  );
}

/** Saved prompts (plan.md 2.7), most used first, and a library of ready-made ones to start from. */
export function PromptsPage() {
  const { t } = useTranslation();
  const { isPending } = usePendingDeletes();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [editing, setEditing] = useState<Partial<SavedPrompt>>();
  const [using, setUsing] = useState<{ title: string; body: string; savedId?: string }>();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>();
  const load = () => {
    api
      .prompts()
      .then(setPrompts)
      .catch(() => undefined);
  };
  useEffect(load, []);
  const visible = prompts.filter((p) => !isPending(`prompt-${p.id}`));
  const tags = [...new Set(visible.flatMap((p) => p.tags))].sort();
  const q = query.trim().toLocaleLowerCase();
  const shown = visible.filter(
    (p) =>
      (!tag || p.tags.includes(tag)) &&
      (!q || `${p.title}\n${p.body}\n${p.tags.join(" ")}`.toLocaleLowerCase().includes(q)),
  );
  const copies = duplicates(visible);
  const removeCopies = () =>
    void Promise.all(copies.map((p) => api.deletePrompt(p.id)))
      .catch(() => undefined)
      .then(load);
  const savedBodies = new Set(visible.map((p) => p.body.trim()));
  const libraryText = (id: string) => ({ title: t(`prompts.lib_${id}_title`), body: t(`prompts.lib_${id}_body`) });
  const addFromLibrary = (id: string) => {
    const { title, body } = libraryText(id);
    void api
      .savePrompt({ title, body, tags: [t(`prompts.cat_${PROMPT_LIBRARY.find((p) => p.id === id)?.category}`)] })
      .then(load)
      .catch(() => undefined);
  };

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
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold">{t("prompts.mine")}</h2>
          {visible.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("prompts.emptyMine")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-ui border border-border bg-bg px-2.5 focus-within:border-accent">
                  <Search size={13} className="text-fg-subtle" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("prompts.search")}
                    aria-label={t("prompts.search")}
                    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  />
                </label>
                {tags.length > 0 &&
                  [undefined, ...tags].map((value) => (
                    <button
                      key={value ?? "all"}
                      type="button"
                      onClick={() => setTag(value)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[12px]",
                        tag === value ? "bg-bg-active font-medium text-fg" : "text-fg-muted hover:bg-bg-hover",
                      )}
                    >
                      {value ?? t("prompts.allTags")}
                    </button>
                  ))}
              </div>
              {copies.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-ui border border-warning bg-warning-soft px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1">{t("prompts.dupes", { count: copies.length })}</span>
                  <Button size="sm" icon={Trash2} onClick={removeCopies}>
                    {t("prompts.dupesClean")}
                  </Button>
                </div>
              )}
              {shown.length === 0 ? (
                <p className="text-[13px] text-fg-muted">{t("prompts.noMatch")}</p>
              ) : (
                <Card>
                  <ul className="divide-y divide-border">
                    {shown.map((prompt) => (
                      <li key={prompt.id} data-nav-item tabIndex={-1} className="space-y-1 px-pad py-3">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 text-[13.5px] font-medium">{prompt.title}</p>
                          {prompt.tags.map((name) => (
                            <Badge key={name}>{name}</Badge>
                          ))}
                          <span className="text-[11px] text-fg-subtle">
                            {t("prompts.uses", { count: prompt.uses })}
                          </span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap font-mono text-xs text-fg-muted">
                          {prompt.body}
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          {variables(prompt.body).map((v) => (
                            <Badge key={v} tone="accent">{`{${v}}`}</Badge>
                          ))}
                          <div className="flex-1" />
                          <Button
                            size="sm"
                            icon={MessageSquarePlus}
                            onClick={() => setUsing({ title: prompt.title, body: prompt.body, savedId: prompt.id })}
                          >
                            {t("prompts.useInChat")}
                          </Button>
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
                            aria-label={t("memory.delete")}
                            onClick={() =>
                              deferDelete(`prompt-${prompt.id}`, prompt.title, () => api.deletePrompt(prompt.id), load)
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </section>
        <section className="space-y-3">
          <div>
            <h2 className="text-[14px] font-semibold">{t("prompts.library")}</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">{t("prompts.libraryHint")}</p>
          </div>
          {PROMPT_CATEGORIES.map((category) => (
            <div key={category} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                {t(`prompts.cat_${category}`)}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PROMPT_LIBRARY.filter((p) => p.category === category).map(({ id }) => (
                  <LibraryItem
                    key={id}
                    id={id}
                    saved={savedBodies.has(libraryText(id).body.trim())}
                    onAdd={() => addFromLibrary(id)}
                    onUse={() => setUsing(libraryText(id))}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
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
      <PromptUse prompt={using} onClose={() => setUsing(undefined)} />
    </>
  );
}
