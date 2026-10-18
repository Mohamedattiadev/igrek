import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../lib/api";

/** A link that opens a new chat in a project with a draft ready (from an inbox item, plan.md 16.4). */
export function StartChatPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // biome-ignore lint/correctness/useExhaustiveDependencies: start one chat per visit
  useEffect(() => {
    const projectId = params.get("project");
    if (!projectId) {
      void navigate("/", { replace: true });
      return;
    }
    const draft = encodeURIComponent(params.get("draft") ?? "");
    api
      .startChat({ projectId })
      .then((chat) => navigate(`/c/${chat.id}?draft=${draft}`, { replace: true }))
      .catch(() => navigate(`/p/${projectId}`, { replace: true }));
  }, []);
  return <p className="p-6 text-[13px] text-fg-muted">{t("chat.starting")}</p>;
}
