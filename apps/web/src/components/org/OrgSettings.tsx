import { canAssign, isManager } from "@igrek/core";
import { Bot, CalendarOff, Clock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { dateTime } from "../../lib/format";
import { Button, Card, field } from "../ui";
import { nameOf, type OrgApi, type OrgView } from "./api";

const box = cn(field, "w-full");
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const HOURS = [...Array(24).keys()];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutes = (v: string) => {
  const [h = "0", m = "0"] = v.split(":");
  return Number(h) * 60 + Number(m);
};

/** The coordinator bot (plan.md 20.7): its name, whose Igrek runs it, the morning report's hour. */
function BotSettings({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const bot = view.state.bot;
  const [name, setName] = useState(bot.name);
  const [handle, setHandle] = useState(bot.handle);
  const [hour, setHour] = useState(String(bot.reportHour));
  const runs = isManager(view.structure, view.me) || view.me.role === "admin";
  const save = (patch: Partial<typeof bot>) =>
    void api.act("org-bot", { ...bot, name, handle, reportHour: Number(hour), ...patch });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Bot size={15} className="text-accent" aria-hidden="true" /> {t("org.botTitle")}
      </h2>
      <p className="text-[12.5px] text-fg-muted">{t("org.botIntro", { handle: bot.handle })}</p>
      <p className="text-[12.5px]">
        {bot.enabled
          ? bot.host
            ? t("org.botRunsOn", { who: nameOf(view, bot.host) })
            : t("org.botNoHost")
          : t("org.botOff")}
      </p>
      {runs && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className={box}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t("org.botName")}
              placeholder={t("org.botName")}
            />
            <input
              className={box}
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/[^\w.-]/g, ""))}
              aria-label={t("org.botHandle")}
              placeholder={t("org.botHandle")}
            />
            <select
              className={box}
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              aria-label={t("org.reportHour")}
            >
              <option value="-1">{t("org.noReport")}</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {t("org.reportAt", { time: hhmm(h * 60) })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => save({ enabled: true, host: view.me.id })}>
              {t("org.botRunHere")}
            </Button>
            <Button onClick={() => save({})}>{t("member.save")}</Button>
            {bot.enabled && (
              <Button variant="ghost" onClick={() => save({ enabled: false })}>
                {t("org.botStop")}
              </Button>
            )}
          </div>
          <p className="text-[11.5px] text-fg-subtle">{t("org.botHostHint")}</p>
        </>
      )}
      {!runs && canAssign(view.structure, view.me) && (
        <p className="text-[12px] text-fg-subtle">{t("org.botYouMay")}</p>
      )}
    </Card>
  );
}

/** My working hours, days and time off: the bot does not give me work while I am away. */
function Availability({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t, i18n } = useTranslation();
  const mine = view.state.availability[view.me.id] ?? {
    from: 540,
    to: 1080,
    days: [1, 2, 3, 4, 5],
    leave: [],
    tz: new Date().getTimezoneOffset(),
  };
  const [from, setFrom] = useState(hhmm(mine.from));
  const [to, setTo] = useState(hhmm(mine.to));
  const [days, setDays] = useState(mine.days);
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const save = (leave = mine.leave) =>
    void api.act("org-avail", {
      from: minutes(from),
      to: minutes(to),
      days,
      leave,
      tz: new Date().getTimezoneOffset(),
    });
  const dayName = (d: number) => new Date(2026, 9, 25 + d).toLocaleDateString(i18n.language, { weekday: "short" });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Clock size={15} className="text-accent" aria-hidden="true" /> {t("org.myHours")}
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <input
          type="time"
          className={box}
          style={{ width: 120 }}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label={t("org.from")}
        />
        -
        <input
          type="time"
          className={box}
          style={{ width: 120 }}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label={t("org.to")}
        />
        {DAYS.map((d) => (
          <label key={d} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={days.includes(d)}
              onChange={(e) => setDays((x) => (e.target.checked ? [...x, d] : x.filter((y) => y !== d)))}
            />
            {dayName(d)}
          </label>
        ))}
        <Button size="sm" onClick={() => save()}>
          {t("member.save")}
        </Button>
      </div>
      <h3 className="flex items-center gap-2 text-[12.5px] font-semibold">
        <CalendarOff size={13} aria-hidden="true" /> {t("org.timeOff")}
      </h3>
      {mine.leave.map((l) => (
        <p key={l.from} className="flex items-center gap-2 text-[12.5px]">
          {dateTime(l.from)} - {dateTime(l.to)}
          <button
            type="button"
            className="text-[12px] text-accent hover:underline"
            onClick={() => save(mine.leave.filter((x) => x.from !== l.from))}
          >
            {t("org.remove")}
          </button>
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          className={box}
          style={{ width: 160 }}
          value={leaveFrom}
          onChange={(e) => setLeaveFrom(e.target.value)}
          aria-label={t("org.from")}
        />
        <input
          type="date"
          className={box}
          style={{ width: 160 }}
          value={leaveTo}
          onChange={(e) => setLeaveTo(e.target.value)}
          aria-label={t("org.to")}
        />
        <Button
          size="sm"
          disabled={!leaveFrom || !leaveTo}
          onClick={() =>
            save([
              ...mine.leave,
              { from: new Date(`${leaveFrom}T00:00`).getTime(), to: new Date(`${leaveTo}T23:59`).getTime() },
            ])
          }
        >
          {t("org.addTimeOff")}
        </Button>
      </div>
    </Card>
  );
}

export function OrgSettings({ api, view }: { api: OrgApi; view: OrgView }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BotSettings api={api} view={view} />
      <Availability api={api} view={view} />
    </div>
  );
}
