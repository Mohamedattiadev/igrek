import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../components/ui";

export function InboxPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("inbox.title")} />
      <EmptyState icon={Inbox} title={t("inbox.emptyTitle")} body={t("inbox.emptyBody")} />
    </>
  );
}
