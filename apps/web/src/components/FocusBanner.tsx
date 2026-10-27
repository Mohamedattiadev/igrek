import type { CalendarItem, ProjectListItem } from "@igrek/core";
import { Crosshair } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { calendarApi } from "../lib/ops-api";
import { Button } from "./ui";

const DAY = 86_400_000;
/** More active projects than this splits attention (plan.md 13.2 "Odak modu"). */
const FOCUS_LIMIT = 3;
const SNOOZE_KEY = "igrek.focusSnoozedUntil";

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** The two projects worth focusing on: a date coming up first, then the most recent work. */
function focusPick(active: ProjectListItem[], dates: CalendarItem[], count = 2): ProjectListItem[] {
  const soonest = (id: string) =>
    Math.min(...dates.filter((d) => d.projectId === id).map((d) => d.at), Number.POSITIVE_INFINITY);
  return [...active].sort((a, b) => soonest(a.id) - soonest(b.id) || b.lastActivity - a.lastActivity).slice(0, count);
}

/**
 * Focus mode (plan.md 13.2): too many projects at once is the real problem. When more than three
 * were worked on in the last week, Igrek suggests two to focus on and can put the rest on hold.
 */
export function FocusBanner({ projects, onChange }: { projects: ProjectListItem[]; onChange: () => void }) {
  const { t } = useTranslation();
  const [dates, setDates] = useState<CalendarItem[]>([]);
  const [hidden, setHidden] = useState(() => snoozedUntil() > Date.now());
  const [busy, setBusy] = useState(false);
  const active = projects.filter((p) => !p.hidden && p.status === "active" && Date.now() - p.lastActivity < 7 * DAY);
  useEffect(() => {
    if (active.length > FOCUS_LIMIT)
      calendarApi
        .items(Date.now(), Date.now() + 21 * DAY)
        .then((items) => setDates(items.filter((i) => i.kind === "deadline" || i.kind === "milestone")))
        .catch(() => undefined);
  }, [active.length]);
  if (hidden || active.length <= FOCUS_LIMIT) return null;
  const pick = focusPick(active, dates);
  const rest = active.filter((p) => !pick.includes(p));
  return (
    <div className="flex flex-wrap items-center gap-2 bg-warning-soft/40 px-3 py-1.5 text-[13px]">
      <Crosshair size={15} className="text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {t("focus.message", { count: active.length, names: pick.map((p) => p.name).join(", ") })}
      </span>
      <Button
        size="sm"
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await Promise.all(rest.map((p) => api.setProjectStatus(p.id, "paused"))).catch(() => undefined);
          setBusy(false);
          onChange();
        }}
        data-tip={t("focus.pauseTip", { names: rest.map((p) => p.name).join(", ") })}
      >
        {t("focus.pauseRest", { count: rest.length })}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          try {
            localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * DAY));
          } catch {
            // Private window: hidden until reload.
          }
          setHidden(true);
        }}
      >
        {t("focus.later")}
      </Button>
    </div>
  );
}
