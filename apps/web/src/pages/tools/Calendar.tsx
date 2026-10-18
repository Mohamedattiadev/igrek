import type { CalendarItem } from "@igrek/core";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button, Dialog, field } from "../../components/ui";
import { cn } from "../../lib/cn";
import { useProjects } from "../../lib/live";
import { calendarApi } from "../../lib/ops-api";

const KIND_CLASS: Record<CalendarItem["kind"], string> = {
  schedule: "border-accent/40 bg-accent-soft text-accent",
  backup: "border-border bg-bg-subtle text-fg-muted",
  deploy: "border-success/40 bg-success-soft text-success",
  run: "border-border bg-bg-subtle text-fg",
  cert: "border-warning/50 bg-warning-soft text-warning",
  domain: "border-warning/50 bg-warning-soft text-warning",
  deadline: "border-danger/40 bg-danger-soft text-danger",
  milestone: "border-accent bg-accent text-white",
  note: "border-border bg-bg text-fg-muted",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function AddEvent({ day, onClose, onAdded }: { day?: Date; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("deadline");
  const [projectId, setProjectId] = useState("");
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string>();
  return (
    <Dialog open={!!day} onClose={onClose} label={t("calendar.add")}>
      <form
        className="space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!day) return;
          const [h = 9, m = 0] = time.split(":").map(Number);
          const at = new Date(day);
          at.setHours(h, m, 0, 0);
          try {
            await calendarApi.add({ kind, title, at: at.getTime(), projectId: projectId || undefined });
            setTitle("");
            onAdded();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <h2 className="text-[15px] font-semibold">{day?.toLocaleDateString(undefined, { dateStyle: "full" })}</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("calendar.what")}
          aria-label={t("calendar.what")}
          className={cn(field, "w-full")}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={field}
            aria-label={t("calendar.kind")}
          >
            {["deadline", "milestone", "note"].map((k) => (
              <option key={k} value={k}>
                {t(`calendar.kind_${k}`)}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={field}
            aria-label={t("calendar.time")}
          />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={cn(field, "min-w-0 flex-1")}
            aria-label={t("suite.project")}
          >
            <option value="">{t("suite.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("persona.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {t("calendar.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Calendar (plan.md 12): what will run, what happened, what runs out, and your own dates. */
export function CalendarTab() {
  const { t, i18n } = useTranslation();
  const projects = useProjects();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [adding, setAdding] = useState<Date>();
  // Weeks start on Monday, as in Turkey and most of the world.
  const days = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);
  const load = useCallback(() => {
    const from = days[0]?.getTime() ?? 0;
    const to = (days[41]?.getTime() ?? 0) + 86_400_000 - 1;
    calendarApi
      .items(from, to, projectId || undefined)
      .then(setItems)
      .catch(() => setItems([]));
  }, [days, projectId]);
  useEffect(load, [load]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const k = dayKey(new Date(item.at));
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    return map;
  }, [items]);
  const today = dayKey(new Date());
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(i18n.language, { weekday: "short" }));
  const name = (id?: string) => projects.find((p) => p.id === id)?.name;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronLeft}
          aria-label={t("calendar.prev")}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        />
        <h2 className="min-w-40 text-center text-[15px] font-semibold capitalize">
          {month.toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronRight}
          aria-label={t("calendar.next")}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          {t("calendar.today")}
        </Button>
        <div className="flex-1" />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={field}
          aria-label={t("suite.project")}
        >
          <option value="">{t("calendar.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button size="sm" icon={Plus} onClick={() => setAdding(new Date())}>
          {t("calendar.add")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {(Object.keys(KIND_CLASS) as CalendarItem["kind"][]).map((k) => (
          <span key={k} className={cn("rounded border px-1.5 py-0.5", KIND_CLASS[k])}>
            {t(`calendar.kind_${k}`)}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-ui border border-border">
          {weekdays.map((w) => (
            <div
              key={w}
              className="border-b border-border bg-bg-subtle px-2 py-1 text-[11px] font-medium text-fg-muted"
            >
              {w}
            </div>
          ))}
          {days.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const other = d.getMonth() !== month.getMonth();
            return (
              <div
                key={k}
                className={cn(
                  "group min-h-24 border-b border-e border-border p-1 [&:nth-child(7n)]:border-e-0",
                  other && "bg-bg-subtle/50",
                )}
              >
                <div className="flex items-center">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px]",
                      k === today ? "bg-accent font-semibold text-white" : other ? "text-fg-subtle" : "text-fg-muted",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <button
                    type="button"
                    aria-label={t("calendar.addOn", { day: d.toLocaleDateString() })}
                    onClick={() => setAdding(d)}
                    className="ms-auto rounded p-0.5 text-fg-subtle opacity-0 hover:bg-bg-hover group-hover:opacity-100 focus:opacity-100"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {list.slice(0, 4).map((item) => {
                    const label = (
                      <>
                        {item.kind !== "cert" && item.kind !== "domain" && (
                          <span className="me-1 opacity-70">
                            {new Date(item.at).toLocaleTimeString(i18n.language, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {item.ok === false && "! "}
                        {item.kind === "cert"
                          ? t("calendar.certEnds", { host: item.title })
                          : item.kind === "domain"
                            ? t("calendar.domainEnds", { host: item.title })
                            : item.title}
                      </>
                    );
                    const tip = `${t(`calendar.kind_${item.kind}`)}${name(item.projectId) ? ` · ${name(item.projectId)}` : ""}`;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-center gap-0.5 truncate rounded border px-1 text-[10.5px] leading-4",
                          KIND_CLASS[item.kind],
                        )}
                        data-tip={tip}
                      >
                        {item.link ? (
                          <Link to={item.link} className="min-w-0 flex-1 truncate">
                            {label}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                        )}
                        {item.own && (
                          <button
                            type="button"
                            aria-label={t("calendar.remove")}
                            onClick={() => void calendarApi.remove(item.id).then(load)}
                          >
                            <X size={10} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {list.length > 4 && (
                    <li className="px-1 text-[10px] text-fg-subtle">
                      {t("calendar.more", { count: list.length - 4 })}
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <AddEvent day={adding} onClose={() => setAdding(undefined)} onAdded={load} />
    </div>
  );
}
