import {
  type Category,
  type CategoryDetail,
  CHECK_SOURCES,
  type CoverageMap,
  type Finding,
  type InsightScan,
  type ProjectDetail,
  personaForCategory,
} from "@igrek/core";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  KeyRound,
  type LucideIcon,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Palette,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Comments } from "../../components/Comments";
import { Diagram, ScoreRing, Trend } from "../../components/insight";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import i18n from "../../lib/i18n";
import { useServerEvent } from "../../lib/live";
import { PersonaIcon, startPersonaChat, usePersonaLabel, usePersonas } from "../../lib/personas";
import { useSettings } from "../../lib/settings";
import { ApiMapView } from "./ApiMap";
import { BoardsList } from "./Boards";
import { EnvView } from "./EnvView";
import { ArchitectureCard, DesignCard, ImportCard, ScoringDialog, ToolsCard } from "./SectionsExtras";
import { DepsCard, SecretsCard } from "./Watchers";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  architecture: Network,
  frontend: Monitor,
  uiux: Palette,
  backend: Server,
  database: Database,
  devops: Boxes,
  security: ShieldCheck,
  testing: FlaskConical,
  performance: Gauge,
  docs: FileText,
  dependencies: Package,
};

type Latest = Awaited<ReturnType<typeof api.insight>>;
const hasScan = (l?: Latest): l is InsightScan & { scanning: boolean; trend: { at: number; overall: number }[] } =>
  !!l && "categories" in l;

function useInsight(projectId: string) {
  const [latest, setLatest] = useState<Latest>();
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .insight(projectId)
      .then(setLatest)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [projectId]);
  useServerEvent("insight-changed", (m) => m.projectId === projectId && load());
  return { latest, error, reload: load };
}

/**
 * Starts a chat in this project with a ready "fix this" prompt waiting in the box (nothing is sent yet).
 * It goes to the persona that owns the part, when that persona may edit files (plan.md 5 / 6.3).
 */
