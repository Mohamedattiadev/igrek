import type { ProjectListItem } from "@igrek/core";
import { ArrowRight, Check, FolderPlus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AddProjectForm } from "../components/AddProjectForm";
import { AiToolsCheck } from "../components/AiToolsCheck";
import { CodingChoice } from "../components/CodingQuestion";
import { LanguagePackPanel } from "../components/LanguagePack";
import { LanguagePicker } from "../components/LanguagePicker";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { isBundled } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import { queueTour } from "../lib/tour";

/**
 * Projects are only the folders the user adds (autoProjects is off by default), so the first run
 * asks for one right after the language: without it Igrek has nothing to show. Folders Igrek saw
 * Claude work in are offered with one click; letting Igrek add every such folder is the other way.
 */
/** A home folder, the desktop or downloads: Claude ran there once, but it is not a project. */
const NOT_A_PROJECT =
  /^(\/(home|Users)\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)$|[/\\](Desktop|Documents|Downloads|Masaüstü|Belgeler|İndirilenler)$/;

function ProjectStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [other, setOther] = useState(false);
  const load = useCallback(() => {
    let current = true;
    api
      .projects()
      .then((list) => current && setProjects(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  useEffect(load, [load]);
  const added = projects.filter((p) => !p.hidden);
  // The folders Claude worked in, newest first, both those added now and those still to add.
  const offered = projects
    .filter((p) => !NOT_A_PROJECT.test(p.path))
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, 6);
  const add = (path: string) =>
    void api
      .addProject(path)
      .then(load)
      .catch(() => undefined);
  return (
    <>
      <h1 className="text-[18px] font-semibold">{t("onboarding.projectsTitle")}</h1>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-fg-muted">{t("onboarding.projectsPick")}</p>
      {offered.length > 0 && (
        <ul className="space-y-1">
          {offered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!p.hidden}
                onClick={() => add(p.path)}
                aria-label={t("onboarding.addNamed", { name: p.name })}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-ui border px-2.5 py-1.5 text-start",
                  p.hidden ? "border-border hover:border-accent" : "border-success bg-success-soft",
                )}
              >
                {p.hidden ? (
                  <FolderPlus size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                ) : (
                  <Check size={15} className="shrink-0 text-success" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-subtle">{p.path}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Typing a path is for the rare folder Claude never worked in: folded unless there is nothing to pick. */}
      {other || offered.length === 0 ? (
        <div className="mt-3">
          <AddProjectForm autoFocus onAdded={load} />
        </div>
      ) : (
        <button type="button" onClick={() => setOther(true)} className="mt-3 text-[12.5px] text-accent hover:underline">
          {t("onboarding.projectsOther")}
        </button>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {/* Someone with no project yet is not stuck here: the Projects page can make or add one later. */}
        {added.length === 0 && (
          <Button variant="ghost" onClick={onDone}>
            {t("onboarding.projectsLater")}
          </Button>
        )}
        <Button variant="primary" disabled={added.length === 0} onClick={onDone}>
          {added.length > 0 ? t("onboarding.continueWith", { count: added.length }) : t("onboarding.continue")}
          <ArrowRight size={14} className="rtl:rotate-180" />
        </Button>
      </div>
    </>
  );
}

/** First tasks people try, each a prompt that waits in a new chat (nothing is sent before Send). */
const FIRST = ["explain", "next", "readme"] as const;

/**
 * The last step offers a first task in the project just added (plan.md 7.2, the first five minutes):
 * a real answer about the user's own code within a minute, instead of an empty screen to figure out.
 */
function FirstTask() {
  const { t } = useTranslation();
  const { update } = useSettings();
  const [project, setProject] = useState<ProjectListItem>();
  useEffect(() => {
    api
      .projects()
      .then((list) => setProject(list.find((p) => !p.hidden)))
      .catch(() => undefined);
  }, []);
  if (!project) return null;
  const start = (key: (typeof FIRST)[number]) => {
    const draft = encodeURIComponent(t(`onboarding.first_${key}`));
    void update({ onboarded: true }).then(() =>
      window.location.assign(`/c/new?project=${encodeURIComponent(project.id)}&draft=${draft}`),
    );
  };
  return (
    <div className="mt-4 space-y-2 rounded-ui border border-border p-3 text-[13px]">
      <p className="font-medium">{t("onboarding.firstTitle", { project: project.name })}</p>
      <div className="flex flex-col gap-1.5">
        {FIRST.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => start(key)}
            className="rounded-ui border border-border px-2.5 py-1.5 text-start text-[12.5px] hover:border-accent"
          >
            {t(`onboarding.first_${key}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * First-run wizard: the language (plan.md 7.4), then the project folders, then a word on privacy
 * with what to install if Claude Code or Codex is missing (Igrek does not bring them).
 */
export function Onboarding() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [step, setStep] = useState(0);
  // Start in the browser's language when Igrek ships it (Turkish): a Turkish newcomer should not have
  // to find "Türkçe" in an English list first. Other languages are a choice: their texts are made
  // by a model, which is not asked unasked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on the first screen
  useEffect(() => {
    const browser = navigator.language.split("-")[0] ?? "";
    if (settings.language === "en" && browser !== "en" && isBundled(browser)) void update({ language: browser });
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-bg-subtle">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-bg p-6 shadow-ui">
          <div className="mb-6 flex items-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-bg-muted"}`} />
            ))}
          </div>

          {step === 0 ? (
            <>
              <h1 className="text-[18px] font-semibold">{t("onboarding.welcome")}</h1>
              <p className="mt-1 mb-4 text-[13px] text-fg-muted">{t("onboarding.pickLanguage")}</p>
              <LanguagePicker value={settings.language} onChange={(language) => void update({ language })} />
              {!isBundled(settings.language) && <LanguagePackPanel code={settings.language} />}
              <div className="mt-5 flex justify-end">
                <Button variant="primary" onClick={() => setStep(1)}>
                  {t("onboarding.continue")}
                  <ArrowRight size={14} className="rtl:rotate-180" />
                </Button>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <h1 className="text-[18px] font-semibold">{t("coding.title")}</h1>
              <p className="mt-1 mb-4 text-[13px] leading-relaxed text-fg-muted">{t("coding.body")}</p>
              <CodingChoice onPicked={() => setStep(2)} />
              <p className="mt-3 text-[12px] text-fg-subtle">{t("coding.later")}</p>
            </>
          ) : step === 2 ? (
            <ProjectStep onDone={() => setStep(3)} />
          ) : (
            <>
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-success-soft text-success">
                <ShieldCheck size={20} />
              </div>
              <h1 className="text-[18px] font-semibold">{t("onboarding.readyTitle")}</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t("onboarding.readyBody")}</p>
              <div className="mt-4">
                <AiToolsCheck
                  onTerminal={(id) =>
                    // Installing a tool is the last thing here: setup is done, and its terminal opens.
                    void update({ onboarded: true }).then(() => window.location.assign(`/t/${id}`))
                  }
                />
              </div>
              <FirstTask />
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => void update({ onboarded: true })}>
                  {t("onboarding.startNoTour")}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    queueTour();
                    void update({ onboarded: true });
                  }}
                  autoFocus
                >
                  {t("onboarding.startTour")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
