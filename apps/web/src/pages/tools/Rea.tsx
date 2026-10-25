import type { ProjectListItem } from "@igrek/core";
import { Check, ScanSearch, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FixButton } from "../../components/FixButton";
import { Button, Card, field } from "../../components/ui";
import { api } from "../../lib/api";

/**
 * REA, "Reverse Engineer Anything" (morluto/rea, MIT): its setup in a terminal here, where the user
 * approves each change it proposes, then chats in reverse-engineering mode, only for software the
 * user owns or may examine.
 */
export function ReaTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ installed: boolean; node: boolean; package: string }>();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    void api
      .rea()
      .then((s) => current && setStatus(s))
      .catch((err: Error) => current && setError(err.message));
    void api
      .projects()
      .then((list) => current && setProjects(list.filter((p) => !p.hidden)))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const setup = async () => {
    setError(undefined);
    try {
      void navigate(`/t/${(await api.reaSetup()).id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const chat = async () => {
    setError(undefined);
    try {
      const started = await api.startChat({ projectId, focus: "reverse", authorized: true });
      void navigate(`/c/${started.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 text-[13px]">
      <Card className="space-y-2 p-pad">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ScanSearch size={16} aria-hidden="true" /> {t("rea.title")}
        </h2>
        <p className="text-fg-muted">{t("rea.intro")}</p>
        <p className="text-xs text-fg-subtle">{t("rea.source", { package: status?.package ?? "" })}</p>
      </Card>
      <Card className="space-y-2 p-pad">
        <h3 className="font-semibold">{t("rea.step1")}</h3>
        {status?.installed ? (
          <p className="flex items-center gap-1.5 text-success">
            <Check size={14} aria-hidden="true" /> {t("rea.installed")}
          </p>
        ) : (
          <>
            <p className="text-fg-muted">{status && !status.node ? t("rea.noNode") : t("rea.setupHint")}</p>
            {status && !status.node && (
              <FixButton fix="install-node" label={t("fix.installTool", { tool: "Node.js" })} />
            )}
            <Button icon={TerminalSquare} disabled={status !== undefined && !status.node} onClick={() => void setup()}>
              {t("rea.setup")}
            </Button>
          </>
        )}
      </Card>
      <Card className="space-y-2 p-pad">
        <h3 className="font-semibold">{t("rea.step2")}</h3>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("rea.project")}
          className={`${field} w-full`}
        >
          <option value="">{t("rea.pickProject")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} className="mt-0.5" />
          <span>{t("rea.allowed")}</span>
        </label>
        <p className="text-xs text-fg-muted">{t("rea.limits")}</p>
        <Button variant="primary" usesModel disabled={!projectId || !allowed} onClick={() => void chat()}>
          {t("rea.start")}
        </Button>
      </Card>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
