import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { HtmlReport } from "../components/HtmlReport";
import { Button, Card, PageHeader } from "../components/ui";
import { request } from "../lib/api";
import { useLiveData } from "../lib/live";

type SecretRequest = {
  id: string;
  projectName: string;
  key: string;
  reason: string;
  file: string;
  status: "pending" | "stored" | "declined";
};

/** An agent asked for a secret (plan.md 16.3): the user types it here; the agent never sees it. */
export function SecretRequestPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useLiveData(() => request<SecretRequest>(`/api/secret-requests/${id}`), [id]);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string>();
  const answer = async (body: { value?: string; decline?: boolean }) => {
    try {
      await request(`/api/secret-requests/${id}`, { method: "POST", body: JSON.stringify(body) });
      reload();
      void navigate("/inbox");
    } catch (err) {
      setProblem((err as Error).message);
    }
  };
  return (
    <>
      <PageHeader title={t("agentAsk.secretTitle")} />
      <div className="mx-auto max-w-xl p-6">
        <Card className="space-y-3 p-4">
          {!data ? (
            <p className="text-[13px] text-fg-muted">{error ?? "…"}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13.5px]">
                <KeyRound size={15} className="text-warning" aria-hidden="true" />
                {t("agentAsk.secretBody", { project: data.projectName, key: data.key, file: data.file })}
              </p>
              {data.reason && <p className="text-[13px] text-fg-muted">{data.reason}</p>}
              {data.status === "pending" ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void answer({ value });
                  }}
                >
                  <input
                    type="password"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label={data.key}
                    placeholder={data.key}
                    className="h-9 w-full rounded-ui border border-border bg-bg px-2.5 font-mono text-[13px] outline-none focus:border-accent"
                  />
                  <p className="text-[12px] text-fg-subtle">{t("agentAsk.secretNote", { key: data.key })}</p>
                  {problem && <p className="text-[12px] text-danger">{problem}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary" disabled={!value.trim()}>
                      {t("agentAsk.save")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void answer({ decline: true })}>
                      {t("agentAsk.decline")}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-[13px] text-fg-muted">{t(`agentAsk.status_${data.status}`)}</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/** A page an agent made (plan.md 16.3), drawn sandboxed without network. */
export function AgentReportPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { data, error } = useLiveData(
    () => request<{ title: string; html: string; projectName?: string }>(`/api/agent-reports/${id}`),
    [id],
  );
  return (
    <>
      <PageHeader title={data?.title ?? t("agentAsk.reportTitle")} />
      <div className="p-6">
        {data ? <HtmlReport html={data.html} /> : <p className="text-[13px] text-fg-muted">{error ?? "…"}</p>}
      </div>
    </>
  );
}
