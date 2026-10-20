import { Languages, PencilLine, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type PackStatus } from "../lib/api";
import { loadPack } from "../lib/i18n";
import { useServerEvent } from "../lib/live";
import { Button, Dialog } from "./ui";

/** Keeps the shown texts current while a pack is being made (call once, in the shell). */
export function useLanguagePackSync(code: string): void {
  useServerEvent("i18n-progress", (message) => {
    if (message.code === code) void loadPack(code);
  });
}

/** Choosing a language without a pack starts making one (once; it then works offline). */
export function chooseLanguage(code: string, update: (patch: { language: string }) => Promise<void>): void {
  void update({ language: code }).then(async () => {
    const { status } = await api.languagePack(code);
    if (status.state === "none" || status.state === "failed") await api.generatePack(code);
  });
}

/** Under the language list: how complete the pack is, update it, and fix wrong translations. */
export function LanguagePackPanel({ code }: { code: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PackStatus>();
  const [fixing, setFixing] = useState(false);
  const load = () => {
    api
      .languagePack(code)
      .then((r) => setStatus(r.status))
      .catch(() => undefined);
  };
  useEffect(load, [code]);
  useServerEvent("i18n-progress", (message) => message.code === code && load());
  if (!status) return null;
  const percent = Math.round((status.done / Math.max(1, status.total)) * 100);
  return (
    <div className="mt-3 space-y-2 text-xs">
      {!status.bundled && (
        <div className="flex flex-wrap items-center gap-2">
          <Languages size={13} className="text-accent" aria-hidden="true" />
          <span className="text-fg-muted">
            {status.state === "generating"
              ? t("langpack.generating", { percent })
              : status.state === "ready"
                ? t("langpack.ready")
                : status.state === "none"
                  ? t("langpack.none")
                  : t("langpack.partial", { count: status.total - status.done })}
          </span>
          {status.state === "generating" ? (
            <div
              className="h-1.5 w-40 overflow-hidden rounded-full bg-bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("langpack.progress")}
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          ) : (
            status.state !== "ready" && (
              <Button
                size="sm"
                icon={status.state === "none" ? Languages : RefreshCw}
                onClick={() => void api.generatePack(code).then(setStatus)}
                data-tip={t("langpack.makeTip")}
              >
                {status.state === "none" ? t("langpack.make") : t("langpack.update")}
              </Button>
            )
          )}
          {status.error && <span className="text-warning">{status.error}</span>}
        </div>
      )}
      <Button size="sm" variant="ghost" icon={PencilLine} onClick={() => setFixing(true)}>
        {t("langpack.fix")}
      </Button>
      <TranslationEditor code={code} open={fixing} onClose={() => setFixing(false)} />
    </div>
  );
}

/** "This translation is wrong": search any text, correct it, and it changes right away. */
function TranslationEditor({ code, open, onClose }: { code: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ key: string; en: string; text: string; corrected: boolean }[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ key: string; text: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open)
      api
        .packRows(code)
        .then(setRows)
        .catch(() => undefined);
  }, [open, code]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? rows.filter((r) => `${r.text} ${r.en} ${r.key}`.toLowerCase().includes(q)) : rows).slice(0, 80);
  }, [rows, query]);
  const save = async (key: string, text: string | null) => {
    setError(undefined);
    try {
      await api.fixTranslation(code, key, text);
      setRows((all) => all.map((r) => (r.key === key ? { ...r, text: text ?? r.en, corrected: text !== null } : r)));
      setEditing(undefined);
      await loadPack(code);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={t("langpack.fix")} wide>
      <div className="flex max-h-[80vh] flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Languages size={15} aria-hidden="true" /> {t("langpack.fix")}
        </h2>
        <p className="text-xs text-fg-muted">{t("langpack.fixHint")}</p>
        <label className="flex h-8 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2">
          <Search size={13} className="text-fg-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("langpack.search")}
            aria-label={t("langpack.search")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-ui border border-border">
          {shown.map((r) => (
            <li key={r.key} className="space-y-1 p-2.5 text-[13px]">
              <p className="text-[11px] text-fg-subtle">{r.en}</p>
              {editing?.key === r.key ? (
                <div className="flex gap-2">
                  <input
                    value={editing.text}
                    onChange={(e) => setEditing({ key: r.key, text: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && void save(r.key, editing.text)}
                    aria-label={r.en}
                    className="h-8 min-w-0 flex-1 rounded-ui border border-accent bg-bg px-2 outline-none"
                  />
                  <Button size="sm" variant="primary" onClick={() => void save(r.key, editing.text)}>
                    {t("project.save")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing({ key: r.key, text: r.text })}
                    className="min-w-0 flex-1 text-start hover:text-accent"
                  >
                    {r.text}
                  </button>
                  {r.corrected && (
                    <button
                      type="button"
                      onClick={() => void save(r.key, null)}
                      className="text-[11px] text-fg-subtle hover:text-fg"
                      data-tip={t("langpack.undoTip")}
                    >
                      {t("langpack.undo")}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
