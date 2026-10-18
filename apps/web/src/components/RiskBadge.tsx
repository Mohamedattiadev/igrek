import type { CommandRisk } from "@igrek/core";
import { useTranslation } from "react-i18next";
import { Badge } from "./ui";

const TONE = { read: "success", change: "warning", danger: "danger" } as const;

export function RiskBadge({ risk }: { risk: CommandRisk }) {
  const { t } = useTranslation();
  return <Badge tone={TONE[risk]}>{t(`servers.risk_${risk}`)}</Badge>;
}
