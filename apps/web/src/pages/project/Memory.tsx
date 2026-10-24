import type { MemoryItem, MemorySection, ProjectDetail } from "@igrek/core";
import { AlertTriangle, Brain, Check, Eye, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Comments } from "../../components/Comments";
import { useTeamPeople } from "../../components/TeamAvatar";
import { TeamText } from "../../components/TeamText";
import { Button, Card, EmptyState } from "../../components/ui";
import { AdrExportButton } from "../../components/Writeups";
import { type AgentFiles, api } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { deferDelete, usePendingDeletes } from "../../lib/undo";

const SECTIONS: MemorySection[] = ["status", "decision", "convention", "failed", "issue"];

function ConflictCard({ item, onDone }: { item: MemoryItem; onDone: () => void }) {
  const { t } = useTranslation();
  // Between two people: say whose is whose.
  const team = !!(item.author || item.conflict?.withAuthor);
  const resolve = async (keep: "new" | "old" | "both") => {
    await api.resolveMemory(item.id, keep);
    onDone();
  };
  return (
    <Card className="space-y-3 border-warning p-pad">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
        <AlertTriangle size={14} />
        {t("memory.conflictTitle")}
      </h3>
      <p className="text-xs text-fg-muted">{t(team ? "memory.conflictTeamBody" : "memory.conflictBody")}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-border bg-bg-subtle p-2.5 text-[13px]">
          <p className="mb-1 text-[11px] text-fg-subtle">
            {t("memory.keepOld")}
            {team && ` · ${item.conflict?.withAuthor ?? t("team.you")}`}
          </p>
          {item.conflict?.withText}
        </div>
        <div className="rounded-md border border-accent bg-accent-soft p-2.5 text-[13px]">
          <p className="mb-1 text-[11px] text-accent">
            {t("memory.keepNew")}
            {team && ` · ${item.author ?? t("team.you")}`}
          </p>
          {item.text}
        </div>
      </div>
      {item.conflict?.reason && <p className="text-xs italic text-fg-muted">{item.conflict.reason}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => resolve("new")}>
          {t("memory.keepNew")}
        </Button>
        <Button size="sm" onClick={() => resolve("old")}>
          {t("memory.keepOld")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => resolve("both")}>
          {t("memory.keepBoth")}
        </Button>
      </div>
    </Card>
  );
}

function MemoryRow({ item, projectId, onChange }: { item: MemoryItem; projectId: string; onChange: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string>();
  const [talk, setTalk] = useState(false);
  const team = useTeamPeople().status?.configured;
  const save = async () => {
    if (draft?.trim()) await api.editMemory(item.id, draft.trim());
    setDraft(undefined);
    onChange();
  };
  if (draft !== undefined) {
    return (
      <li className="flex items-start gap-2 px-pad py-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          // biome-ignore lint/a11y/noAutofocus: editing starts where the user clicked
          autoFocus
          className="flex-1 resize-y rounded-md border border-border bg-bg p-2 text-[13px] outline-none focus:border-accent"
        />
        <Button size="sm" variant="primary" icon={Check} onClick={save} aria-label={t("project.save")} />
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => setDraft(undefined)}
          aria-label={t("memory.cancel")}
        />
      </li>
    );
  }
  return (
    <li data-nav-item tabIndex={-1} className="group px-pad py-2.5">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[13px] leading-relaxed">
          <TeamText text={item.text} authorId={item.authorId} />
          {item.author && <span className="ms-2 text-[11px] text-fg-subtle">— {item.author}</span>}
        </p>
        {item.sourceSession && (
          <Link
            to={`/p/${projectId}/s/${item.sourceSession}`}
            className="shrink-0 text-[11px] text-fg-subtle hover:text-accent"
          >
            {relativeTime(item.createdAt)}
          </Link>
        )}
        <span className="flex shrink-0 gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {team && (
            <button
              type="button"
              title={t("comments.title")}
              aria-label={t("comments.title")}
              aria-expanded={talk}
              onClick={() => setTalk((v) => !v)}
              className="text-fg-subtle hover:text-fg"
            >
              <MessageSquare size={13} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            title={t("memory.edit")}
            aria-label={t("memory.edit")}
            onClick={() => setDraft(item.text)}
            className="text-fg-subtle hover:text-fg"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title={t("memory.delete")}
            aria-label={t("memory.delete")}
            onClick={() =>
              deferDelete(`memory-${item.id}`, item.text.slice(0, 60), () => api.forget(item.id), onChange)
            }
            className="text-fg-subtle hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      {talk && (
        <div className="mt-2">
          <Comments projectId={projectId} kind="memory" id={item.id} />
        </div>
      )}
    </li>
  );
}

