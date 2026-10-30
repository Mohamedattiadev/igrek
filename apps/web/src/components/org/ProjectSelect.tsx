import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { field } from "../ui";
import type { OrgView } from "./api";

/** Which project something is for (a card, a meeting), or none: the same picker everywhere. */
export function ProjectSelect({
  view,
  value,
  onChange,
}: {
  view: OrgView;
  value: string;
  onChange: (project: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      className={cn(field, "w-full")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("org.project")}
    >
      <option value="">{t("org.noProject")}</option>
      {view.projects.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
