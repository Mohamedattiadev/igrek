import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { chooseLanguage, LanguagePackPanel } from "../components/LanguagePack";
import { LanguagePicker } from "../components/LanguagePicker";
import { Button } from "../components/ui";
import { isBundled } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { queueTour } from "../lib/tour";

/**
 * First-run wizard. Step 1 is always the language (plan.md 7.4); AI tools,
 * accounts and project folders join as their phases land.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [step, setStep] = useState(0);

  return (
    <div className="flex min-h-full items-center justify-center bg-bg-subtle p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg p-6 shadow-ui">
        <div className="mb-6 flex items-center gap-2">
          {[0, 1].map((i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-bg-muted"}`} />
          ))}
        </div>

        {step === 0 ? (
          <>
            <h1 className="text-[18px] font-semibold">{t("onboarding.welcome")}</h1>
            <p className="mt-1 mb-4 text-[13px] text-fg-muted">{t("onboarding.pickLanguage")}</p>
            <LanguagePicker value={settings.language} onChange={(language) => chooseLanguage(language, update)} />
            {!isBundled(settings.language) && <LanguagePackPanel code={settings.language} />}
            <div className="mt-5 flex justify-end">
              <Button variant="primary" onClick={() => setStep(1)}>
                {t("onboarding.continue")}
                <ArrowRight size={14} className="rtl:rotate-180" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-success-soft text-success">
              <ShieldCheck size={20} />
            </div>
            <h1 className="text-[18px] font-semibold">{t("onboarding.readyTitle")}</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t("onboarding.readyBody")}</p>
            <div className="mt-6 flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  queueTour();
                  void update({ onboarded: true });
                }}
                autoFocus
              >
                {t("onboarding.start")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
