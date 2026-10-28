import { ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui";
import { cn } from "../lib/cn";
import { dateTime, relativeTime } from "../lib/format";
import type { MemberClient } from "./client";
import { MemberComments } from "./MemberComments";
import type { MemberProject, MemberSession } from "./model";

/** What a session is called: Igrek's summary title, the tool's title, or the first thing asked in it. */
export function sessionTitle(s: MemberSession, untitled: string): string {
  const first = s.firstPrompt
    ?.split("\n")
    .find((l) => l.trim())
    ?.trim();
  return s.summary?.title || s.title || (first ? first.slice(0, 90) : untitled);
}

/** The summary in the reader's language when Igrek wrote one, else in English. */
function summaryText(s: MemberSession, language: string) {
  const texts = s.summary?.texts ?? {};
  return texts[language] ?? texts.en ?? Object.values(texts)[0];
}

export function dayOf(at: number, t: (key: string) => string): string {
  const day = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return t("member.today");
  if (day.toDateString() === yesterday.toDateString()) return t("member.yesterday");
  return day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function Initial({ name }: { name: string }) {
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
      style={{ background: `hsl(${hue} 45% 45%)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SessionList({ project, onOpen }: { project: MemberProject; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");
  const all = [...project.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const people = [...new Set(all.map((s) => s.author))];
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (s) =>
      (!who || s.author === who) &&
      (!q || `${sessionTitle(s, "")} ${summaryText(s, i18n.language)?.did?.join(" ") ?? ""}`.toLowerCase().includes(q)),
  );
  const days = new Map<string, MemberSession[]>();
  for (const s of shown) days.set(dayOf(s.updatedAt, t), [...(days.get(dayOf(s.updatedAt, t)) ?? []), s]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-ui border border-border bg-bg px-2.5 focus-within:border-accent">
          <Search size={14} className="text-fg-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("member.searchSessions")}
            aria-label={t("member.searchSessions")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        {people.length > 1 &&
          ["", ...people].map((p) => (
            <button
              key={p || "all"}
              type="button"
              onClick={() => setWho(p)}
              aria-pressed={who === p}
              className={cn(
                "h-8 rounded-full border px-3 text-[12.5px]",
                who === p ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-bg-hover",
              )}
            >
              {p || t("member.everyone")}
            </button>
          ))}
      </div>
      {shown.length === 0 && <p className="py-8 text-center text-[13px] text-fg-subtle">{t("member.nothingYet")}</p>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">{day}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
            {list.map((s) => {
              const did = summaryText(s, i18n.language)?.did?.[0];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-bg-hover"
                  >
                    <Initial name={s.author} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {sessionTitle(s, t("member.untitled"))}
                      </span>
                      {did && <span className="mt-0.5 block truncate text-[12.5px] text-fg-muted">{did}</span>}
                    </span>
                    <span className="shrink-0 text-end text-[11.5px] text-fg-subtle">
                      <span className="block font-medium text-fg-muted">{s.author}</span>
                      {relativeTime(s.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SessionView({
  client,
  project,
  id,
  onBack,
}: {
  client: MemberClient;
  project: MemberProject;
  id: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const s = project.sessions.get(id);
  if (!s) return null;
  const summary = summaryText(s, i18n.language);
  const messages = (project.messages.get(id) ?? []).filter((m) => m.kind !== "tool");
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[12.5px] text-accent hover:underline"
      >
        <ArrowLeft size={13} aria-hidden="true" /> {t("member.sessions")}
      </button>
      <header className="flex items-start gap-3">
        <Initial name={s.author} />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug">{sessionTitle(s, t("member.untitled"))}</h2>
          <p className="text-[12px] text-fg-subtle">
            {s.author} · {s.tool} · {dateTime(s.updatedAt)}
          </p>
        </div>
      </header>
      {summary && (
        <Card className="space-y-3 p-pad text-[13px]">
          {summary.why && (
            <p>
              <span className="font-semibold">{t("member.why")}:</span> {summary.why}
            </p>
          )}
          {!!summary.did?.length && (
            <div>
              <p className="mb-1 font-semibold">{t("member.did")}</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {summary.did.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {!!summary.left?.length && (
            <div>
              <p className="mb-1 font-semibold">{t("member.left")}</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {summary.left.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      {messages.length > 0 ? (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-xl p-3 text-[13px]",
                m.role === "user" ? "ms-8 bg-accent-soft" : "me-8 border border-border bg-bg",
              )}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                {m.role === "user" ? s.author : t("member.ai")}
              </p>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-fg-subtle">{t("member.summaryOnly")}</p>
      )}
      <MemberComments client={client} project={project} kind="session" id={id} />
    </div>
  );
}