function useFix(projectId: string) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { personas } = usePersonas();
  const prepare = (finding: Finding) => {
    const t = settings.enhanceLanguage === "user" ? i18n.t.bind(i18n) : i18n.getFixedT("en");
    const where = finding.evidence
      .slice(0, 10)
      .map((e) => `- ${e.path}${e.line ? `:${e.line}` : ""}${e.note ? ` (${e.note})` : ""}`)
      .join("\n");
    const draft = [
      `## Goal\n${t(`insight.check.${finding.id}.fix`, { metric: finding.metric })}`,
      where ? `## Where\n${where}` : "",
      `## Done when\n- ${t("insight.fixDone", { check: t(`insight.check.${finding.id}.title`, { metric: finding.metric }) })}\n- ${t("insight.fixTests")}\n- ${t("insight.fixFocus")}`,
      CHECK_SOURCES[finding.id] ? `## Source\n${CHECK_SOURCES[finding.id]}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const owner = personaForCategory(
      finding.category,
      personas.filter((p) => p.tools === "edit"),
    );
    return { draft, owner };
  };
  return {
    /** A chat with the part's owner, the prompt waiting in the box. */
    inChat: async (finding: Finding) => {
      const { draft, owner } = prepare(finding);
      const chat = await api.startChat({ projectId, personaId: owner?.id });
      void navigate(`/c/${chat.id}?draft=${encodeURIComponent(draft)}`);
    },
    /** The owner fixes it in its own copy; the checks must pass and nothing merges without you. */
    inCopy: async (finding: Finding) => {
      const { draft, owner } = prepare(finding);
      const run = await api.startFlow({ projectId, flow: "task", request: draft, persona: owner?.id });
      void navigate(`/runs/${run.id}`);
    },
  };
}

/** Which folders have tests and which big files have none (plan.md 6.1c). */
function CoverageCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [map, setMap] = useState<CoverageMap>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setMap(await api.coverageMap(projectId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = (tested: number, files: number, percent?: number) =>
    percent ?? (files ? Math.round((tested / files) * 100) : 0);
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">{t("coverage.title")}</h3>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={RefreshCw} disabled={busy} onClick={() => void load()}>
          {map ? t("coverage.again") : t("coverage.make")}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!map && !error && <p className="text-xs text-fg-muted">{t("coverage.hint")}</p>}
      {map && (
        <>
          <p className="text-[13px]">
            {map.source === "report"
              ? t("coverage.fromReport", { percent: map.percent ?? 0, report: map.report })
              : t("coverage.static", { tested: map.tested, files: map.files })}
          </p>
          <ul className="space-y-1">
            {map.folders.map((f) => {
              const pct = share(f.tested, f.files, f.percent);
              return (
                <li key={f.path} className="grid grid-cols-[minmax(0,1fr)_120px_48px] items-center gap-2 text-[12px]">
                  <span className="truncate font-mono text-[11.5px]">{f.path}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger",
                      )}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </span>
                  <span className="text-end tabular-nums text-fg-muted">{pct}%</span>
                </li>
              );
            })}
          </ul>
          {map.untested.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-fg-muted">{t("coverage.untested")}</summary>
              <ul className="mt-1 space-y-0.5">
                {map.untested.map((f) => (
                  <li key={f.path} className="flex gap-2 font-mono text-[11.5px]">
                    <span className="min-w-0 flex-1 truncate">{f.path}</span>
                    <span className="text-fg-subtle">{t("coverage.lines", { n: f.lines })}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {map.source === "static" && <p className="text-[11px] text-fg-subtle">{t("coverage.staticNote")}</p>}
        </>
      )}
    </Card>
  );
}

function StatusIcon({ status }: { status: Finding["status"] }) {
  if (status === "pass") return <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />;
  if (status === "warn") return <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" />;
  return <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" />;
}

function FindingRow({
  finding,
  projectId,
  onFix,
  onFixInCopy,
}: {
  finding: Finding;
  projectId: string;
  onFix: (f: Finding) => void;
  onFixInCopy: (f: Finding) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(
    finding.status !== "pass" && finding.evidence.length > 0 && finding.evidence.length <= 3,
  );
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <StatusIcon status={finding.status} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {t(`insight.check.${finding.id}.title`, { metric: finding.metric })}
          </p>
          {finding.status !== "pass" && (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              {t(`insight.check.${finding.id}.fix`, { metric: finding.metric })}
              {CHECK_SOURCES[finding.id] && (
                <a
                  href={CHECK_SOURCES[finding.id]}
                  target="_blank"
                  rel="noreferrer"
                  className="ms-1.5 inline-flex items-center gap-0.5 text-accent hover:underline"
                >
                  <ExternalLink size={10} aria-hidden="true" />
                  {t("insight.source")}
                </a>
              )}
            </p>
          )}
          {finding.evidence.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-1 text-[11px] text-accent hover:underline"
            >
              {open ? t("insight.hideEvidence") : t("insight.showEvidence", { count: finding.evidence.length })}
            </button>
          )}
          {open && (
            <ul className="mt-1 space-y-0.5">
              {finding.evidence.map((e) => (
                <li key={`${e.path}:${e.line ?? ""}:${e.note ?? ""}`} className="font-mono text-[11px]">
                  <Link
                    to={`/p/${projectId}?tab=code&file=${encodeURIComponent(e.path)}${e.line ? `&line=${e.line}` : ""}`}
                    className="text-fg-muted hover:text-accent hover:underline"
                    data-tip={t("insight.openFile")}
                  >
                    {e.path}
                    {e.line ? `:${e.line}` : ""}
                  </Link>
                  {e.note && <span className="ms-1.5 text-fg-subtle">{e.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {finding.status !== "pass" && (
          <>
            {finding.gain > 0 && (
              <span data-tip={t("insight.gainTip", { points: finding.gain })}>
                <Badge tone="accent">+{finding.gain}</Badge>
              </span>
            )}
            <Button size="sm" icon={Wrench} onClick={() => onFix(finding)} data-tip={t("insight.fixTip")}>
              {t("insight.fix")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={GitBranch}
              onClick={() => onFixInCopy(finding)}
              data-tip={t("insight.fixInCopyTip")}
              aria-label={t("insight.fixInCopy")}
            >
              <span className="hidden xl:inline">{t("insight.fixInCopy")}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function CategoryView({ project, category, scan }: { project: ProjectDetail; category: Category; scan: InsightScan }) {
  const { t, i18n: i } = useTranslation();
  const [, setParams] = useSearchParams();
  const fix = useFix(project.id);
  const [detail, setDetail] = useState<CategoryDetail>();
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string>();
  const [ask, setAsk] = useState("");
  const navigate = useNavigate();
  const Icon = CATEGORY_ICONS[category];
  // "Review this part" (plan.md 6.3): the persona that owns it, read-only or not as it is set up.
  const { personas } = usePersonas();
  const reviewer = personas.length ? personaForCategory(category, personas) : undefined;
  const reviewerName = usePersonaLabel()(reviewer).name;
  const [reviewError, setReviewError] = useState<string>();

  const explain = (force: boolean) => {
    setExplaining(true);
    setExplainError(undefined);
    api
      .insightExplain(project.id, category, force)
      .then(setDetail)
      .catch((err: Error) => setExplainError(err.message))
      .finally(() => setExplaining(false));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per category, explain when nothing is cached
  useEffect(() => {
    api
      .insightCategory(project.id, category)
      .then((d) => {
        setDetail(d);
        if (!d.explanation) explain(false);
      })
      // Without a scan there is nothing to show yet; the empty state says so.
      .catch(() => undefined);
  }, [project.id, category, scan.at]);

  if (!detail) return null;
  const text = detail.explanation?.[i.language] ?? detail.explanation?.en ?? Object.values(detail.explanation ?? {})[0];
  const problems = detail.findings.filter((f) => f.status !== "pass");
  const passed = detail.findings.filter((f) => f.status === "pass");
  const diagram =
    category === "architecture"
      ? scan.diagrams.architecture
      : category === "database"
        ? scan.diagrams.database
        : undefined;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setParams({ tab: "sections" })}
        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={13} className="rtl:rotate-180" /> {t("insight.allSections")}
      </button>
      <Card className="flex flex-wrap items-center gap-5 p-pad">
        <ScoreRing score={detail.score} grade={detail.grade} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Icon size={17} /> {t(`insight.cat.${category}`)}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">{t(`insight.catHint.${category}`)}</p>
          <p className="mt-1 text-[11px] text-fg-subtle">{t("insight.fileCount", { count: detail.fileCount })}</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium text-fg-subtle">{t("insight.trend")}</p>
          <Trend points={detail.trend} />
        </div>
        {detail.findingsTrend.length > 1 && (
          <div>
            <p className="mb-1 text-[11px] font-medium text-fg-subtle">
              {t("insight.findingsTrend", { count: detail.findings.length })}
            </p>
            <Trend
              points={detail.findingsTrend}
              max={Math.max(...detail.findingsTrend.map((p) => p.score))}
              label="insight.findingsTrendLabel"
            />
          </div>
        )}
        {reviewer && (
          <div className="w-full space-y-1 border-t border-border pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
            <Button
              size="sm"
              onClick={() =>
                startPersonaChat(
                  reviewer.id,
                  project.id,
                  navigate,
                  t("persona.reviewDraft", { section: t(`insight.cat.${category}`) }),
                ).catch((err: Error) => setReviewError(err.message))
              }
              data-tip={t("persona.reviewTip", { name: reviewerName })}
            >
              <PersonaIcon persona={reviewer} size={11} className="size-4" />
              {t("persona.review")}
            </Button>
            {reviewError && <p className="text-xs text-danger">{reviewError}</p>}
          </div>
        )}
      </Card>

      {category === "testing" && <CoverageCard projectId={project.id} />}
      {category === "architecture" && <ArchitectureCard projectId={project.id} />}
      {category === "architecture" && <DesignCard projectId={project.id} />}
      {category === "security" && <SecretsCard projectId={project.id} />}
      {category === "dependencies" && <DepsCard projectId={project.id} />}
      <Card className="p-pad">
        <BoardsList projectId={project.id} category={category} compact />
      </Card>

      <Card className="space-y-3 p-pad">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">{t("insight.howItWorks")}</h3>
          <div className="flex-1" />
          {detail.explainedAt && <span className="text-[11px] text-fg-subtle">{relativeTime(detail.explainedAt)}</span>}
          <Button
            size="sm"
            variant="ghost"
            icon={RefreshCw}
            disabled={explaining}
            onClick={() => explain(true)}
            data-tip={t("insight.reexplainTip")}
          >
            {t("insight.reexplain")}
          </Button>
        </div>
        {explaining && !text && <p className="text-xs text-fg-muted">{t("insight.explaining")}</p>}
        {explainError && !text && <p className="text-xs text-danger">{explainError}</p>}
        {text && (
          <>
            <p className="text-[13px] leading-relaxed">{text.how}</p>
            {text.parts.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {text.parts.map((p) => (
                  <li key={p.name} className="rounded-ui bg-bg-subtle p-2">
                    <p className="font-mono text-[11.5px] font-medium">{p.name}</p>
                    <p className="text-xs text-fg-muted">{p.what}</p>
                  </li>
                ))}
              </ul>
            )}
            {text.score && <p className="text-xs leading-relaxed text-fg-muted">{text.score}</p>}
          </>
        )}
      </Card>

      {diagram && (
        <Card className="space-y-2 p-pad">
          <h3 className="text-[13px] font-semibold">
            {t(category === "database" ? "insight.diagramDb" : "insight.diagramArch")}
          </h3>
          <p className="text-[11px] text-fg-subtle">
            {t(category === "database" ? "insight.diagramDbHint" : "insight.diagramArchHint")}
          </p>
          <Diagram code={diagram} />
        </Card>
      )}

      <Card className="p-pad">
        <h3 className="text-[13px] font-semibold">
          {problems.length ? t("insight.toImprove", { count: problems.length }) : t("insight.allGood")}
        </h3>
        <ul className="divide-y divide-border">
          {problems.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              projectId={project.id}
              onFix={(x) => void fix.inChat(x)}
              onFixInCopy={(x) => void fix.inCopy(x)}
            />
          ))}
        </ul>
        {passed.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-fg-muted">
              {t("insight.passed", { count: passed.length })}
            </summary>
            <ul className="divide-y divide-border">
              {passed.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  projectId={project.id}
                  onFix={(x) => void fix.inChat(x)}
                  onFixInCopy={(x) => void fix.inCopy(x)}
                />
              ))}
            </ul>
          </details>
        )}
      </Card>

      {detail.decisions.length > 0 && (
        <Card className="p-pad">
          <h3 className="mb-2 text-[13px] font-semibold">{t("insight.decisions")}</h3>
          <ul className="space-y-1.5">
            {detail.decisions.map((d) => (
              <li key={d.id} className="flex gap-2 text-[13px]">
                <Badge tone={d.section === "issue" || d.section === "failed" ? "warning" : "neutral"}>
                  {t(`memory.${d.section}`)}
                </Badge>
                <span className="min-w-0 flex-1">{d.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {detail.sessions.length > 0 && (
        <Card className="p-pad">
          <h3 className="mb-2 text-[13px] font-semibold">{t("insight.sessions")}</h3>
          <ul className="space-y-1">
            {detail.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px]">
                <Link to={`/p/${project.id}/s/${s.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                  {s.title}
                </Link>
                {s.author && <Badge tone="accent">{s.author}</Badge>}
                <span className="text-[11px] text-fg-subtle">{relativeTime(s.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-pad">
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold">
            {t("insight.files", { count: detail.fileCount })}
          </summary>
          <ul className="mt-2 max-h-64 overflow-auto font-mono text-[11px]">
            {detail.files.map((path) => (
              <li key={path}>
                <Link
                  to={`/p/${project.id}?tab=code&file=${encodeURIComponent(path)}`}
                  className="text-fg-muted hover:text-accent"
                >
                  {path}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <Comments projectId={project.id} kind="section" id={category} />

      {/* Context-aware prompt box: opens a chat about this part with the question waiting. */}
      <Card className="flex items-center gap-2 p-2">
        <MessageSquare size={15} className="ms-1 text-accent" />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter" || !ask.trim()) return;
            const chat = await api.startChat({ projectId: project.id });
            void navigate(
              `/c/${chat.id}?draft=${encodeURIComponent(`[${i18n.getFixedT("en")(`insight.cat.${category}`)}] ${ask.trim()}`)}`,
            );
          }}
          placeholder={t("insight.askPlaceholder", { section: t(`insight.cat.${category}`) })}
          className="h-8 flex-1 bg-transparent text-[13px] outline-none"
        />
      </Card>
    </div>
  );
}

export function SectionsTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { latest, error, reload } = useInsight(project.id);
  const [scanning, setScanning] = useState(false);
  const [scoring, setScoring] = useState(false);
  const category = params.get("cat") as Category | null;
  const view = params.get("view");

  const scan = () => {
    setScanning(true);
    api
      .insightScan(project.id)
      .then(reload)
      // A failed scan leaves the last result in place; the button can be pressed again.
      .catch(() => undefined)
      .finally(() => setScanning(false));
  };

  if (error) return <EmptyState icon={Gauge} title={t("insight.unavailable")} body={error} />;
  if (!latest) return null;
  if (!hasScan(latest)) {
    return (
      <EmptyState
        icon={Gauge}
        title={latest.scanning || scanning ? t("insight.scanning") : t("insight.noScan")}
        body={t("insight.noScanBody")}
        action={
          <Button variant="primary" icon={RefreshCw} disabled={latest.scanning || scanning} onClick={scan}>
            {t("insight.scan")}
          </Button>
        }
      />
    );
  }
  if (view === "apis" && latest.apis) return <ApiMapView projectId={project.id} map={latest.apis} />;
  if (view === "env") return <EnvView projectId={project.id} />;
  if (category && latest.categories.some((c) => c.category === category))
    return <CategoryView project={project} category={category} scan={latest} />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-5 p-pad">
        <ScoreRing score={latest.overall} grade={latest.grade} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{t("insight.overall")}</h2>
          <p className="mt-1 text-xs text-fg-muted">{t("insight.overallHint")}</p>
          <p className="mt-1 text-[11px] text-fg-subtle">
            {t("insight.lastScan", { when: relativeTime(latest.at), files: latest.fileCount })}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium text-fg-subtle">{t("insight.trend")}</p>
          <Trend points={latest.trend.map((p) => ({ at: p.at, score: p.overall }))} />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            icon={RefreshCw}
            disabled={scanning || latest.scanning}
            onClick={scan}
            data-tip={t("insight.scanTip")}
          >
            {scanning || latest.scanning ? t("insight.scanning") : t("insight.scan")}
          </Button>
          <Button variant="ghost" icon={SlidersHorizontal} onClick={() => setScoring(true)} data-tip={t("scoring.tip")}>
            {t("scoring.title")}
          </Button>
        </div>
      </Card>
      <ScoringDialog projectId={project.id} scan={latest} open={scoring} onClose={() => setScoring(false)} />
      <ImportCard projectId={project.id} />
      <ToolsCard projectId={project.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-nav-item
          onClick={() => setParams({ tab: "sections", view: "apis" })}
          className="flex items-center gap-3 rounded-ui border border-border bg-bg p-pad text-start hover:border-border-strong hover:bg-bg-subtle"
        >
          <Plug size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{t("apis.title")}</p>
            <p className="text-xs text-fg-muted">
              {t("apis.summary", {
                external: latest.apis?.external.length ?? 0,
                endpoints: latest.apis?.endpoints.length ?? 0,
              })}
            </p>
          </div>
        </button>
        <button
          type="button"
          data-nav-item
          onClick={() => setParams({ tab: "sections", view: "env" })}
          className="flex items-center gap-3 rounded-ui border border-border bg-bg p-pad text-start hover:border-border-strong hover:bg-bg-subtle"
        >
          <KeyRound size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{t("env.title")}</p>
            <p className="text-xs text-fg-muted">{t("env.summary", { count: latest.apis?.env.length ?? 0 })}</p>
          </div>
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {latest.categories.map((c) => {
          const Icon = CATEGORY_ICONS[c.category];
          const top = c.findings.find((f) => f.status !== "pass");
          return (
            <button
              key={c.category}
              type="button"
              data-nav-item
              onClick={() => setParams({ tab: "sections", cat: c.category })}
              className="flex items-start gap-3 rounded-ui border border-border bg-bg p-pad text-start hover:border-border-strong hover:bg-bg-subtle"
            >
              <ScoreRing score={c.score} grade={c.grade} size={48} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Icon size={14} className="text-fg-muted" /> {t(`insight.cat.${c.category}`)}
                </p>
                <p
                  className={cn(
                    "mt-1 line-clamp-2 text-xs",
                    top ? (top.status === "fail" ? "text-danger" : "text-warning") : "text-fg-subtle",
                  )}
                >
                  {top ? t(`insight.check.${top.id}.title`, { metric: top.metric }) : t("insight.allGood")}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
