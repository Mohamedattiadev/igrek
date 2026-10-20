import { ArrowUp, Folder, FolderOpen, FolderPlus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, fs } from "../lib/api";
import { Button, Segmented } from "./ui";

/**
 * Walk the folders to the one to add, instead of typing its path: starts in the home folder (or
 * the path typed so far), one click goes in, "Up" goes back. Folder names only, never files.
 */
function FolderBrowser({ start, onPick }: { start?: string; onPick: (path: string) => void }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(start);
  const [listing, setListing] = useState<Awaited<ReturnType<typeof fs.folders>>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    setError(undefined);
    fs.folders(at)
      .then((next) => current && setListing(next))
      .catch((err: Error) => {
        if (!current) return;
        // A typed path that does not open: start from the home folder instead.
        if (at && at === start) setAt(undefined);
        else setError(err.message);
      });
    return () => {
      current = false;
    };
  }, [at, start]);
  const join = (name: string) => `${listing?.path.replace(/[\\/]+$/, "")}/${name}`;
  return (
    <div className="rounded-ui border border-border bg-bg-subtle">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <button
          type="button"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && setAt(listing.parent)}
          aria-label={t("projects.browseUp")}
          title={t("projects.browseUp")}
          className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-40"
        >
          <ArrowUp size={14} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-muted">{listing?.path}</span>
        <Button size="sm" variant="primary" disabled={!listing} onClick={() => listing && onPick(listing.path)}>
          {t("projects.browsePick")}
        </Button>
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {listing?.folders.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => setAt(join(name))}
              onDoubleClick={() => onPick(join(name))}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
            >
              <Folder size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="min-w-0 truncate">{name}</span>
            </button>
          </li>
        ))}
        {listing && listing.folders.length === 0 && (
          <li className="px-2 py-1 text-[12.5px] text-fg-subtle">{t("projects.browseEmpty")}</li>
        )}
      </ul>
      {error && <p className="px-2 pb-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export type AddAs = "one" | "folder";

/**
 * A folder typed in, added as one project or as a folder of projects. Used on the Projects page
 * and on the first run, where it is the step that gives Igrek something to show.
 */
export function AddProjectForm({
  onAdded,
  autoFocus,
  actions,
}: {
  onAdded: (id: string, as: AddAs) => void;
  autoFocus?: boolean;
  /** Buttons beside "Add" (a dialog's "Cancel"). */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState("");
  const [as, setAs] = useState<AddAs>("one");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const add = async () => {
    if (!path.trim() || busy) return;
    setError(undefined);
    setBusy(true);
    try {
      const { id } = await api.addProject(path.trim(), as);
      onAdded(id, as);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder={t("projects.addHint")}
          aria-label={t("projects.addTitle")}
          // biome-ignore lint/a11y/noAutofocus: the folder is all this form asks for
          autoFocus={autoFocus}
          className="h-9 min-w-0 flex-1 rounded-ui border border-border bg-bg px-3 font-mono text-[13px] outline-none focus:border-accent"
        />
        <Button icon={FolderOpen} onClick={() => setBrowsing((v) => !v)} aria-expanded={browsing}>
          {t("projects.browse")}
        </Button>
      </div>
      {browsing && (
        <FolderBrowser
          start={path.trim() || undefined}
          onPick={(picked) => {
            setPath(picked);
            setBrowsing(false);
          }}
        />
      )}
      <Segmented
        label={t("projects.addAs")}
        value={as}
        onChange={setAs}
        options={(["one", "folder"] as const).map((value) => ({ value, label: t(`projects.addAs_${value}`) }))}
      />
      <p className="text-[12px] text-fg-muted">{t(`projects.addAsHint_${as}`)}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {actions}
        <Button variant="primary" icon={FolderPlus} onClick={() => void add()} disabled={!path.trim() || busy}>
          {t("projects.addAction")}
        </Button>
      </div>
    </div>
  );
}