function AddFact({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<MemorySection>("decision");
  const [text, setText] = useState("");
  const add = async () => {
    if (!text.trim()) return;
    await api.addMemory(projectId, section, text.trim());
    setText("");
    onChange();
  };
  return (
    <Card className="flex flex-wrap items-center gap-2 p-2">
      <select
        value={section}
        onChange={(e) => setSection(e.target.value as MemorySection)}
        aria-label={t("memory.title")}
        className="h-8 rounded-md border border-border bg-bg-subtle px-2 text-[13px] outline-none"
      >
        {SECTIONS.map((s) => (
          <option key={s} value={s}>
            {t(`memory.${s}`)}
          </option>
        ))}
      </select>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={t("memory.addPlaceholder")}
        className="h-8 min-w-48 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-fg-subtle"
      />
      <Button size="sm" icon={Plus} onClick={add} disabled={!text.trim()}>
        {t("memory.add")}
      </Button>
    </Card>
  );
}

/**
 * Claude Code reads CLAUDE.md and Codex reads AGENTS.md: kept apart, a rule taught to one is unknown to
 * the other. Shows which rules only one of them has and joins them in one click (no model; a snapshot
 * is taken first, so it can be undone).
 */
function AgentFilesCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<AgentFiles>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .agentFiles(projectId)
      .then(setFiles)
      .catch(() => undefined);
  }, [projectId]);
  if (!files || files.state === "none" || files.state === "agentsOnly") return null;
  const join = () =>
    api
      .joinAgentFiles(projectId)
      .then(setFiles)
      .catch((err: Error) => setError(err.message));
  if (files.state === "joined")
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-success">
        <Check size={13} aria-hidden="true" />
        {t("agentFiles.joined")}
      </p>
    );
  const missing = [...files.onlyClaude.map((l) => ["CLAUDE.md", l]), ...files.onlyAgents.map((l) => ["AGENTS.md", l])];
  return (
    <Card className="space-y-2 p-pad text-[13px]">
      <p className="font-medium">{t("agentFiles.title")}</p>
      <p className="text-[12.5px] leading-relaxed text-fg-muted">
        {files.state === "claudeOnly" ? t("agentFiles.claudeOnly") : t("agentFiles.apart", { count: missing.length })}
      </p>
      {files.state === "apart" && missing.length > 0 && (
        <ul className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-[11.5px] text-fg-muted">
          {missing.slice(0, 20).map(([file, line]) => (
            <li key={`${file}${line}`} className="truncate">
              <span className="text-fg-subtle">{t("agentFiles.onlyIn", { file })}</span> {line}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={() => void join()} data-tip={t("agentFiles.joinTip")}>
          {t("agentFiles.join")}
        </Button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </Card>
  );
}

export function MemoryTab({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const [context, setContext] = useState<string>();
  const { isPending } = usePendingDeletes();
  const conflicts = project.memory.filter((m) => m.conflict);
  const active = project.memory.filter((m) => !m.conflict && !isPending(`memory-${m.id}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 max-w-2xl flex-1 text-[13px] leading-relaxed text-fg-muted">{t("memory.hint")}</p>
        {project.memory.some((m) => m.section === "decision") && <AdrExportButton projectId={project.id} />}
      </div>
      <AgentFilesCard projectId={project.id} />
      {conflicts.map((item) => (
        <ConflictCard key={item.id} item={item} onDone={onChange} />
      ))}
      <AddFact projectId={project.id} onChange={onChange} />
      {active.length === 0 ? (
        <Card>
          <EmptyState icon={Brain} title={t("memory.title")} body={t("memory.empty")} />
        </Card>
      ) : (
        SECTIONS.map((section) => {
          const items = active.filter((m) => m.section === section);
          if (items.length === 0) return null;
          return (
            <Card key={section}>
              <h3 className="border-b border-border px-pad py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t(`memory.${section}`)}
              </h3>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <MemoryRow key={item.id} item={item} projectId={project.id} onChange={onChange} />
                ))}
              </ul>
            </Card>
          );
        })
      )}
      <div>
        {/* Bordered and with an icon: as a bare ghost button it read as a plain line of text. */}
        <Button
          size="sm"
          icon={Eye}
          onClick={async () =>
            setContext(context !== undefined ? undefined : (await api.projectContext(project.id)).context)
          }
        >
          {t("memory.preview")}
        </Button>
        {context !== undefined && (
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-ui border border-border bg-bg-subtle p-pad font-mono text-xs">
            {context || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}
