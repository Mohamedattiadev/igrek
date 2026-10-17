import { KeyRound, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "../../components/ui";
import { api, type DependencyReport } from "../../lib/api";
import { relativeTime } from "../../lib/format";

const OUTDATED_TONE = {
  major: "warning",
  minor: "accent",
  patch: "neutral",
  none: "success",
  unknown: "neutral",
} as const;

/** Secrets found in commits, and the optional pre-commit guard (plan.md 11). */
export function SecretsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    findings: { hash: string; file: string; line: number; hint: string; at: number }[];
    guard: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .secrets(projectId)
      .then(setData)
      .catch(() => undefined);
  };
  useEffect(load, [projectId]);
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound size={14} className="text-fg-muted" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold">{t("secrets.title")}</h3>
        <div className="flex-1" />
        {data && !data.guard && (
          <Button
            size="sm"
            variant="ghost"
            icon={ShieldCheck}
            onClick={() =>
              void api
                .installSecretGuard(projectId)
                .then(load)
                .catch((e: Error) => setError(e.message))
            }
            data-tip={t("secrets.guardTip")}
          >
            {t("secrets.guard")}
          </Button>
        )}
        {data?.guard && <Badge tone="success">{t("secrets.guardOn")}</Badge>}
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await api.scanSecrets(projectId).catch(() => undefined);
            load();
            setBusy(false);
          }}
        >
          {t("secrets.scan")}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data && data.findings.length === 0 && <p className="text-xs text-success">{t("secrets.none")}</p>}
      {data && data.findings.length > 0 && (
        <>
          <p className="text-xs text-danger">{t("secrets.found", { count: data.findings.length })}</p>
          <ul className="space-y-1">
            {data.findings.map((f) => (
              <li
                key={`${f.hash}-${f.file}-${f.line}`}
                className="flex flex-wrap items-center gap-2 font-mono text-[11.5px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  {f.file}:{f.line} · {f.hash.slice(0, 7)} · {f.hint}
                </span>
                <span className="text-fg-subtle">{relativeTime(f.at)}</span>
                <Button size="sm" variant="ghost" onClick={() => void api.dismissSecret(projectId, f).then(load)}>
                  {t("secrets.dismiss")}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-subtle">{t("secrets.howTo")}</p>
        </>
      )}
    </Card>
  );
}

/** Outdated and vulnerable packages (plan.md 11). */
export function DepsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [report, setReport] = useState<DependencyReport | null>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .deps(projectId)
      .then(setReport)
      .catch(() => setReport(null));
  }, [projectId]);
  const vulnerable = report?.deps.filter((d) => d.vulns.length) ?? [];
  const outdated = report?.deps.filter((d) => d.outdated !== "none" && d.outdated !== "unknown") ?? [];
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex items-center gap-2">
        <Package size={14} className="text-fg-muted" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold">{t("deps.title")}</h3>
        {report && <span className="text-[11px] text-fg-subtle">{relativeTime(report.at)}</span>}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setReport(await api.checkDeps(projectId).catch(() => report ?? null));
            setBusy(false);
          }}
        >
          {busy ? t("meeting.looking") : t("deps.check")}
        </Button>
      </div>
      {!report && <p className="text-xs text-fg-muted">{t("deps.hint")}</p>}
      {report && (
        <>
          <p className="text-xs">
            {t("deps.summary", { total: report.deps.length, vulnerable: vulnerable.length, outdated: outdated.length })}
          </p>
          <ul className="max-h-80 space-y-1 overflow-auto">
            {[...vulnerable, ...outdated.filter((d) => !d.vulns.length)].map((d) => (
              <li key={`${d.ecosystem}-${d.name}`} className="space-y-0.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{d.name}</span>
                  <span className="font-mono text-fg-subtle">
                    {d.current}
                    {d.latest && d.latest !== d.current ? ` → ${d.latest}` : ""}
                  </span>
                  <Badge tone={OUTDATED_TONE[d.outdated]}>{t(`deps.out_${d.outdated}`)}</Badge>
                  {d.vulns.length > 0 && <Badge tone="danger">{t("deps.vulns", { count: d.vulns.length })}</Badge>}
                </div>
                {d.vulns.slice(0, 3).map((v) => (
                  <a
                    key={v.id}
                    href={`https://osv.dev/vulnerability/${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate ps-3 text-[11px] text-danger hover:underline"
                  >
                    {v.id}
                    {v.severity ? ` (${v.severity})` : ""}: {v.summary}
                  </a>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-subtle">{t("deps.source")}</p>
        </>
      )}
    </Card>
  );
}
