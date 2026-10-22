import type { SkillHit, SkillPreview } from "@igrek/core";
import { BadgeCheck, Download, LoaderCircle, Search, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber } from "../lib/format";
import { Markdown } from "./Markdown";
import { Badge, Button, Dialog } from "./ui";

/**
 * The "/" skill dictionary: search the official Anthropic skills and skills.sh, read a
 * skill and see what it would put on this computer (programs in it are named), install it in one click.
 * An installed skill is ready in the next message as /name.
 */
export function SkillsDialog({
  open,
  query,
  onClose,
  onUse,
}: {
  open: boolean;
  query: string;
  onClose: () => void;
  /** An installed skill to use now: its "/name ". */
  onUse: (insert: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState(query);
  const [hits, setHits] = useState<SkillHit[]>();
  const [errors, setErrors] = useState<string[]>([]);
  const [picked, setPicked] = useState<SkillPreview>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) setQ(query);
  }, [open, query]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(() => {
      api
        .searchSkills(q)
        .then((r) => {
          if (!current) return;
          setHits(r.hits);
          setErrors(r.errors);
        })
        .catch((err: Error) => current && setErrors([err.message]));
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, q]);

  const look = async (hit: SkillHit) => {
    setBusy(hit.id);
    setError(undefined);
    try {
      setPicked(await api.previewSkill(hit.source, hit.skill));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const install = async (skill: SkillPreview) => {
    setBusy(skill.id);
    setError(undefined);
    try {
      await api.installSkill(skill.source, skill.skill);
      setPicked({ ...skill, installed: true });
      setHits((list) => list?.map((h) => (h.id === skill.id ? { ...h, installed: true } : h)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} label={t("skills.title")} wide>
      <div className="flex h-[min(78vh,820px)] flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("skills.search")}
            aria-label={t("skills.search")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label={t("skills.close")} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="min-h-0 overflow-y-auto border-border p-1 md:border-e" aria-label={t("skills.results")}>
            {hits === undefined && <li className="p-3 text-xs text-fg-muted">{t("skills.loading")}</li>}
            {hits?.length === 0 && <li className="p-3 text-xs text-fg-muted">{t("skills.none")}</li>}
            {hits?.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => void look(hit)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-start hover:bg-bg-hover",
                    picked?.id === hit.id && "bg-bg-active",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {busy === hit.id && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
                    <span className="truncate">{hit.name}</span>
                    {hit.official && (
                      <BadgeCheck size={13} className="shrink-0 text-accent" aria-label={t("skills.official")} />
                    )}
                    {hit.installed && <Badge tone="success">{t("skills.installed")}</Badge>}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">
                    {hit.source}
                    {hit.installs !== undefined && ` · ${t("skills.installs", { n: compactNumber(hit.installs) })}`}
                  </span>
                  {hit.description && (
                    <span className="line-clamp-2 text-[11.5px] text-fg-muted">{hit.description}</span>
                  )}
                </button>
              </li>
            ))}
            {errors.map((e) => (
              <li key={e} className="p-2 text-[11px] text-danger">
                {e}
              </li>
            ))}
          </ul>
          <div className="min-h-0 overflow-y-auto p-3">
            {error && <p className="mb-2 text-xs text-danger">{error}</p>}
            {!picked && <p className="text-xs text-fg-muted">{t("skills.pick")}</p>}
            {picked && <SkillDetail skill={picked} busy={busy === picked.id} onInstall={install} onUse={onUse} />}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function SkillDetail({
  skill,
  busy,
  onInstall,
  onUse,
}: {
  skill: SkillPreview;
  busy: boolean;
  onInstall: (skill: SkillPreview) => Promise<void>;
  onUse: (insert: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold">{skill.name}</h3>
        <span className="text-xs text-fg-subtle">{skill.source}</span>
        <div className="flex-1" />
        {skill.installed ? (
          <Button size="sm" variant="primary" onClick={() => onUse(`/${skill.skill} `)}>
            {t("skills.use", { name: skill.skill })}
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={Download} disabled={busy} onClick={() => void onInstall(skill)}>
            {t("skills.install")}
          </Button>
        )}
      </div>
      {!skill.official && <p className="text-xs text-fg-muted">{t("skills.community")}</p>}
      {skill.license && <p className="text-xs text-fg-muted">{t("skills.license", { license: skill.license })}</p>}
      {skill.scripts.length > 0 && (
        <div className="flex gap-2 rounded-ui border border-warning bg-warning-soft/40 p-2 text-xs">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {t("skills.scripts", { count: skill.scripts.length })}{" "}
            <span className="font-mono">{skill.scripts.slice(0, 8).join(", ")}</span>
          </span>
        </div>
      )}
      <p className="text-xs text-fg-subtle">{t("skills.files", { count: skill.files.length })}</p>
      <Markdown text={skill.text.replace(/^---[\s\S]*?---\s*/, "")} className="prose-igrek max-w-none text-[12.5px]" />
    </div>
  );
}
