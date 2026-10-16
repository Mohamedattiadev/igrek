import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../components/ui";

export function PlaceholderPage({ title, icon }: { title: string; icon: LucideIcon }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(title)} />
      <EmptyState icon={icon} title={t("placeholder.soon")} body={t("placeholder.body")} />
    </>
  );
}
