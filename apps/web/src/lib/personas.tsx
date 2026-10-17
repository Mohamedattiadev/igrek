import type { Persona } from "@godeye/core";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Binoculars,
  Bot,
  Brain,
  Briefcase,
  Bug,
  ClipboardList,
  Code,
  Cog,
  Compass,
  Database,
  FlaskConical,
  FlaskRound,
  Gauge,
  Globe,
  Heart,
  Landmark,
  Microscope,
  Monitor,
  MonitorSmartphone,
  MousePointerClick,
  Package,
  Palette,
  PenLine,
  Plug,
  Rocket,
  Scale,
  ShieldCheck,
  Smartphone,
  Swords,
  TestTube,
  Tornado,
  TrendingUp,
  UserRound,
  Wallet,
  Workflow,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { cn } from "./cn";
import { useServerEvent } from "./live";

/** Icons a persona can have; anything else shows the default. */
export const PERSONA_ICONS: Record<string, LucideIcon> = {
  Tornado,
  MonitorSmartphone,
  Accessibility,
  Bug,
  Activity,
  MousePointerClick,
  Plug,
  TestTube,
  Binoculars,
  Bot,
  Brain,
  Briefcase,
  ClipboardList,
  Code,
  Cog,
  Compass,
  Database,
  FlaskConical,
  FlaskRound,
  Gauge,
  Globe,
  Heart,
  Landmark,
  Microscope,
  Monitor,
  Package,
  Palette,
  PenLine,
  Rocket,
  Scale,
  ShieldCheck,
  Smartphone,
  Swords,
  TrendingUp,
  UserRound,
  Wallet,
  Workflow,
  Wrench,
};

export function PersonaIcon({
  persona,
  size = 15,
  className,
}: {
  persona?: Persona;
  size?: number;
  className?: string;
}) {
  const Icon = (persona && PERSONA_ICONS[persona.icon]) || UserRound;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent",
        size > 16 ? "size-10" : "size-6",
        className,
      )}
    >
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** Name and role in the user's language (built-ins are translated; own personas keep theirs). */
export function usePersonaLabel(): (
  persona: Persona | undefined,
  fallbackId?: string,
) => { name: string; role: string } {
  const { t, i18n } = useTranslation();
  return (persona, fallbackId) => {
    if (!persona) return { name: fallbackId ?? "", role: "" };
    if (!persona.builtin) return { name: persona.name || persona.id, role: persona.role || "" };
    const key = `persona.${persona.id}`;
    return {
      name: i18n.exists(`${key}.name`) ? t(`${key}.name`) : persona.id,
      role: i18n.exists(`${key}.role`) ? t(`${key}.role`) : "",
    };
  };
}

let cache: Persona[] | undefined;

/** Every persona, kept fresh when one changes. */
export function usePersonas(): { personas: Persona[]; reload: () => void; loaded: boolean } {
  const [personas, setPersonas] = useState<Persona[]>(cache ?? []);
  const [loaded, setLoaded] = useState(!!cache);
  const reload = () => {
    api
      .personas()
      .then((list) => {
        cache = list;
        setPersonas(list);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };
  useEffect(reload, []);
  useServerEvent("personas-changed", reload);
  return { personas, reload, loaded };
}

let myName: string | undefined;

/** "Mohamed" when signed in to a team, otherwise "You" (for "You → Backend Senior"). */
export function useMyName(): string {
  const { t } = useTranslation();
  const [name, setName] = useState(myName);
  useEffect(() => {
    if (myName !== undefined) return;
    api
      .team()
      .then((status) => {
        myName = status.user?.displayName ?? "";
        setName(myName);
      })
      .catch(() => undefined);
  }, []);
  return name || t("persona.you");
}

/** Starts a one-to-one chat with a persona; a draft waits in the box until the user sends it. */
export async function startPersonaChat(
  personaId: string,
  projectId: string,
  navigate: (to: string) => void,
  draft?: string,
): Promise<void> {
  const chat = await api.startChat({ projectId, personaId });
  navigate(`/c/${chat.id}${draft ? `?draft=${encodeURIComponent(draft)}` : ""}`);
}
