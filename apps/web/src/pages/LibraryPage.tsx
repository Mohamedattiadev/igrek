import { citation, type EmbedderStatus, type LibraryHit, type LibraryItem } from "@godeye/core";
import { Download, Library, Link2, RotateCw, Search, Trash2, Upload } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { usePersonaLabel, usePersonas } from "../lib/personas";

const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

function ModelCard({ status }: { status: EmbedderStatus }) {
  const { t } = useTranslation();
  if (status.state === "ready") return null;
  return (
    <Card className="space-y-2 p-pad">
      <p className="text-[13px] font-semibold">{t("library.modelTitle")}</p>
      <p className="text-xs leading-relaxed text-fg-muted">{t("library.modelBody", { mb: status.sizeMb })}</p>
      {status.state === "downloading" ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-fg-subtle">
            {t("library.downloading", { n: Math.round((status.progress ?? 0) * 100) })}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" icon={Download} onClick={() => void api.downloadLibraryModel()}>
            {t("library.download", { mb: status.sizeMb })}
          </Button>
          {status.state === "failed" && <span className="text-xs text-danger">{status.error}</span>}
        </div>
      )}
    </Card>
  );
}

/** Who reads an item: everyone, or chosen personas. */
function ShelfPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  return (
    <select
      value={value[0] ?? ""}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      aria-label={t("library.shelf")}
      className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
    >
      <option value="">{t("library.everyone")}</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {label(p).name}
        </option>
      ))}
    </select>
  );
}

function ItemRow({ item }: { item: LibraryItem }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const busy = item.status === "queued" || item.status === "reading" || item.status === "embedding";
  return (
    <li className="group space-y-1 px-pad py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </p>
          <p className="truncate text-[11px] text-fg-subtle">
            {item.author ? `${item.author} · ` : ""}
            {t("library.parts", { count: item.chunks })} · {relativeTime(item.addedAt)}
            {item.uses > 0 && ` · ${t("library.used", { count: item.uses })}`}
          </p>
        </div>
        <Badge>{t(`library.kind_${item.kind}`)}</Badge>
        <Badge tone="accent">
          {item.personaIds.length
            ? item.personaIds
                .map(
                  (id) =>
                    label(
                      personas.find((p) => p.id === id),
                      id,
                    ).name,
                )
                .join(", ")
            : t("library.everyone")}
        </Badge>
        {item.status === "ready" && !item.embedded && <Badge tone="warning">{t("library.wordsOnly")}</Badge>}
        {item.status === "failed" && <Badge tone="danger">{t("library.failed")}</Badge>}
        <button
          type="button"
          aria-label={t("library.reindex")}
          onClick={() => void api.reindexLibraryItem(item.id)}
          className="p-1 text-fg-subtle opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100"
        >
          <RotateCw size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("persona.delete")}
          onClick={() => void api.removeLibraryItem(item.id)}
          className="p-1 text-fg-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>
      {busy && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-fg-subtle">{t(`library.status_${item.status}`)}</span>
        </div>
      )}
      {item.error && <p className="text-xs text-danger">{item.error}</p>}
    </li>
  );
}

/** Books, documents, pages and repos the personas read (plan.md 7.1). */
export function LibraryPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [status, setStatus] = useState<EmbedderStatus>();
  const [filter, setFilter] = useState(params.get("persona") ?? "");
  const [shelf, setShelf] = useState<string[]>(params.get("persona") ? [params.get("persona") as string] : []);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LibraryHit[]>();
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const label = usePersonaLabel();
  const { personas } = usePersonas();

  const load = () => {
    api
      .library(filter || undefined)
      .then(setItems)
      .catch(() => undefined);
    api
      .libraryStatus()
      .then(setStatus)
      .catch(() => undefined);
  };
  useEffect(load, [filter]);
  useServerEvent("library-changed", load);

  const addFiles = async (files: File[]) => {
    setError(undefined);
    for (const file of files) {
      try {
        await api.addLibraryFile(file, {
          personaIds: shelf,
          title: files.length === 1 ? title || undefined : undefined,
        });
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
    setTitle("");
  };
  const addUrl = async () => {
    setError(undefined);
    try {
      await api.addLibraryUrl(url, shelf);
      setUrl("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDrag(false);
    void addFiles([...event.dataTransfer.files]);
  };
  const search = async () => {
    if (!query.trim()) return;
    setHits(await api.searchLibrary(query, filter || undefined).catch(() => []));
  };

  return (
    <>
      <PageHeader title={t("library.title")} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex gap-1 text-[13px]">
          <span className="rounded-ui bg-bg-active px-3 py-1 font-medium">{t("library.title")}</span>
          <Link to="/lessons" className="rounded-ui px-3 py-1 text-fg-muted hover:bg-bg-hover">
            {t("lessons.page")}
          </Link>
        </div>
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("library.intro")}</p>
        {status && <ModelCard status={status} />}
        <Card className="space-y-3 p-pad">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop zone has a real button inside for keyboard users */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-ui border border-dashed p-5 text-center",
              drag ? "border-accent bg-accent-soft/40" : "border-border-strong",
            )}
          >
            <Upload size={18} className="text-fg-subtle" aria-hidden="true" />
            <p className="text-[13px]">{t("library.drop")}</p>
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              {t("library.choose")}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.epub,.md,.mdx,.markdown,.txt,.html,.htm"
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-60 flex-1 items-center gap-2">
              <Link2 size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && void addUrl()}
                placeholder={t("library.urlHint")}
                aria-label={t("library.url")}
                className={input}
              />
            </div>
            <Button onClick={() => void addUrl()} disabled={!url.trim()}>
              {t("library.add")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>{t("library.shelf")}</span>
            <ShelfPicker value={shelf} onChange={setShelf} />
            {title && <span className="text-fg-subtle">{t("library.forTitle", { title })}</span>}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </Card>

        <Card className="space-y-2 p-pad">
          <div className="flex items-center gap-2">
            <Search size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder={t("library.searchHint")}
              aria-label={t("library.search")}
              className={input}
            />
            <Button onClick={() => void search()} disabled={!query.trim()}>
              {t("library.search")}
            </Button>
          </div>
          {hits &&
            (hits.length === 0 ? (
              <p className="text-xs text-fg-muted">{t("library.noHits")}</p>
            ) : (
              <ol className="space-y-2">
                {hits.map((h) => (
                  <li key={`${h.itemId}-${h.location}-${h.score}`} className="rounded-ui border border-border p-2.5">
                    <p className="text-[12px] font-semibold text-accent">{citation(h)}</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">
                      {h.text}
                    </p>
                  </li>
                ))}
              </ol>
            ))}
        </Card>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t("library.shelf")}
            className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
          >
            <option value="">{t("library.allShelves")}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p).name}
              </option>
            ))}
          </select>
          <span className="text-xs text-fg-subtle">{t("library.count", { count: items.length })}</span>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={Library} title={t("library.title")} body={t("library.empty")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
