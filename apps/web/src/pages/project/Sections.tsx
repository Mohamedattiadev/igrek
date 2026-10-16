import type { Category, CategoryDetail, Finding, InsightScan, ProjectDetail } from "@godeye/core";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  type LucideIcon,
  Monitor,
  Network,
  Package,
  Palette,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Diagram, ScoreRing, Trend } from "../../components/insight";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import i18n from "../../lib/i18n";
import { useServerEvent } from "../../lib/live";
import { useSettings } from "../../lib/settings";
import { ApiMapView } from "./ApiMap";
import { EnvView } from "./EnvView";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
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

/** Starts a chat in this project with a ready "fix this" prompt waiting in the box (nothing is sent yet). */
function useFix(projectId: string) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  return async (finding: Finding) => {
    const t = settings.enhanceLanguage === "user" ? i18n.t.bind(i18n) : i18n.getFixedT("en");
    const where = finding.evidence
      .slice(0, 10)
      .map((e) => `- ${e.path}${e.line ? `:${e.line}` : ""}${e.note ? ` (${e.note})` : ""}`)
      .join("\n");
    const draft = [
      `## Goal\n${t(`insight.check.${finding.id}.fix`, { metric: finding.metric })}`,
      where ? `## Where\n${where}` : "",
      `## Done when\n- ${t("insight.fixDone", { check: t(`insight.check.${finding.id}.title`, { metric: finding.metric }) })}\n- ${t("insight.fixTests")}\n- ${t("insight.fixFocus")}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const chat = await api.startChat({ projectId });
    navigate(`/c/${chat.id}?draft=${encodeURIComponent(draft)}`);
  };
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
}: {
  finding: Finding;
  projectId: string;
  onFix: (f: Finding) => void;
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
    api.insightCategory(project.id, category).then((d) => {
      setDetail(d);
      if (!d.explanation) explain(false);
    });
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
            <FindingRow key={f.id} finding={f} projectId={project.id} onFix={(x) => void fix(x)} />
          ))}
        </ul>
        {passed.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-fg-muted">
              {t("insight.passed", { count: passed.length })}
            </summary>
            <ul className="divide-y divide-border">
              {passed.map((f) => (
                <FindingRow key={f.id} finding={f} projectId={project.id} onFix={(x) => void fix(x)} />
              ))}
            </ul>
          </details>
        )}
      </Card>

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

      {/* Context-aware prompt box: opens a chat about this part with the question waiting. */}
      <Card className="flex items-center gap-2 p-2">
        <Sparkles size={15} className="ms-1 text-accent" />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter" || !ask.trim()) return;
            const chat = await api.startChat({ projectId: project.id });
            navigate(
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
  const category = params.get("cat") as Category | null;
  const view = params.get("view");

  const scan = () => {
    setScanning(true);
    api
      .insightScan(project.id)
      .then(reload)
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
        <Button icon={RefreshCw} disabled={scanning || latest.scanning} onClick={scan} data-tip={t("insight.scanTip")}>
          {scanning || latest.scanning ? t("insight.scanning") : t("insight.scan")}
        </Button>
      </Card>
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
