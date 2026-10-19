import type { Incident } from "@igrek/core";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  GitCommitHorizontal,
  MessageSquare,
  Radio,
  RefreshCw,
  Rocket,
  ScrollText,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { request } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

const ICON = {
  start: Siren,
  note: MessageSquare,
  deploy: Rocket,
  commit: GitCommitHorizontal,
  error: Bug,
  down: Radio,
  log: ScrollText,
  analysis: ShieldAlert,
  resolved: CheckCircle2,
};

/** Open a war room for a project (plan.md 13.4). */
export function IncidentButton({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Incident[]>([]);
  useEffect(() => {
    request<Incident[]>(`/api/projects/${projectId}/incidents`)
      .then(setList)
      .catch(() => undefined);
  }, [projectId]);
  const open = list.find((i) => i.status === "open");
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{t("incident.title")}</h2>
        {open ? (
          <Button variant="danger" icon={Siren} onClick={() => navigate(`/incidents/${open.id}`)}>
            {t("incident.back")}
          </Button>
        ) : (
          <Button
            variant="danger"
            icon={Siren}
            disabled={busy}
            onClick={async () => {
              const title = window.prompt(t("incident.whatHappened")) ?? "";
              if (!title.trim()) return;
              setBusy(true);
              try {
                const i = await request<Incident>(`/api/projects/${projectId}/incidents`, {
                  method: "POST",
                  body: JSON.stringify({ title }),
                });
                void navigate(`/incidents/${i.id}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("incident.gathering") : t("incident.open")}
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-muted">{t("incident.hint")}</p>
      {list.length > 0 && (
        <ul className="space-y-1 text-[13px]">
          {list.slice(0, 5).map((i) => (
            <li key={i.id}>
              <Link to={`/incidents/${i.id}`} className="hover:underline">
                {i.title}
              </Link>
              <span className="ms-2 text-xs text-fg-subtle">
                {relativeTime(i.startedAt)} · {t(`incident.status_${i.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The war room: evidence, the SRE persona's analysis, a timeline you add notes to, then the postmortem. */
export function IncidentPage() {
  const { t } = useTranslation();
  const { incidentId = "" } = useParams();
  const [incident, setIncident] = useState<Incident>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      void request<Incident>(`/api/incidents/${incidentId}`)
        .then(setIncident)
        .catch((e: Error) => setError(e.message)),
    [incidentId],
  );
  useEffect(load, [load]);
  useServerEvent("ops-changed", (m) => m.what === "incidents" && load());
  if (!incident)
    return (
      <>
        <PageHeader title={t("incident.title")} />
        <p className="p-6 text-[13px] text-fg-muted">{error ?? t("persona.loading")}</p>
      </>
    );
  const minutes = Math.round(((incident.endedAt ?? Date.now()) - incident.startedAt) / 60_000);
  return (
    <>
      <PageHeader
        title={t("incident.title")}
        actions={
          incident.status === "open" ? (
            <Button
              variant="primary"
              icon={CheckCircle2}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  setIncident(
                    await request<Incident>(`/api/incidents/${incident.id}/resolve`, { method: "POST", body: "{}" }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t("incident.writingPostmortem") : t("incident.resolve")}
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <BackLink
          to={`/p/${incident.projectId}?tab=monitor`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={13} aria-hidden="true" /> {t("project.monitor")}
        </BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[16px] font-semibold">{incident.title}</h2>
          <Badge tone={incident.status === "open" ? "danger" : "success"}>
            {t(`incident.status_${incident.status}`)}
          </Badge>
          <span className="text-xs text-fg-muted">{t("incident.minutes", { count: minutes })}</span>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {incident.postmortem && (
              <Card className="space-y-2 p-pad">
                <p className="text-[13px] font-semibold">{t("incident.postmortem")}</p>
                <Markdown text={incident.postmortem} className="prose-igrek" />
                <p className="text-xs text-success">{t("incident.inWiki")}</p>
              </Card>
            )}
            <Card className="space-y-2 p-pad">
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} className="text-accent" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[13px] font-semibold">{t("incident.analysis")}</p>
                {incident.status === "open" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RefreshCw}
                    disabled={incident.analyzing}
                    onClick={() =>
                      void request(`/api/incidents/${incident.id}/analyze`, { method: "POST", body: "{}" }).then(load)
                    }
                  >
                    {t("incident.reanalyze")}
                  </Button>
                )}
              </div>
              {incident.analyzing ? (
                <p className="text-xs text-fg-muted">{t("incident.analyzing")}</p>
              ) : incident.analysis ? (
                <Markdown text={incident.analysis} className="prose-igrek" />
              ) : null}
            </Card>
            <details className="rounded-ui border border-border p-pad text-xs">
              <summary className="cursor-pointer text-[13px] font-semibold">{t("incident.evidence")}</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                {incident.evidence}
              </pre>
            </details>
          </div>
          <Card className="space-y-2 p-pad">
            <p className="text-[13px] font-semibold">{t("incident.timeline")}</p>
            <ol className="space-y-1.5 text-xs">
              {incident.timeline.map((e, i) => {
                const Icon = ICON[e.kind] ?? MessageSquare;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entries can share a time
                  <li key={i} className="flex gap-2">
                    <Icon size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-fg-subtle">{new Date(e.at).toLocaleString()}</span>
                      <span className="block">{e.text}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {incident.status === "open" && (
              <form
                className="flex gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  setIncident(
                    await request<Incident>(`/api/incidents/${incident.id}/note`, {
                      method: "POST",
                      body: JSON.stringify({ text: note }),
                    }),
                  );
                  setNote("");
                }}
              >
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("incident.note")}
                  aria-label={t("incident.note")}
                  className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2 text-xs outline-none focus:border-accent"
                />
                <Button size="sm" type="submit">
                  {t("incident.add")}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
