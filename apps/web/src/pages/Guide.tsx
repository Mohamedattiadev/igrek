import { HELP_TOPICS } from "@igrek/core";
import {
  ArrowRight,
  Bot,
  Compass,
  FolderPlus,
  GraduationCap,
  Inbox,
  type LucideIcon,
  MessageSquareText,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  SquareTerminal,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button, PageHeader } from "../components/ui";
import { startTour } from "../lib/tour";

/** The first steps, in the order a new user needs them. */
const STEPS: { id: string; icon: LucideIcon; to: string }[] = [
  { id: "add", icon: FolderPlus, to: "/" },
  { id: "ask", icon: MessageSquareText, to: "/" },
  { id: "approve", icon: ShieldCheck, to: "/" },
  { id: "project", icon: PanelsTopLeft, to: "/" },
  { id: "terminal", icon: SquareTerminal, to: "/terminals" },
  { id: "inbox", icon: Inbox, to: "/inbox" },
  { id: "personas", icon: UsersRound, to: "/personas" },
  { id: "learn", icon: GraduationCap, to: "/learn" },
  { id: "helper", icon: Bot, to: "/" },
  { id: "settings", icon: Settings, to: "/settings" },
];

/** The user guide: the first steps one by one, then every part of Igrek in a sentence. */
export function GuidePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={t("guide.title")} />
      <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
        <section className="rounded-xl border border-border bg-bg-subtle p-6">
          <h2 className="text-[20px] font-semibold tracking-tight">{t("guide.heroTitle")}</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-fg-muted">{t("guide.heroBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={Compass}
              onClick={() => {
                void navigate("/");
                setTimeout(startTour, 300);
              }}
            >
              {t("helper.startTour")}
            </Button>
            <Button icon={Bot} onClick={() => window.dispatchEvent(new CustomEvent("igrek:helper"))}>
              {t("guide.askHelper")}
            </Button>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{t("guide.steps")}</h2>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.id} className="flex gap-4 rounded-ui border border-border bg-bg p-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg">
                    {i + 1}
                  </span>
                  <step.icon size={16} className="text-fg-subtle" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14.5px] font-semibold">{t(`guide.${step.id}.title`)}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{t(`guide.${step.id}.body`)}</p>
                  <p className="mt-2 rounded-md bg-bg-subtle px-3 py-2 text-[12.5px] leading-relaxed">
                    {t(`guide.${step.id}.how`)}
                  </p>
                </div>
                <Link
                  to={step.to}
                  className="flex h-8 shrink-0 items-center gap-1 self-start rounded-ui px-2 text-[12.5px] text-accent hover:bg-accent-soft"
                >
                  {t("guide.show")} <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{t("guide.all")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {HELP_TOPICS.map((topic) => (
              <li key={topic.id}>
                <Link
                  to={topic.path}
                  className="block h-full rounded-ui border border-border bg-bg p-3 transition-colors hover:border-accent hover:bg-accent-soft/30"
                >
                  <p className="text-[13px] font-medium">{t(`help.t_${topic.id}`)}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{t(`help.d_${topic.id}`)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
