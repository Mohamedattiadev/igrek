import { FolderKanban, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button, EmptyState, PageHeader } from "../components/ui";

export function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={t("projects.title")} />
      <EmptyState
        icon={FolderKanban}
        title={t("projects.emptyTitle")}
        body={t("projects.emptyBody")}
        action={
          <Button icon={Settings} onClick={() => navigate("/settings")}>
            {t("projects.emptyAction")}
          </Button>
        }
      />
    </>
  );
}
