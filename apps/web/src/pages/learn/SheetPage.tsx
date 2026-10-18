import { compareVersions, LEVELS, type Level, type ProjectTech, type Sheet, type SheetItem } from "@godeye/learn";
import {
  ArrowLeft,
  ArrowUpCircle,
  Check,
  Copy,
  ExternalLink,
  Flag,
  Languages,
  Map as MapIcon,
  NotebookPen,
  Printer,
  Star,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router";
import { CodeBlock } from "../../components/CodeBlock";
import { Badge, Button, Card, PageHeader, Segmented } from "../../components/ui";
import { cn } from "../../lib/cn";
import { learnApi, textIn } from "../../lib/learn-api";
import { useSettings } from "../../lib/settings";
import { useProjects } from "../Personas";
import { type LearnIndex, useLearnIndex } from "./Learn";

/** A small copy button in the corner of a code block. */
function CopyIcon({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("team.copy")}
      data-tip={copied ? t("team.copied") : t("team.copy")}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-fg-subtle opacity-60 hover:bg-bg-hover hover:text-fg group-hover:opacity-100 print:hidden"
    >
      {copied ? <Check size={13} className="text-success" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

export function Code({ text, lang, label }: { text: string; lang?: string; label?: string }) {
  const code = text.replace(/\n$/, "");
  return (
    <div className="group relative">
      {label && <p className="mb-0.5 text-[10.5px] uppercase tracking-wide text-fg-subtle">{label}</p>}
      <div className="relative">
        <CodeBlock
          code={code}
          lang={lang}
          className="overflow-x-auto rounded-ui bg-bg-subtle p-2.5 pe-9 text-[12px] leading-relaxed"
        />
        <CopyIcon text={code} />
      </div>
    </div>
  );
}

function ItemCard({
  sheet,
  item,
  path,
  tx,
  index,
  setIndex,
  tech,
}: {
  sheet: Sheet;
  item: SheetItem;
  path: string;
  tx: ReturnType<typeof textIn>;
  index: LearnIndex;
  setIndex: (s: LearnIndex) => void;
  tech?: ProjectTech;
}) {
  const { t } = useTranslation();
  const key = `${sheet.id}/${item.id}`;
  const fav = index.state.favorites.includes(key);
  const note = index.state.notes[key];
  const reported = index.state.reports.find((r) => r.key === key);
  const [editing, setEditing] = useState<"note" | "report">();
  const [draft, setDraft] = useState("");
  const mark = (kind: "favorite" | "note" | "report", value: string | boolean) =>
    void learnApi.mark(kind, key, value).then((state) => setIndex({ ...index, state }));
  // The project has an older version than the one this needs.
  const tooOld = tech?.version && item.since && compareVersions(tech.version, item.since) < 0;
  return (
    <Card className="min-w-0 break-inside-avoid space-y-2 p-pad">
      <div id={item.id} className="flex scroll-mt-20 flex-wrap items-start gap-2">
        <h4 className="min-w-0 flex-1 text-[13.5px] font-semibold">{tx(item.title, `${path}.title`)}</h4>
        <Badge tone={item.level === "basic" ? "success" : item.level === "intermediate" ? "accent" : "warning"}>
          {t(`learn.level_${item.level}`)}
        </Badge>
        {item.since && <Badge>{t("learn.since", { v: item.since })}</Badge>}
        <button
          type="button"
          onClick={() => mark("favorite", !fav)}
          aria-label={t("learn.favorite")}
          aria-pressed={fav}
          className="print:hidden"
        >
          <Star size={14} className={fav ? "fill-warning text-warning" : "text-fg-subtle"} aria-hidden="true" />
        </button>
      </div>
      <p className="text-[13px] leading-relaxed">{tx(item.what, `${path}.what`)}</p>
      {tooOld && (
        <p className="flex items-start gap-1.5 rounded-ui bg-warning-soft px-2 py-1 text-xs text-warning">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("learn.tooOld", { have: tech?.version, need: item.since })}
        </p>
      )}
      <Code text={item.form} lang={item.lang} label={t("learn.form")} />
      {item.example && <Code text={item.example} lang={item.lang} label={t("learn.example")} />}
      {item.output && (
        <div>
          <p className="mb-0.5 text-[10.5px] uppercase tracking-wide text-fg-subtle">
            {t("learn.output")}
            {item.check && <span className="ms-1.5 normal-case text-success">{t("learn.verified")}</span>}
          </p>
          <pre className="overflow-x-auto rounded-ui border border-border p-2 font-mono text-[12px] text-fg-muted">
            {item.output.replace(/\n$/, "")}
          </pre>
        </div>
      )}
      <dl className="grid gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-[120px_1fr]">
        {item.mistake && (
          <>
            <dt className="text-danger">{t("learn.mistake")}</dt>
            <dd className="leading-relaxed">{tx(item.mistake, `${path}.mistake`)}</dd>
          </>
        )}
        {item.avoid && (
          <>
            <dt className="text-fg-subtle">{t("learn.avoid")}</dt>
            <dd className="leading-relaxed">{tx(item.avoid, `${path}.avoid`)}</dd>
          </>
        )}
        {item.older && (
          <>
            <dt className="text-fg-subtle">{t("learn.older")}</dt>
            <dd className="leading-relaxed">{tx(item.older, `${path}.older`)}</dd>
          </>
        )}
      </dl>
      {note && editing !== "note" && (
        <p className="rounded-ui bg-accent-soft px-2 py-1 text-[12.5px] whitespace-pre-wrap">{note}</p>
      )}
      {reported && <p className="text-[11.5px] text-warning">{t("learn.reported", { reason: reported.reason })}</p>}
      {editing && (
        <form
          className="space-y-1.5 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            mark(editing, draft);
            setEditing(undefined);
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            aria-label={editing === "note" ? t("learn.note") : t("learn.report")}
            placeholder={editing === "note" ? t("learn.noteHint") : t("learn.reportHint")}
            className="w-full rounded-ui border border-border bg-bg px-2 py-1.5 text-[13px] outline-none focus:border-accent"
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" type="submit">
              {t("learn.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
              {t("learn.cancel")}
            </Button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[11.5px] print:hidden">
        <a
          href={item.source}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-1 text-fg-muted hover:text-accent"
        >
          <ExternalLink size={12} aria-hidden="true" />
          <span className="truncate">{new URL(item.source).hostname}</span>
        </a>
        <div className="flex-1" />
        <button
          type="button"
          className="flex items-center gap-1 text-fg-muted hover:text-fg"
          onClick={() => {
            setDraft(note ?? "");
            setEditing("note");
          }}
        >
          <NotebookPen size={12} aria-hidden="true" />
          {note ? t("learn.editNote") : t("learn.note")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-fg-muted hover:text-warning"
          onClick={() => {
            setDraft(reported?.reason ?? "");
            setEditing("report");
          }}
        >
          <Flag size={12} aria-hidden="true" />
          {t("learn.report")}
        </button>
      </div>
      <p className="hidden text-[10px] text-fg-subtle print:block">{item.source}</p>
    </Card>
  );
}

/** One cheatsheet: levels, the project's version, notes, favorites, reports, print. */
export function SheetPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { sheetId = "" } = useParams();
  const { hash } = useLocation();
  const { settings } = useSettings();
  const { index: loaded } = useLearnIndex();
  const [index, setIndex] = useState<LearnIndex>();
  useEffect(() => setIndex(loaded), [loaded]);
  const [sheet, setSheet] = useState<Sheet>();
  const [translation, setTranslation] = useState<Record<string, string>>();
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string>();
  const [level, setLevel] = useState<Level | "all">(settings.mode === "simple" ? "basic" : "all");
  const [filter, setFilter] = useState("");
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [tech, setTech] = useState<ProjectTech>();
  useEffect(() => {
    learnApi
      .sheet(sheetId, lang)
      .then((r) => {
        setSheet(r.sheet);
        setTranslation(r.translation);
      })
      .catch((e: Error) => setError(e.message));
  }, [sheetId, lang]);
  // An item linked by #id is shown even if its level is filtered out.
  useEffect(() => {
    if (!sheet || !hash) return;
    setLevel("all");
    setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 50);
  }, [sheet, hash]);
  useEffect(() => {
    if (!projectId) return setTech(undefined);
    void learnApi
      .techs(projectId)
      .then((list) => setTech(list.find((x) => x.id === sheetId)))
      .catch(() => setTech(undefined));
  }, [projectId, sheetId]);
  const tx = useMemo(() => textIn(lang, translation), [lang, translation]);
  const latest = index?.latest.find((l) => l.sheet === sheetId);
  const needle = filter.trim().toLowerCase();
  const visible = (it: SheetItem, path: string) =>
    (level === "all" || it.level === level) &&
    (!needle ||
      `${tx(it.title, `${path}.title`)} ${it.form} ${tx(it.what, `${path}.what`)}`.toLowerCase().includes(needle));
  const other = lang !== "en" && lang !== "tr";
  return (
    <>
      <PageHeader
        title={sheet?.title ?? t("learn.title")}
        actions={
          <div className="flex items-center gap-1.5 print:hidden">
            {other && !translation && (
              <Button
                size="sm"
                icon={Languages}
                disabled={translating}
                onClick={() => {
                  setTranslating(true);
                  void learnApi
                    .translate("sheet", sheetId, lang)
                    .then(setTranslation)
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setTranslating(false));
                }}
              >
                {translating ? t("learn.translating") : t("learn.translate")}
              </Button>
            )}
            <Button size="sm" icon={Printer} onClick={() => window.print()}>
              {t("learn.print")}
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6 print:p-0">
        <Link to="/learn" className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg print:hidden">
          <ArrowLeft size={13} aria-hidden="true" /> {t("learn.back")}
        </Link>
        {error && <p className="text-xs text-danger">{error}</p>}
        {sheet && index && (
          <>
            <div className="space-y-1.5">
              <p className="text-[13.5px] leading-relaxed">{tx(sheet.summary, "summary")}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
                {sheet.version && <span>{t("learn.describes", { v: sheet.version })}</span>}
                <span>{t("learn.checked", { at: sheet.checked })}</span>
                {sheet.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-accent"
                  >
                    <ExternalLink size={11} aria-hidden="true" /> {s.title}
                  </a>
                ))}
                {sheet.roadmap && (
                  <Link to={`/learn/r/${sheet.roadmap}`} className="flex items-center gap-1 text-accent print:hidden">
                    <MapIcon size={11} aria-hidden="true" /> {t("learn.openRoadmap")}
                  </Link>
                )}
              </p>
              {latest?.behind && (
                <p className="flex items-start gap-1.5 rounded-ui bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                  <ArrowUpCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {t("learn.behind", { latest: latest.latest, v: sheet.version })}
                </p>
              )}
              {other && !translation && <p className="text-xs text-fg-subtle">{t("learn.englishShown")}</p>}
              {other && translation && <p className="text-xs text-fg-subtle">{t("learn.machine")}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Segmented
                value={level}
                onChange={setLevel}
                label={t("learn.level")}
                options={[
                  { value: "all" as const, label: t("learn.level_all") },
                  ...LEVELS.map((l) => ({ value: l, label: t(`learn.level_${l}`) })),
                ]}
              />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("learn.filter")}
                aria-label={t("learn.filter")}
                className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
              />
              {sheet.detect && (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  aria-label={t("learn.forProject")}
                  className="h-8 max-w-[220px] rounded-ui border border-border bg-bg px-2 text-[13px]"
                >
                  <option value="">{t("learn.forProject")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {projectId && (
              <p className={cn("text-xs", tech ? "text-accent" : "text-fg-subtle")}>
                {tech
                  ? tech.version
                    ? t("learn.projectUses", { v: tech.version, from: tech.from })
                    : t("learn.projectUsesNoV")
                  : t("learn.projectNot")}
              </p>
            )}
            {sheet.sections.map((sec, si) => {
              const items = sec.items
                .map((it, ii) => ({ it, path: `sections.${si}.items.${ii}` }))
                .filter(({ it, path }) => visible(it, path));
              return items.length ? (
                <section key={sec.id} className="space-y-2">
                  <h3 className="text-[13.5px] font-semibold">{tx(sec.title, `sections.${si}.title`)}</h3>
                  <div className="grid gap-3 lg:grid-cols-2 print:block print:space-y-2">
                    {items.map(({ it, path }) => (
                      <ItemCard
                        key={it.id}
                        sheet={sheet}
                        item={it}
                        path={path}
                        tx={tx}
                        index={index}
                        setIndex={setIndex}
                        tech={tech}
                      />
                    ))}
                  </div>
                </section>
              ) : null;
            })}
          </>
        )}
      </div>
    </>
  );
}
