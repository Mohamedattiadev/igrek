import { slugify, type WikiPage } from "@godeye/core";
import { Brain, Eye, FileText, Link2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "../../components/Markdown";
import { Mermaid } from "../../components/Mermaid";
import { Button, Card, EmptyState } from "../../components/ui";
import { DocsSiteButton, LaunchKitButton, ReleaseNotesButton } from "../../components/Writeups";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { docsApi } from "../../lib/ops-api";

/** Markdown with ```mermaid blocks drawn as diagrams and [[Page]] links that open the page. */
export function WikiText({ body, pages, onOpen }: { body: string; pages: WikiPage[]; onOpen: (slug: string) => void }) {
  const parts = useMemo(() => body.split(/```mermaid\s*\n([\s\S]*?)```/), [body]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: links inside rendered Markdown are real anchors
    <div
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a[data-wiki]");
        if (a) {
          e.preventDefault();
          onOpen(a.getAttribute("data-wiki") ?? "");
        }
      }}
    >
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Mermaid
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
            key={i}
            code={part}
            className="my-3 overflow-auto rounded-ui border border-border p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
          />
        ) : (
          <Markdown
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
            key={i}
            className="prose-godeye"
            text={part.replace(/\[\[([^\]\n|]{1,80})(?:\|([^\]\n]*))?\]\]/g, (_m, title: string, shown?: string) => {
              const slug = slugify(title);
              const exists = pages.some((p) => p.slug === slug);
              return `<a href="#" data-wiki="${slug}" class="${exists ? "" : "wiki-missing"}">${shown || title}</a>`;
            })}
          />
        ),
      )}
    </div>
  );
}

function PageView({
  page,
  pages,
  projectId,
  onOpen,
  onSaved,
  onRemoved,
  startEditing,
}: {
  page: WikiPage | { id?: undefined; title: string; body: string };
  pages: WikiPage[];
  projectId: string;
  onOpen: (slug: string) => void;
  onSaved: (p: WikiPage) => void;
  onRemoved: () => void;
  startEditing: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [error, setError] = useState<string>();
  const [context, setContext] = useState<Awaited<ReturnType<typeof docsApi.pageContext>>>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the saved page changes
  useEffect(() => {
    if (page.id)
      docsApi
        .pageContext(page.id)
        .then(setContext)
        .catch(() => undefined);
  }, [page.id, "updatedAt" in page ? page.updatedAt : 0]);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t("wiki.title")}
              placeholder={t("wiki.title")}
              className="h-9 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2.5 text-[15px] font-semibold outline-none focus:border-accent"
            />
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{page.title}</h2>
          )}
          {editing ? (
            <>
              <Button variant="ghost" icon={Eye} onClick={() => setEditing(false)} disabled={!page.id}>
                {t("wiki.preview")}
              </Button>
              <Button
                variant="primary"
                icon={Save}
                onClick={async () => {
                  setError(undefined);
                  try {
                    const saved = await docsApi.savePage(projectId, {
                      id: page.id,
                      title,
                      body,
                    });
                    setEditing(false);
                    onSaved(saved);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {t("wiki.save")}
              </Button>
            </>
          ) : (
            <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              {t("wiki.edit")}
            </Button>
          )}
          {page.id && (
            <Button
              variant="ghost"
              icon={Trash2}
              aria-label={t("wiki.remove")}
              onClick={async () => {
                await docsApi.removePage(page.id as string);
                onRemoved();
              }}
            />
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {editing ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label={t("wiki.body")}
              spellCheck
              rows={22}
              className="w-full rounded-ui border border-border bg-bg p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
            />
            <p className="text-[11px] text-fg-subtle">{t("wiki.syntax")}</p>
          </>
        ) : body.trim() ? (
          <WikiText body={body} pages={pages} onOpen={onOpen} />
        ) : (
          <p className="text-[13px] text-fg-subtle">{t("wiki.emptyPage")}</p>
        )}
        {"updatedAt" in page && (
          <p className="text-[11px] text-fg-subtle">
            {t("wiki.updated", { when: relativeTime(page.updatedAt) })}
            {page.author && ` · ${page.author}`}
          </p>
        )}
      </div>
      {context && (context.backlinks.length > 0 || context.missing.length > 0 || context.memory.length > 0) && (
        <aside className="w-full shrink-0 space-y-3 text-xs xl:w-64">
          {context.backlinks.length > 0 && (
            <Card className="space-y-1 p-3">
              <p className="flex items-center gap-1.5 font-medium">
                <Link2 size={13} aria-hidden="true" />
                {t("wiki.backlinks")}
              </p>
              {context.backlinks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpen(slugify(b.title))}
                  className="block text-accent hover:underline"
                >
                  {b.title}
                </button>
              ))}
            </Card>
          )}
          {context.missing.length > 0 && (
            <Card className="space-y-1 p-3">
              <p className="font-medium">{t("wiki.missing")}</p>
              {context.missing.map((m) => (
                <button key={m} type="button" onClick={() => onOpen(m)} className="block text-fg-muted hover:underline">
                  {m}
                </button>
              ))}
            </Card>
          )}
          {context.memory.length > 0 && (
            <Card className="space-y-1.5 p-3">
              <p className="flex items-center gap-1.5 font-medium">
                <Brain size={13} aria-hidden="true" />
                {t("wiki.memory")}
              </p>
              {context.memory.map((m) => (
                <p key={m.id} className="text-fg-muted">
                  <span className="text-fg-subtle">{t(`memory.${m.section}`, { defaultValue: m.section })}: </span>
                  {m.text}
                </p>
              ))}
            </Card>
          )}
        </aside>
      )}
    </div>
  );
}

