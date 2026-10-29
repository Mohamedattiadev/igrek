import type { Bot, BotJob, ProjectListItem } from "@igrek/core";
import { Bot as BotIcon, Play, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import { Badge, Button, Card, EmptyState, field } from "./ui";

const APPROVALS: Bot["approval"][] = ["plan", "ask", "edits"];
/** Team flows a bot can lead instead of working alone (a lead and specialists). */
const TEAM_FLOWS = ["feature", "spec", "fix", "careful"];
const STATUS_TONE: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  running: "accent",
  needs_you: "warning",
  ready: "warning",
  merged: "success",
  done: "success",
  failed: "danger",
};

/** Name, expert, role, approval mode, team flow and project: the same form makes and changes a bot. */
function BotForm({ bot, projects, onDone }: { bot?: Bot; projects: ProjectListItem[]; onDone: () => void }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [draft, setDraft] = useState<Partial<Bot>>(
    bot ?? { name: "", persona: "backend", role: "", approval: "edits", memory: "" },
  );
  const [error, setError] = useState<string>();
  const set = (patch: Partial<Bot>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () =>
    void (bot ? api.updateBot(bot.id, draft) : api.createBot(draft))
      .then(onDone)
      .catch((err: Error) => setError(err.message));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[12.5px]">
          <span className="font-medium">{t("bots.name")}</span>
          <input
            value={draft.name ?? ""}
            onChange={(e) => set({ name: e.target.value })}
            className={cn(field, "w-full")}
          />
        </label>
        <label className="space-y-1 text-[12.5px]">
          <span className="font-medium">{t("bots.handle")}</span>
          <input
            value={draft.handle ?? ""}
            placeholder={t("bots.handleHint")}
            onChange={(e) => set({ handle: e.target.value })}
            className={cn(field, "w-full")}
          />
        </label>
        <label className="space-y-1 text-[12.5px]">
          <span className="font-medium">{t("bots.persona")}</span>
          <select
            value={draft.persona}
            onChange={(e) => set({ persona: e.target.value })}
            className={cn(field, "w-full")}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p).name} · {label(p).role}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[12.5px]">
          <span className="font-medium">{t("bots.project")}</span>
          <select
            value={draft.projectId ?? ""}
            disabled={!!bot}
            onChange={(e) => set({ projectId: e.target.value || undefined })}
            className={cn(field, "w-full")}
          >
            <option value="">{t("bots.everyProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-[12.5px]">
        <span className="font-medium">{t("bots.role")}</span>
        <input
          value={draft.role ?? ""}
          placeholder={t("bots.roleHint")}
          onChange={(e) => set({ role: e.target.value })}
          className={cn(field, "w-full")}
        />
      </label>
      <fieldset className="space-y-1.5 text-[12.5px]">
        <legend className="font-medium">{t("bots.approval")}</legend>
        {APPROVALS.map((a) => (
          <label key={a} className="flex items-start gap-2">
            <input
              type="radio"
              name="approval"
              checked={draft.approval === a}
              onChange={() => set({ approval: a })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{t(`bots.approval_${a}`)}</span>
              <span className="block text-fg-muted">{t(`bots.approvalHint_${a}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-[12.5px]">
        <span className="font-medium">{t("bots.team")}</span>
        <select
          value={draft.flow ?? ""}
          onChange={(e) => set({ flow: e.target.value || undefined })}
          className={cn(field, "w-full")}
        >
          <option value="">{t("bots.alone")}</option>
          {TEAM_FLOWS.map((f) => (
            <option key={f} value={f}>
              {t("bots.withTeam", { flow: f })}
            </option>
          ))}
        </select>
      </label>
      {bot && (
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("bots.memory")}</span>
          <span className="block text-fg-muted">{t("bots.memoryHint")}</span>
          <textarea
            value={draft.memory ?? ""}
            rows={5}
            onChange={(e) => set({ memory: e.target.value })}
            className={cn(field, "h-auto w-full py-1.5 font-mono text-[12px]")}
          />
        </label>
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("bots.cancel")}
        </Button>
        <Button type="submit" variant="primary" icon={Save} disabled={!draft.name?.trim()}>
          {t(bot ? "bots.save" : "bots.create")}
        </Button>
      </div>
    </form>
  );
}

/** What a bot did: each job with how it stands, linked to its run (review and merge there). */
function Jobs({ bot, projects }: { bot: Bot; projects: ProjectListItem[] }) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<BotJob[]>([]);
  const [request, setRequest] = useState("");
  const [projectId, setProjectId] = useState(bot.projectId ?? projects[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      void api
        .botJobs(bot.id)
        .then(setJobs)
        .catch(() => undefined),
    [bot.id],
  );
  useEffect(load, [load]);
  useServerEvent("bots-changed", load);
  useServerEvent("flows-changed", load);
  const give = () =>
    void api
      .giveBotJob(bot.id, projectId, request)
      .then(() => {
        setRequest("");
        setError(undefined);
        load();
      })
      .catch((err: Error) => setError(err.message));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!bot.projectId && (
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={t("bots.jobHint", { name: bot.name })}
          aria-label={t("bots.jobHint", { name: bot.name })}
          className={cn(field, "min-w-0 flex-1")}
        />
        <Button
          size="sm"
          variant="primary"
          icon={Play}
          disabled={request.trim().length < 3 || !projectId}
          onClick={give}
        >
          {t("bots.give")}
        </Button>
      </div>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <ul className="divide-y divide-border text-[12.5px]">
        {jobs.map((j) => (
          <li key={j.runId} className="flex items-center gap-3 py-1.5">
            <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>{t(`bots.status_${j.status}`)}</Badge>
            <span className="min-w-0 flex-1 truncate">{j.request}</span>
            {!!j.changes?.length && (
              <span className="text-fg-subtle">{t("bots.files", { count: j.changes.length })}</span>
            )}
            <span className="text-fg-subtle">{relativeTime(j.updatedAt)}</span>
            <Link to={`/runs/${j.runId}`} className="font-medium text-accent hover:underline">
              {t("bots.openRun")}
            </Link>
          </li>
        ))}
        {!jobs.length && <li className="py-2 text-fg-subtle">{t("bots.noJobs", { handle: bot.handle })}</li>}
      </ul>
    </div>
  );
}

/**
 * Team bots (plan.md 19.2): coworkers with a name, a role and a memory, called with @name in a
 * channel or given a card; each job runs in its own copy of the repository and waits for your merge.
 */
export function BotsTab() {
  const { t } = useTranslation();
  const label = usePersonaLabel();
  const { personas } = usePersonas();
  const [bots, setBots] = useState<Bot[]>();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [editing, setEditing] = useState<string>();
  const load = useCallback(
    () =>
      void api
        .bots()
        .then(setBots)
        .catch(() => setBots([])),
    [],
  );
  useEffect(load, [load]);
  useEffect(
    () =>
      void api
        .projects()
        .then(setProjects)
        .catch(() => undefined),
    [],
  );
  useServerEvent("bots-changed", load);
  const done = () => {
    setEditing(undefined);
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>
          {t("bots.new")}
        </Button>
      </div>
      {editing === "new" && (
        <Card className="p-4">
          <BotForm projects={projects} onDone={done} />
        </Card>
      )}
      {bots && !bots.length && editing !== "new" && (
        <EmptyState icon={BotIcon} title={t("bots.emptyTitle")} body={t("bots.emptyBody")} />
      )}
      {bots?.map((bot) => {
        const persona = personas.find((p) => p.id === bot.persona);
        return (
          <Card key={bot.id} className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <BotIcon size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{bot.name}</span>
                  <span className="text-[12.5px] text-fg-subtle">@{bot.handle}</span>
                  <Badge>{t(`bots.approval_${bot.approval}`)}</Badge>
                  {bot.flow && <Badge tone="accent">{t("bots.withTeam", { flow: bot.flow })}</Badge>}
                </p>
                <p className="text-[12.5px] text-fg-muted">
                  {bot.role || (persona ? label(persona).role : "")}
                  {persona && <span className="text-fg-subtle"> · {label(persona).name}</span>}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(editing === bot.id ? undefined : bot.id)}>
                {t("bots.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                aria-label={t("bots.remove")}
                onClick={() =>
                  window.confirm(t("bots.removeConfirm", { name: bot.name })) && void api.deleteBot(bot.id).then(load)
                }
              />
            </div>
            {editing === bot.id ? (
              <BotForm bot={bot} projects={projects} onDone={done} />
            ) : (
              <Jobs bot={bot} projects={projects} />
            )}
          </Card>
        );
      })}
    </div>
  );
}
