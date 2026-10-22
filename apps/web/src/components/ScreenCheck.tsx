import type { UiAudit, UiPageCheck } from "@igrek/core";
import { MonitorSmartphone, Play, ScanEye } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { Button, Card, Dialog } from "./ui";

const shotUrl = (name: string) => `/api/preview/shots/${encodeURIComponent(name)}`;
const key = (p: UiPageCheck) => `${p.path} ${p.viewport}`;

/** How many problems a page showed: accessibility (by element), overflow, errors and broken images. */
function problems(p: UiPageCheck): number {
  return (
    p.violations.reduce((n, v) => n + v.nodes, 0) + (p.overflowX ? 1 : 0) + p.consoleErrors.length + p.brokenImages
  );
}

/** One page at one width: this check's picture beside the one before, and what was found. */
function PageRow({ now, before, open }: { now: UiPageCheck; before?: UiPageCheck; open: (src: string) => void }) {
  const { t } = useTranslation();
  const count = problems(now);
  const was = before ? problems(before) : undefined;
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-border py-2.5 first:border-t-0">
      <div className="flex gap-1.5">
        {[before?.shot, now.shot].map((shot, i) =>
          shot ? (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: always the same two places: before, now
              key={i}
              type="button"
              onClick={() => open(shotUrl(shot))}
              className="overflow-hidden rounded-md border border-border"
              data-tip={i === 0 ? t("screen.before") : t("screen.now")}
            >
              <img
                src={shotUrl(shot)}
                alt={i === 0 ? t("screen.before") : t("screen.now")}
                className="h-16 w-24 object-cover object-top"
              />
            </button>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: always the same two places: before, now
            <span key={i} className="h-16 w-24 rounded-md border border-dashed border-border" />
          ),
        )}
      </div>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p className="font-medium">
          <span className="font-mono">{now.path}</span> · {t(`screen.viewport_${now.viewport}`)}
        </p>
        {now.error ? (
          <p className="text-danger">{t("screen.loadFailed", { error: now.error })}</p>
        ) : (
          <p className={count ? "text-warning" : "text-success"}>
            {count ? t("screen.problems", { count }) : t("screen.clean")}
            {was !== undefined && was !== count && (
              <span className={was > count ? "text-success" : "text-danger"}> · {t("screen.was", { count: was })}</span>
            )}
          </p>
        )}
        <ul className="mt-0.5 space-y-0.5 text-fg-muted">
          {now.violations.slice(0, 4).map((v) => (
            <li key={v.id}>
              {v.help} ({v.nodes})
            </li>
          ))}
          {now.overflowX && <li>{t("screen.overflow")}</li>}
          {now.consoleErrors[0] && <li className="truncate">{t("screen.console", { error: now.consoleErrors[0] })}</li>}
          {now.brokenImages > 0 && <li>{t("screen.images", { count: now.brokenImages })}</li>}
        </ul>
      </div>
    </li>
  );
}

/**
 * The real-screen check (plan.md 5.3): the running app opened in a browser at laptop and phone
 * width and measured (accessibility, contrast, overflow, errors, loading), with this check's
 * pictures beside the last one's, so a change to the interface shows as what it looks like.
 */
export function ScreenCheckCard({
  projectId,
  lastAt,
  onChecked,
}: {
  projectId: string;
  lastAt?: number;
  onChecked: () => void;
}) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const [audits, setAudits] = useState<UiAudit[]>([]);
  const [running, setRunning] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [big, setBig] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: again after each check
  useEffect(() => {
    let current = true;
    api
      .uiAudits(projectId)
      .then((list) => current && setAudits(list))
      .catch(() => undefined);
    api
      .preview(projectId)
      .then((p) => current && setRunning(p.server?.status === "running"))
      .catch(() => current && setRunning(false));
    return () => {
      current = false;
    };
  }, [projectId, lastAt]);
  const [now, before] = audits;
  const check = () => {
    setBusy(true);
    setError(undefined);
    api
      .runUiAudit(projectId)
      .then(onChecked)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex flex-wrap items-center gap-3">
        <MonitorSmartphone size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{t("screen.title")}</p>
          <p className="text-xs text-fg-muted">
            {now ? t("screen.last", { when: relativeTime(now.at) }) : t("screen.hint")}
          </p>
        </div>
        {running === false ? (
          <Button icon={Play} onClick={() => setParams({ tab: "preview" })} data-tip={t("screen.needPreview")}>
            {t("screen.openPreview")}
          </Button>
        ) : (
          <Button icon={ScanEye} disabled={busy || !running} onClick={check} data-tip={t("screen.checkTip")}>
            {busy ? t("screen.checking") : t("screen.check")}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {now && (
        <ul>
          {now.pages.map((page) => (
            <PageRow
              key={key(page)}
              now={page}
              before={before?.pages.find((p) => key(p) === key(page))}
              open={setBig}
            />
          ))}
        </ul>
      )}
      <Dialog open={!!big} onClose={() => setBig(undefined)} label={t("screen.title")} wide>
        {big && <img src={big} alt={t("screen.title")} className="max-h-[80vh] w-full object-contain" />}
      </Dialog>
    </Card>
  );
}
