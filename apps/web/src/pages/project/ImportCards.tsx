import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, field } from "../../components/ui";
import { request } from "../../lib/api";

const SOURCES = ["trello", "jira", "linear", "notion", "github"] as const;

/** Cards from Trello, Jira, Linear, Notion or a GitHub project onto this board (plan.md 13.6). */
export function ImportCards({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<(typeof SOURCES)[number]>("trello");
  const [owner, setOwner] = useState("");
  const [number, setNumber] = useState("");
  const [file, setFile] = useState<File>();
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={Download} onClick={() => setOpen(true)}>
        {t("imports.button")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("imports.title")}>
        <form
          className="space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            setNote(undefined);
            try {
              const body =
                source === "github" && !file
                  ? { source, owner, number: Number(number) }
                  : { source, text: await file?.text() };
              const r = await request<{ added: number; skipped: number }>(`/api/projects/${projectId}/import`, {
                method: "POST",
                body: JSON.stringify(body),
              });
              setNote(t("imports.done", { added: r.added, skipped: r.skipped }));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-[15px] font-semibold">{t("imports.title")}</h2>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as typeof source);
              setFile(undefined);
            }}
            className={`${field} w-full`}
            aria-label={t("imports.from")}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`imports.s_${s}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-fg-muted">{t(`imports.how_${source}`)}</p>
          {source === "github" ? (
            <div className="flex gap-2">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder={t("imports.owner")}
                aria-label={t("imports.owner")}
                className={`${field} min-w-0 flex-1`}
              />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={t("imports.number")}
                aria-label={t("imports.number")}
                className={`${field} w-28`}
              />
            </div>
          ) : (
            <input
              type="file"
              accept={source === "trello" ? ".json,application/json" : ".csv,text/csv"}
              onChange={(e) => setFile(e.target.files?.[0])}
              className="text-xs"
              aria-label={t("imports.file")}
            />
          )}
          <p className="text-[11px] text-fg-subtle">{t("imports.note")}</p>
          {note && <p className="text-xs text-success">{note}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("enhance.close")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || (source === "github" ? !owner || !number : !file)}
            >
              {busy ? t("imports.importing") : t("imports.import")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
