import { Check, ShieldCheck, ShieldHalf } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { PoliciesSection } from "../TeamSecurity";

type Policies = Awaited<ReturnType<typeof api.teamPolicies>>;

/** Two levels most teams want, in words; "Custom" keeps every number for those who need it. */
const LEVELS = {
  standard: { minPassword: 10, require2fa: false, sessionDays: 0, retentionDays: 0 },
  strict: { minPassword: 14, require2fa: true, sessionDays: 30, retentionDays: 365 },
} as const;
type Level = keyof typeof LEVELS;

function levelOf(p: Policies): Level | "custom" {
  for (const [name, l] of Object.entries(LEVELS) as [Level, (typeof LEVELS)[Level]][])
    if (
      p.minPassword === l.minPassword &&
      p.require2fa === l.require2fa &&
      p.sessionDays === l.sessionDays &&
      p.retentionDays === l.retentionDays
    )
      return name;
  return "custom";
}

/**
 * The company's rules: pick Standard or Strict and read what it means, instead of five numbers
 * with no story. The address allow-list is not part of a level: it is kept as the admin set it.
 */
export function CompanyRules() {
  const { t } = useTranslation();
  const [p, setP] = useState<Policies>();
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string>();
  const load = () =>
    void api
      .teamPolicies()
      .then(setP)
      .catch((err: Error) => setError(err.message));
  useEffect(load, []);
  if (!p) return error ? <p className="text-xs text-danger">{error}</p> : null;
  const current = levelOf(p);
  const pick = (level: Level) => {
    const next = { ...p, ...LEVELS[level] };
    setP(next);
    void api.teamSetPolicies(next).catch((err: Error) => setError(err.message));
  };
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-[13px] text-fg-muted">{t("rules.intro")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {(["standard", "strict"] as const).map((level) => (
          <Card key={level} className={cn("space-y-2 p-pad", current === level && "border-accent")}>
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              {level === "strict" ? (
                <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
              ) : (
                <ShieldHalf size={16} className="text-accent" aria-hidden="true" />
              )}
              {t(`rules.${level}`)}
              {current === level && (
                <span className="ms-auto inline-flex items-center gap-1 text-[12px] font-medium text-accent">
                  <Check size={13} aria-hidden="true" /> {t("rules.inUse")}
                </span>
              )}
            </p>
            <p className="text-[12.5px] text-fg-muted">{t(`rules.${level}Hint`)}</p>
            <ul className="list-disc space-y-0.5 ps-5 text-[12.5px]">
              {(t(`rules.${level}Points`, { returnObjects: true }) as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {current !== level && (
              <Button size="sm" variant="primary" onClick={() => pick(level)}>
                {t("rules.use", { level: t(`rules.${level}`) })}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {current === "custom" && <p className="text-[12.5px] text-fg-muted">{t("rules.customNow")}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      {current !== "custom" && (
        <Button size="sm" variant="ghost" onClick={() => setCustom((v) => !v)} aria-expanded={custom}>
          {custom ? t("rules.hideCustom") : t("rules.showCustom")}
        </Button>
      )}
      {(custom || current === "custom") && <PoliciesSection onSaved={setP} />}
    </div>
  );
}
