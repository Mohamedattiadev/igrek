import { KanbanSquare, MessagesSquare, SquareCheckBig, Users, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card } from "./ui";

const KEY = "igrek.teamWelcome.seen";

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The first look after joining a team (plan.md 18.3): a teammate went straight to Messages and never
 * found the shared project. Three places, one line each, until it is closed.
 */
export function TeamWelcome({ team }: { team: boolean }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(seen);
  if (!team || hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Storage disabled: it shows again next time, which is harmless.
    }
    setHidden(true);
  };
  const places = [
    { to: "/", icon: KanbanSquare, key: "projects" },
    { to: "/chat", icon: MessagesSquare, key: "messages" },
    { to: "/mine", icon: SquareCheckBig, key: "mine" },
  ] as const;
  return (
    <Card className="space-y-2 p-pad">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Users size={15} className="text-accent" aria-hidden="true" />
        {t("teamWelcome.title")}
        <button
          type="button"
          onClick={close}
          aria-label={t("teamWelcome.close")}
          className="ms-auto rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {places.map((p) => (
          <li key={p.key}>
            <Link to={p.to} className="flex h-full gap-2 rounded-ui border border-border p-2.5 hover:border-accent">
              <p.icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-[12.5px]">
                <span className="block font-medium">{t(`teamWelcome.${p.key}`)}</span>
                <span className="text-fg-muted">{t(`teamWelcome.${p.key}Hint`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
