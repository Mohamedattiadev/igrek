import type { Bot, SessionDetail } from "@igrek/core";
import { Bot as BotIcon, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { Button, field, Panel } from "./ui";

/** What the bot is told about the chat it helps with: its title and the summary, in the user's language. */
function contextOf(session: SessionDetail, lang: string): string {
  const text = session.summary?.texts[lang] ?? session.summary?.texts.en;
  const lines = [
    `Chat: ${session.summary?.title || session.title}`,
    ...(text ? [`Why: ${text.why}`, ...text.did.map((x) => `Done: ${x}`), ...text.left.map((x) => `Left: ${x}`)] : []),
  ];
  return lines.join("\n");
}

/**
 * A helper bot for this chat (a user: "each session could have a bot section; a shared one, or one
 * made for this session, named as I like, 'Ati's helper'"). Pick one of the team's bots or make a
 * new one; a job given here carries the chat's summary, so the bot knows what was done and is left.
 */
export function SessionBot({ session }: { session: SessionDetail }) {
  const { t, i18n } = useTranslation();
  const projectId = session.projectId ?? "";
  const [bots, setBots] = useState<Bot[]>([]);
  const [chosen, setChosen] = useState("");
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [run, setRun] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      void api
        .bots()
        .then((list) => {
          const here = list.filter((b) => !b.projectId || b.projectId === projectId);
          setBots(here);
          setChosen((c) => c || here[0]?.id || "");
        })
        .catch(() => undefined),
    [projectId],
  );
  useEffect(load, [load]);
  const make = () =>
    void api
      .createBot({
        name: name.trim() || t("sessionBot.defaultName"),
        persona: "backend",
        role: t("sessionBot.role", { title: session.summary?.title || session.title }),
        approval: "ask",
        memory: contextOf(session, i18n.language),
        projectId,
      })
      .then((bot) => {
        setMaking(false);
        setName("");
        setChosen(bot.id);
        load();
      })
      .catch((err: Error) => setError(err.message));
  const give = () =>
    void api
      .giveBotJob(chosen, projectId, `${job.trim()}\n\n${contextOf(session, i18n.language)}`)
      .then((r) => {
        setRun(r.id);
        setJob("");
      })
      .catch((err: Error) => setError(err.message));
  if (!projectId) return null;
  return (
    <Panel
      icon={BotIcon}
      title={t("sessionBot.title")}
      action={
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => setMaking((v) => !v)}>
          {t("sessionBot.new")}
        </Button>
      }
    >
      {making && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            make();
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: the field opens to be typed in
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sessionBot.defaultName")}
            aria-label={t("sessionBot.name")}
            className={cn(field, "min-w-0 flex-1")}
          />
          <Button size="sm" variant="primary" type="submit">
            {t("sessionBot.make")}
          </Button>
        </form>
      )}
      {bots.length ? (
        <>
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label={t("sessionBot.pick")}
            className={cn(field, "w-full")}
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.role ? `· ${b.role}` : ""}
              </option>
            ))}
          </select>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (chosen && job.trim()) give();
            }}
          >
            <input
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder={t("sessionBot.job")}
              aria-label={t("sessionBot.job")}
              className={cn(field, "min-w-0 flex-1")}
            />
            <Button
              size="sm"
              type="submit"
              icon={Send}
              disabled={!chosen || !job.trim()}
              aria-label={t("sessionBot.give")}
            />
          </form>
          <p className="text-[11.5px] text-fg-subtle">{t("sessionBot.hint")}</p>
        </>
      ) : (
        !making && <p className="text-[12.5px] text-fg-muted">{t("sessionBot.none")}</p>
      )}
      {run && (
        <Link to={`/runs/${run}`} className="block text-[12.5px] text-accent hover:underline">
          {t("sessionBot.started")}
        </Link>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </Panel>
  );
}
