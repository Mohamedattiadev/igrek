import type { KnowledgeOverview, KnowledgeSources, NewsItem, PackageComparison } from "@godeye/core";
import { ExternalLink, Newspaper, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button, Card, EmptyState, PageHeader, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { compactNumber, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { useSettings } from "../lib/settings";

const VERDICT_TONE = { real: "success", hype: "warning", unclear: "neutral" } as const;
const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
const LIST_KEYS = ["hn", "reddit", "lobsters", "mastodon", "bluesky", "arxiv", "github", "feeds"] as const;

export function LibraryTabs({ active }: { active: "library" | "lessons" | "knowledge" }) {
  const { t } = useTranslation();
  const tabs = [
    { key: "library", to: "/library", label: t("library.title") },
    { key: "lessons", to: "/lessons", label: t("lessons.page") },
    { key: "knowledge", to: "/knowledge", label: t("knowledge.page") },
  ] as const;
  return (
    <div className="flex gap-1 text-[13px]">
      {tabs.map((tab) =>
        tab.key === active ? (
          <span key={tab.key} className="rounded-ui bg-bg-active px-3 py-1 font-medium">
            {tab.label}
          </span>
        ) : (
          <Link key={tab.key} to={tab.to} className="rounded-ui px-3 py-1 text-fg-muted hover:bg-bg-hover">
            {tab.label}
          </Link>
        ),
      )}
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const persona = personas.find((p) => p.id === item.personaId);
  const label = usePersonaLabel()(persona, item.personaId);
  return (
    <li className="space-y-1 px-pad py-2.5">
      <div className="flex items-start gap-2">
        <PersonaIcon persona={persona} size={12} className="mt-0.5 size-5" />
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 text-[13px] font-medium hover:underline"
        >
          {item.title}
          <ExternalLink size={11} className="ms-1 inline text-fg-subtle" aria-hidden="true" />
        </a>
        <Badge tone={VERDICT_TONE[item.verdict]}>{t(`knowledge.verdict_${item.verdict}`)}</Badge>
        <Badge>{t("knowledge.importance", { n: item.importance })}</Badge>
      </div>
      <p className="ps-7 text-[12.5px] leading-relaxed">{item.summary}</p>
      {item.why && <p className="ps-7 text-xs text-fg-muted">{item.why}</p>}
      <p className="ps-7 text-[11px] text-fg-subtle">
        {label.name} · {item.source}
        {item.mentions > 1 && ` · ${t("knowledge.mentions", { count: item.mentions })}`}
        {item.publishedAt && ` · ${relativeTime(item.publishedAt)}`}
        {item.affects.length > 0 && ` · ${t("knowledge.affects", { names: item.affects.join(", ") })}`}
      </p>
    </li>
  );
}

function SourcesEditor() {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [personaId, setPersonaId] = useState("devops");
  const [sources, setSources] = useState<KnowledgeSources>();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(false);
    api
      .knowledgeSources(personaId)
      .then(setSources)
      .catch(() => undefined);
  }, [personaId]);
  if (!sources) return null;
  return (
    <details className="rounded-ui border border-border bg-bg">
      <summary className="cursor-pointer px-pad py-2.5 text-[13px] font-semibold">{t("knowledge.sources")}</summary>
      <div className="space-y-2 border-t border-border p-pad">
        <p className="text-xs text-fg-muted">{t("knowledge.sourcesHint")}</p>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          aria-label={t("persona.picker")}
          className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p).name}
            </option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-2">
          {LIST_KEYS.map((key) => (
            <label key={key} className="block space-y-0.5">
              <span className="text-[11px] font-medium text-fg-muted">{t(`knowledge.src_${key}`)}</span>
              <input
                value={sources[key].join(", ")}
                onChange={(e) =>
                  setSources({
                    ...sources,
                    [key]: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                className={input}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sources.productHunt}
              onChange={(e) => setSources({ ...sources, productHunt: e.target.checked })}
            />
            Product Hunt
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={sources.hfPapers}
              onChange={(e) => setSources({ ...sources, hfPapers: e.target.checked })}
            />
            {t("knowledge.src_hfPapers")}
          </label>
          <div className="flex-1" />
          {saved && <span className="text-xs text-success">{t("knowledge.saved")}</span>}
          <Button
            size="sm"
            onClick={async () => {
              setSources(await api.setKnowledgeSources(personaId, sources));
              setSaved(true);
            }}
          >
            {t("persona.save")}
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">{t("knowledge.xNote")}</p>
      </div>
    </details>
  );
}

function Compare() {
  const { t } = useTranslation();
  const [text, setText] = useState("react, svelte");
  const [rows, setRows] = useState<PackageComparison[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setRows(
        await api.comparePackages(
          text
            .split(/[,\s]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const trend = (r: PackageComparison) =>
    r.weeklyDownloads && r.yearAgoDownloads
      ? Math.round(((r.weeklyDownloads - r.yearAgoDownloads) / r.yearAgoDownloads) * 100)
      : undefined;
  return (
    <Card className="space-y-2 p-pad">
      <p className="text-[13px] font-semibold">{t("knowledge.compare")}</p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          aria-label={t("knowledge.compare")}
          className={input}
        />
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? t("meeting.looking") : t("knowledge.compareDo")}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] text-fg-subtle">
              <tr className="border-b border-border">
                <th className="py-1.5 text-start font-medium">{t("knowledge.c_name")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_downloads")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_trend")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_stars")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_issues")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_release")}</th>
                <th className="px-2 text-end font-medium">{t("knowledge.c_hn")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="py-1.5 font-medium">
                    {r.repo ? (
                      <a href={r.repo} target="_blank" rel="noreferrer" className="hover:underline">
                        {r.name}
                      </a>
                    ) : (
                      r.name
                    )}
                    {r.error && <span className="ms-2 text-[11px] text-danger">{r.error}</span>}
                  </td>
                  <td className="px-2 text-end tabular-nums">
                    {r.weeklyDownloads !== undefined ? compactNumber(r.weeklyDownloads) : "–"}
                  </td>
                  <td className="px-2 text-end tabular-nums">
                    {trend(r) !== undefined ? `${(trend(r) ?? 0) > 0 ? "+" : ""}${trend(r)}%` : "–"}
                  </td>
                  <td className="px-2 text-end tabular-nums">{r.stars !== undefined ? compactNumber(r.stars) : "–"}</td>
                  <td className="px-2 text-end tabular-nums">
                    {r.openIssues !== undefined ? compactNumber(r.openIssues) : "–"}
                  </td>
                  <td className="px-2 text-end">
                    {r.lastRelease ? `${r.lastRelease.version} · ${relativeTime(r.lastRelease.at)}` : "–"}
                  </td>
                  <td className="px-2 text-end tabular-nums">{r.hnStories ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-fg-subtle">{t("knowledge.compareSources")}</p>
        </div>
      )}
    </Card>
  );
}

/** "What happened in your field this week" (plan.md 7.1b). */
export function KnowledgePage() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [persona, setPersona] = useState("");
  const [data, setData] = useState<KnowledgeOverview>();
  const load = () => {
    api
      .knowledge(persona || undefined)
      .then(setData)
      .catch(() => undefined);
  };
  useEffect(load, [persona]);
  useServerEvent("knowledge-changed", load);
  const touching = data?.items.filter((i) => i.affects.length) ?? [];

  return (
    <>
      <PageHeader
        title={t("knowledge.page")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={RefreshCw}
            disabled={data?.scanning}
            onClick={() => void api.scanKnowledge()}
          >
            {data?.scanning ? t("knowledge.scanning") : t("knowledge.scan")}
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <LibraryTabs active="knowledge" />
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("knowledge.intro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label={t("knowledge.schedule")}
            value={settings.knowledgeScan}
            onChange={(v) => void update({ knowledgeScan: v })}
            options={[
              { value: "off", label: t("knowledge.off") },
              { value: "daily", label: t("knowledge.daily") },
              { value: "weekly", label: t("knowledge.weekly") },
            ]}
          />
          <span className="text-xs text-fg-subtle">
            {data?.lastScan ? t("knowledge.lastScan", { when: relativeTime(data.lastScan) }) : t("knowledge.never")}
            {!settings.autoSummarize && ` · ${t("knowledge.needsAi")}`}
          </span>
          <div className="flex-1" />
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            aria-label={t("persona.picker")}
            className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
          >
            <option value="">{t("knowledge.allPersonas")}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p).name}
              </option>
            ))}
          </select>
        </div>

        {(touching.length > 0 || (data?.updates.length ?? 0) > 0) && (
          <Card className="space-y-2 p-pad">
            <p className="text-[13px] font-semibold">{t("knowledge.yourProjects")}</p>
            <ul className="space-y-1.5">
              {data?.updates.map((u) => (
                <li key={`${u.projectId}-${u.name}-${u.latest}`} className="text-[12.5px]">
                  <span className="font-medium">{u.projectName}</span> ·{" "}
                  <a href={u.url} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                    {u.name} {u.current} → {u.latest}
                  </a>
                  {u.notes && <p className="text-xs text-fg-muted">{u.notes}</p>}
                </li>
              ))}
            </ul>
            {touching.length > 0 && (
              <ul className="divide-y divide-border rounded-ui border border-border">
                {touching.slice(0, 6).map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Card>
        )}

        {((data?.rising.length ?? 0) > 0 || (data?.falling.length ?? 0) > 0) && (
          <Card className="grid gap-3 p-pad sm:grid-cols-2">
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-success">
                <TrendingUp size={12} aria-hidden="true" /> {t("knowledge.rising")}
              </p>
              <div className="flex flex-wrap gap-1">
                {data?.rising.map((tr) => (
                  <Badge key={tr.term} tone="success">
                    {tr.term} {tr.thisWeek}/{tr.before}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                <TrendingDown size={12} aria-hidden="true" /> {t("knowledge.falling")}
              </p>
              <div className="flex flex-wrap gap-1">
                {data?.falling.map((tr) => (
                  <Badge key={tr.term}>
                    {tr.term} {tr.thisWeek}/{tr.before}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-fg-subtle sm:col-span-2">{t("knowledge.trendHint")}</p>
          </Card>
        )}

        {data && data.items.length === 0 ? (
          <EmptyState icon={Newspaper} title={t("knowledge.page")} body={t("knowledge.empty")} />
        ) : (
          <Card>
            <p className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("knowledge.week")}</p>
            <ul className="divide-y divide-border">
              {[...(data?.items ?? [])]
                .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
                .slice(0, 60)
                .map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
            </ul>
          </Card>
        )}
        <Compare />
        <SourcesEditor />
      </div>
    </>
  );
}
