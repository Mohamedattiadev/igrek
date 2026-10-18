import {
  type ArchitectureReport,
  CATEGORIES,
  type Category,
  DEFAULT_WEIGHTS,
  DESIGN_SOURCES,
  type DesignFinding,
  type ImportEstimate,
  type ImportStatus,
  type InsightConfig,
  type InsightScan,
  PATTERN_RATINGS,
  type ToolKind,
  type ToolPlan,
  type ToolResult,
} from "@godeye/core";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  History,
  LoaderCircle,
  Play,
  SlidersHorizontal,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Dialog } from "../../components/ui";
import { api, request } from "../../lib/api";
import { cn } from "../../lib/cn";
import { compactNumber, relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";

/** The project's own checks, shown as exact commands; nothing runs until the user starts it. */
export function ToolsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ plans: ToolPlan[]; results: ToolResult[]; running: boolean }>();
  const [chosen, setChosen] = useState<ToolKind[]>();
  const [open, setOpen] = useState<ToolKind>();
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .insightTools(projectId)
      .then((d) => {
        setData(d);
        setChosen((c) => c ?? d.plans.map((p) => p.kind));
      })
      .catch(() => undefined);
  };
  useEffect(load, [projectId]);
  useServerEvent("insight-changed", (m) => m.projectId === projectId && load());
  if (!data || data.plans.length === 0) return null;
  const result = (kind: ToolKind) => data.results.find((r) => r.kind === kind);

  return (
    <Card className="space-y-3 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <TerminalSquare size={16} className="text-accent" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold">{t("tools.title")}</h3>
        <div className="flex-1" />
        <Button
          size="sm"
          icon={data.running ? LoaderCircle : Play}
          disabled={data.running || !chosen?.length}
          onClick={() => {
            setError(undefined);
            api
              .insightRunTools(projectId, chosen ?? [])
              .then(load)
              .catch((err: Error) => setError(err.message));
            setData({ ...data, running: true });
          }}
          data-tip={t("tools.runTip")}
        >
          {data.running ? t("tools.running") : t("tools.run")}
        </Button>
      </div>
      <p className="text-[11px] text-fg-subtle">{t("tools.hint")}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <ul className="divide-y divide-border">
        {data.plans.map((plan) => {
          const r = result(plan.kind);
          return (
            <li key={plan.kind} className="py-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen?.includes(plan.kind) ?? false}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...(c ?? []), plan.kind] : (c ?? []).filter((k) => k !== plan.kind),
                    )
                  }
                  aria-label={t(`tools.kind_${plan.kind}`)}
                />
                <span className="w-24 text-[13px] font-medium">{t(`tools.kind_${plan.kind}`)}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                  {plan.command.join(" ")}
                </code>
                {r && (
                  <>
                    {r.ok ? (
                      <CheckCircle2 size={14} className="text-success" aria-label={t("tools.ok")} />
                    ) : (
                      <CircleAlert size={14} className="text-danger" aria-label={t("tools.failed")} />
                    )}
                    <span className="text-[11px] text-fg-subtle">
                      {r.vulnerabilities
                        ? Object.entries(r.vulnerabilities)
                            .filter(([, n]) => n)
                            .map(([k, n]) => `${n} ${k}`)
                            .join(", ") || t("tools.noVulns")
                        : r.dead !== undefined
                          ? t("tools.deadCount", { count: r.dead })
                          : r.tests?.passed !== undefined || r.tests?.failed !== undefined
                            ? t("tools.tests", { passed: r.tests?.passed ?? 0, failed: r.tests?.failed ?? 0 })
                            : `${t("tools.exit")} ${r.exitCode}`}
                      {" · "}
                      {relativeTime(r.at)}
                    </span>
                    <button
                      type="button"
                      aria-label={t("tools.output")}
                      onClick={() => setOpen(open === plan.kind ? undefined : plan.kind)}
                      className="rounded p-1 text-fg-subtle hover:bg-bg-hover"
                    >
                      <ChevronDown
                        size={13}
                        className={cn("transition-transform", open === plan.kind && "rotate-180")}
                      />
                    </button>
                  </>
                )}
              </div>
              {open === plan.kind && r && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11px] whitespace-pre-wrap">
                  {r.output || "—"}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** How much each part counts toward the overall score, and checks that don't apply to this project. */
export function ScoringDialog({
  projectId,
  scan,
  open,
  onClose,
}: {
  projectId: string;
  scan: InsightScan;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<InsightConfig>();
  useEffect(() => {
    if (open)
      api
        .insightConfig(projectId)
        .then(setConfig)
        .catch(() => undefined);
  }, [open, projectId]);
  const present = scan.categories.map((c) => c.category);
  const weight = (c: Category) => config?.weights[c] ?? DEFAULT_WEIGHTS[c] ?? 1;
  return (
    <Dialog open={open} onClose={onClose} label={t("scoring.title")} wide>
      {config && (
        <div className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <SlidersHorizontal size={15} aria-hidden="true" /> {t("scoring.title")}
          </h2>
          <p className="text-xs text-fg-muted">{t("scoring.hint")}</p>
          <div className="max-h-[60vh] space-y-3 overflow-auto pe-1">
            {CATEGORIES.filter((c) => present.includes(c)).map((category) => {
              const checks = (
                scan.catalog?.[category] ??
                scan.categories.find((c) => c.category === category)?.findings.map((f) => f.id) ??
                []
              ).map((id) => ({ id }));
              return (
                <div key={category} className="rounded-ui border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-[13px] font-medium">{t(`insight.cat.${category}`)}</span>
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      {t("scoring.weight")}
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={0.5}
                        value={weight(category)}
                        onChange={(e) =>
                          setConfig({ ...config, weights: { ...config.weights, [category]: Number(e.target.value) } })
                        }
                        aria-label={t("scoring.weightOf", { section: t(`insight.cat.${category}`) })}
                      />
                      <span className="w-8 font-mono">{weight(category)}×</span>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {checks.map((f) => {
                      const off = config.disabled.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            setConfig({
                              ...config,
                              disabled: off ? config.disabled.filter((d) => d !== f.id) : [...config.disabled, f.id],
                            })
                          }
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            off ? "border-border text-fg-subtle line-through" : "border-accent/40 text-fg",
                          )}
                          data-tip={off ? t("scoring.enableTip") : t("scoring.disableTip")}
                        >
                          {t(`insight.check.${f.id}.title`, { metric: "" }).replace(/[:\s]+$/, "")}
                        </button>
                      );
                    })}
                  </div>
                  {checks
                    .filter((f) => config.disabled.includes(f.id))
                    .map((f) => (
                      <label key={f.id} className="mt-2 block text-[11.5px] text-fg-muted">
                        {t("scoring.why", {
                          check: t(`insight.check.${f.id}.title`, { metric: "" }).replace(/[:\s]+$/, ""),
                        })}
                        <input
                          value={config.reasons?.[f.id] ?? ""}
                          onChange={(e) =>
                            setConfig({ ...config, reasons: { ...config.reasons, [f.id]: e.target.value } })
                          }
                          placeholder={t("scoring.whyPlaceholder")}
                          className="mt-0.5 h-8 w-full rounded-ui border border-border bg-bg px-2 text-[12.5px] text-fg outline-none focus:border-accent"
                        />
                      </label>
                    ))}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfig({ weights: {}, disabled: [], reasons: {} })}>
              {t("scoring.reset")}
            </Button>
            <Button
              variant="primary"
              disabled={config.disabled.some((id) => (config.reasons?.[id] ?? "").trim().length < 3)}
              onClick={() =>
                void api.insightSetConfig(projectId, config).then(() => {
                  onClose();
                })
              }
            >
              {t("scoring.save")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Bringing in an existing project's past sessions (plan.md 5.4): cost first, then progress. */
export function ImportCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ estimate: ImportEstimate; status: ImportStatus | null }>();
  const load = () => {
    api
      .importStatus(projectId)
      .then(setData)
      .catch(() => undefined);
  };
  useEffect(load, [projectId]);
  useServerEvent("import-progress", (m) => m.projectId === projectId && load());
  if (!data) return null;
  const { estimate, status } = data;
  if (!status?.running && estimate.sessions === 0) return null;
  const minutes = Math.max(1, Math.round(estimate.seconds / 60));
  return (
    <Card className="flex flex-wrap items-center gap-3 p-pad">
      <History size={18} className="text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{t("import.title")}</p>
        {status?.running ? (
          <div className="mt-1 space-y-1">
            <p className="text-xs text-fg-muted">{t("import.progress", { done: status.done, total: status.total })}</p>
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(status.done / Math.max(1, status.total)) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            {t("import.estimate", {
              sessions: estimate.sessions,
              tokens: compactNumber(estimate.tokens),
              minutes,
              model: estimate.model,
            })}
          </p>
        )}
        {status && !status.running && status.finishedAt && (
          <p className="text-[11px] text-fg-subtle">
            {t("import.finished", { done: status.done - status.failed, when: relativeTime(status.finishedAt) })}
            {status.failed > 0 && <Badge tone="warning">{t("import.failed", { count: status.failed })}</Badge>}
          </p>
        )}
      </div>
      {status?.running ? (
        <Button size="sm" icon={Square} onClick={() => void api.importStop(projectId).then(load)}>
          {t("import.stop")}
        </Button>
      ) : (
        <Button
          size="sm"
          icon={Play}
          onClick={() => void api.importStart(projectId).then(load)}
          data-tip={t("import.startTip")}
        >
          {t("import.start")}
        </Button>
      )}
    </Card>
  );
}

const QUALITIES = ["agility", "deployment", "testability", "performance", "scalability", "development"] as const;

/**
 * The architecture pattern the code follows (plan.md 15.2, Richards' Software Architecture
 * Patterns), its rules broken in the code, and how the pattern rates in the book's analysis.
 */
export function ArchitectureCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [report, setReport] = useState<ArchitectureReport>();
  // What matters for this project, chosen by the user (kept in this browser).
  const key = `godeye.archNeeds.${projectId}`;
  const [needs, setNeeds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const toggle = (q: string) => {
    const next = needs.includes(q) ? needs.filter((n) => n !== q) : [...needs, q];
    setNeeds(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage off: the choice lasts until the page closes.
    }
  };
  useEffect(() => {
    let live = true;
    request<ArchitectureReport>(`/api/projects/${projectId}/architecture`)
      .then((r) => live && setReport(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);
  if (!report) return null;
  const ratings = report.pattern === "unknown" ? undefined : PATTERN_RATINGS[report.pattern];
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13.5px] font-semibold">{t("arch.title")}</h3>
        <Badge tone={report.pattern === "unknown" ? "neutral" : "accent"}>{t(`arch.pattern_${report.pattern}`)}</Badge>
      </div>
      <p className="text-xs text-fg-muted">{t(`arch.about_${report.pattern}`)}</p>
      {report.evidence.length > 0 && (
        <p className="font-mono text-[11px] text-fg-subtle">{report.evidence.join(" · ")}</p>
      )}
      {ratings && (
        <div className="space-y-1.5">
          <p className="text-[11.5px] text-fg-muted">{t("arch.needsHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {QUALITIES.map((q) => (
              <button
                type="button"
                key={q}
                aria-pressed={needs.includes(q)}
                onClick={() => toggle(q)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  ratings[q] === "high" ? "border-success text-success" : "border-border text-fg-muted",
                  needs.includes(q) && "ring-2 ring-accent",
                )}
              >
                {t(`arch.q_${q}`)}: {t(`arch.${ratings[q]}`)}
              </button>
            ))}
          </div>
          {needs.length > 0 &&
            (needs.some((q) => ratings[q] === "low") ? (
              <p className="text-xs text-warning">
                {t("arch.misfit", {
                  qualities: needs
                    .filter((q) => ratings[q] === "low")
                    .map((q) => t(`arch.q_${q}`))
                    .join(", "),
                })}
              </p>
            ) : (
              <p className="text-xs text-success">{t("arch.fit")}</p>
            ))}
        </div>
      )}
      {report.violations.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-danger">{t("arch.violations", { count: report.violations.length })}</p>
          <ul className="space-y-0.5 font-mono text-[11px]">
            {report.violations.map((v) => (
              <li key={`${v.from}>${v.to}`}>
                <span className="text-fg-muted">{v.from}</span> → {v.to}{" "}
                <span className="font-sans text-fg-subtle">({t(`arch.rule_${v.rule}`)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-fg-subtle">{t("arch.source")}</p>
    </Card>
  );
}

/** Design patterns and SOLID (plan.md 15.2): what the code shows, grouped by rule, each with its source. */
export function DesignCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [found, setFound] = useState<DesignFinding[]>();
  useEffect(() => {
    let live = true;
    request<DesignFinding[]>(`/api/projects/${projectId}/design`)
      .then((list) => live && setFound(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);
  if (!found) return null;
  const rules = [...new Set(found.map((f) => f.rule))];
  return (
    <Card className="space-y-3 p-pad">
      <h3 className="text-[13.5px] font-semibold">{t("design.title")}</h3>
      {!rules.length && <p className="text-xs text-success">{t("design.clean")}</p>}
      {rules.map((rule) => {
        const items = found.filter((f) => f.rule === rule);
        return (
          <div key={rule} className="space-y-1">
            <p className="text-[12.5px] font-medium">
              {t(`design.rule_${rule}`)} <span className="text-fg-subtle">({items.length})</span>
            </p>
            <p className="text-xs text-fg-muted">
              {t(`design.fix_${rule}`)}{" "}
              <a href={DESIGN_SOURCES[rule]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {t("insight.source")}
              </a>
            </p>
            <ul className="space-y-0.5 font-mono text-[11px] text-fg-muted">
              {items.slice(0, 6).map((f) => (
                <li key={`${f.file}:${f.line}`}>
                  {f.file}:{f.line}
                  {f.detail ? ` · ${f.detail}` : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}
