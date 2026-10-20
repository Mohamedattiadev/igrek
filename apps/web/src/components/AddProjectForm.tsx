import { FolderPlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, Segmented } from "./ui";

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
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void add()}
        placeholder={t("projects.addHint")}
        aria-label={t("projects.addTitle")}
        // biome-ignore lint/a11y/noAutofocus: the folder is all this form asks for
        autoFocus={autoFocus}
        className="h-9 w-full rounded-ui border border-border bg-bg px-3 font-mono text-[13px] outline-none focus:border-accent"
      />
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