/** Project wiki (plan.md 12): Markdown pages with diagrams and [[links]], next to the project's memory. */
export function WikiTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<WikiPage[]>();
  const [open, setOpen] = useState<string>();
  const [draft, setDraft] = useState<{ title: string; body: string }>();
  const load = useCallback(
    () =>
      void docsApi
        .pages(projectId)
        .then((list) => {
          setPages(list);
          setOpen((o) => (o && list.some((p) => p.id === o) ? o : list[0]?.id));
        })
        .catch(() => undefined),
    [projectId],
  );
  useEffect(load, [load]);
  useServerEvent("docs-changed", (m) => m.projectId === projectId && load());
  const openSlug = (slug: string) => {
    const page = pages?.find((p) => p.slug === slug);
    if (page) {
      setDraft(undefined);
      setOpen(page.id);
    } else setDraft({ title: slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), body: "" });
  };
  const current = pages?.find((p) => p.id === open);
  if (pages && !pages.length && !draft)
    return (
      <EmptyState
        icon={FileText}
        title={t("wiki.emptyTitle")}
        body={t("wiki.emptyBody")}
        action={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setDraft({ title: t("wiki.firstTitle"), body: t("wiki.firstBody") })}
          >
            {t("wiki.new")}
          </Button>
        }
      />
    );
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <nav className="shrink-0 space-y-1 lg:w-52" aria-label={t("wiki.pages")}>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" icon={Plus} onClick={() => setDraft({ title: "", body: "" })}>
            {t("wiki.new")}
          </Button>
          <ReleaseNotesButton projectId={projectId} onSaved={load} />
          <LaunchKitButton projectId={projectId} onSaved={load} />
          <DocsSiteButton projectId={projectId} />
        </div>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {(pages ?? []).map((p) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDraft(undefined);
                  setOpen(p.id);
                }}
                className={cn(
                  "w-full truncate rounded-ui px-2.5 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                  !draft && p.id === open && "bg-bg-active font-medium",
                )}
              >
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {draft ? (
        <PageView
          key="draft"
          page={draft}
          pages={pages ?? []}
          projectId={projectId}
          onOpen={openSlug}
          startEditing
          onSaved={(p) => {
            setDraft(undefined);
            setOpen(p.id);
            load();
          }}
          onRemoved={() => setDraft(undefined)}
        />
      ) : current ? (
        <PageView
          key={current.id}
          page={current}
          pages={pages ?? []}
          projectId={projectId}
          onOpen={openSlug}
          startEditing={false}
          onSaved={load}
          onRemoved={load}
        />
      ) : null}
    </div>
  );
}
