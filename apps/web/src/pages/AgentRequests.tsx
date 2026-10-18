import type { FormAnswers, FormField } from "@igrek/core";
import { ClipboardList, KeyRound } from "lucide-react";
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

type FormRequest = {
  id: string;
  projectName?: string;
  title: string;
  message: string;
  fields: FormField[];
  status: "pending" | "answered" | "declined";
};

const INPUT = "h-9 w-full rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent";

/** One field drawn from the agent's JSON schema. */
function FormInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = `form-${field.key}`;
  if (field.type === "boolean")
    return (
      <label className="flex items-center gap-2 text-[13px]">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  const label = (
    <label htmlFor={id} className="block text-[13px] font-medium">
      {field.label}
      {field.required && (
        <span className="ms-1 text-[11.5px] font-normal text-fg-subtle">({t("agentAsk.required")})</span>
      )}
    </label>
  );
  if (field.options)
    return (
      <div className="space-y-1">
        {label}
        <select
          id={id}
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={INPUT}
        >
          <option value="">{t("agentAsk.pick")}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  const numeric = field.type !== "string";
  const common = {
    id,
    required: field.required,
    value: value === undefined ? "" : String(value),
    onChange: (e: { target: { value: string } }) =>
      onChange(e.target.value === "" ? undefined : numeric ? Number(e.target.value) : e.target.value),
  };
  return (
    <div className="space-y-1">
      {label}
      {field.multiline ? (
        <textarea {...common} rows={4} maxLength={field.max} className={`${INPUT} h-auto py-2`} />
      ) : (
        <input
          {...common}
          type={numeric ? "number" : "text"}
          step={field.type === "integer" ? 1 : "any"}
          min={numeric ? field.min : undefined}
          max={numeric ? field.max : undefined}
          minLength={numeric ? undefined : field.min}
          maxLength={numeric ? undefined : field.max}
          className={INPUT}
        />
      )}
    </div>
  );
}

/** A form an agent asked the user to fill (plan.md 16.3 #13); the agent gets the answers. */
export function AgentFormPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useLiveData(() => request<FormRequest>(`/api/form-requests/${id}`), [id]);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [problem, setProblem] = useState<string>();
  const currentValue = (field: FormField) => (field.key in answers ? answers[field.key] : field.default);
  const answer = async (body: { answers?: FormAnswers; decline?: boolean }) => {
    try {
      await request(`/api/form-requests/${id}`, { method: "POST", body: JSON.stringify(body) });
      reload();
      void navigate("/inbox");
    } catch (err) {
      setProblem((err as Error).message);
    }
  };
  const submit = () => {
    const out: FormAnswers = {};
    for (const field of data?.fields ?? []) {
      const value = currentValue(field);
      if (value !== undefined) out[field.key] = value;
      else if (field.type === "boolean") out[field.key] = false;
    }
    void answer({ answers: out });
  };
  return (
    <>
      <PageHeader title={data?.title ?? t("agentAsk.formTitle")} />
      <div className="mx-auto max-w-xl p-6">
        <Card className="space-y-3 p-4">
          {!data ? (
            <p className="text-[13px] text-fg-muted">{error ?? "…"}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13.5px]">
                <ClipboardList size={15} className="text-accent" aria-hidden="true" />
                {data.projectName ? t("agentAsk.formBody", { project: data.projectName }) : t("agentAsk.formBodyAny")}
              </p>
              {data.message && <p className="text-[13px] text-fg-muted">{data.message}</p>}
              {data.status === "pending" ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  {data.fields.map((field) => (
                    <div key={field.key} className="space-y-0.5">
                      <FormInput
                        field={field}
                        value={currentValue(field)}
                        onChange={(value) =>
                          setAnswers((prev) => {
                            const next = { ...prev };
                            if (value === undefined) delete next[field.key];
                            else next[field.key] = value;
                            return next;
                          })
                        }
                      />
                      {field.description && <p className="text-[12px] text-fg-subtle">{field.description}</p>}
                    </div>
                  ))}
                  {problem && <p className="text-[12px] text-danger">{problem}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary">
                      {t("agentAsk.send")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void answer({ decline: true })}>
                      {t("agentAsk.decline")}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-[13px] text-fg-muted">{t(`agentAsk.form_${data.status}`)}</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
