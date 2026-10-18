import {
  CATEGORIES,
  type Category,
  type LibraryItem,
  type Persona,
  type PersonaGroup,
  type PersonaModel,
  type PersonaOpinion,
} from "@igrek/core";
import { ArrowLeft, MessageSquare, Pencil, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, Dialog, PageHeader, Section } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useProjects, useServerEvent } from "../lib/live";
import { PERSONA_ICONS, PersonaIcon, startPersonaChat, usePersonaLabel, usePersonas } from "../lib/personas";

const GROUPS: PersonaGroup[] = ["engineering", "leadership", "research", "testing"];
const MODELS: PersonaModel[] = ["opus", "sonnet", "haiku"];
const CONFIDENCE_TONE = { high: "success", medium: "warning", low: "danger" } as const;

// ---- plain-text forms of the profile lists (one item per line) ---------------------

const SEP = " — ";
const toLines = (items: string[]) => items.join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const timelineText = (p: Persona) => p.profile.timeline.map((m) => `${m.year}${SEP}${m.event}`).join("\n");
const parseTimeline = (text: string) =>
  fromLines(text).map((line) => {
    const [year, ...rest] = line.split(/\s+[—-]\s+/);
    return { year: (year ?? "").trim(), event: rest.join(SEP).trim() };
  });
const readingText = (p: Persona) =>
  p.profile.reading.map((r) => `${r.title}${SEP}${r.author}${r.year ? ` (${r.year})` : ""}`).join("\n");
const parseReading = (text: string) =>
  fromLines(text).map((line) => {
    const [title, ...rest] = line.split(/\s+[—-]\s+/);
    const tail = rest.join(SEP);
    const year = tail.match(/\((\d{3,4})\)\s*$/)?.[1];
    return {
      title: (title ?? "").trim(),
      author: tail.replace(/\(\d{3,4}\)\s*$/, "").trim(),
      ...(year ? { year: Number(year) } : {}),
    };
  });

function ConfidenceBadge({ value }: { value: PersonaOpinion["confidence"] }) {
  const { t } = useTranslation();
  return <Badge tone={CONFIDENCE_TONE[value]}>{t(`persona.confidence_${value}`)}</Badge>;
}

export { ConfidenceBadge };

/** "Görüşlerim": what the persona wrote down, and how it changed its mind. */
function Notebook({ personaId }: { personaId: string }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [history, setHistory] = useState(false);
  const [opinions, setOpinions] = useState<PersonaOpinion[]>([]);
  const load = () => {
    api
      .personaOpinions(personaId, projectId || undefined, history)
      .then(setOpinions)
      .catch(() => undefined);
  };
  useEffect(load, [personaId, projectId, history]);
  useServerEvent("personas-changed", load);
  const byId = new Map(opinions.map((o) => [o.id, o]));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("meeting.project")}
          className="h-7 rounded-md border border-border bg-bg px-1.5 text-[12px]"
        >
          <option value="">{t("persona.generalOnly")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          {t("persona.showHistory")}
        </label>
      </div>
      {opinions.length === 0 ? (
        <p className="text-xs text-fg-muted">{t("persona.notebookEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {opinions.map((o) => (
            <li
              key={o.id}
              className={`group rounded-ui border border-border p-2.5 ${o.replacedBy ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[13px] font-medium">{o.claim}</p>
                <ConfidenceBadge value={o.confidence} />
                <button
                  type="button"
                  aria-label={t("memory.delete")}
                  onClick={() => void api.deleteOpinion(o.id).then(load)}
                  className="p-0.5 text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
              {o.reasoning && <p className="mt-1 text-xs text-fg-muted">{o.reasoning}</p>}
              <p className="mt-1 text-[11px] text-fg-subtle">
                {t("persona.evidence")}: {o.evidence || t("persona.noEvidence")} · {relativeTime(o.createdAt)}
                {o.projectId ? "" : ` · ${t("persona.general")}`}
              </p>
              {o.changedBecause && (
                <p className="mt-1 text-[11px] text-accent">
                  {t("persona.changedBecause", {
                    old: byId.get(o.replaces ?? "")?.claim ?? t("persona.earlier"),
                    why: o.changedBecause,
                  })}
                </p>
              )}
              {o.replacedBy && <p className="mt-1 text-[11px] text-fg-subtle">{t("persona.replaced")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pick a project for a one-to-one chat; `draft` waits in the message box. */
export function PersonaChatDialog({
  personaId,
  open,
  onClose,
  draft,
  first = [],
}: {
  personaId: string;
  open: boolean;
  onClose: () => void;
  draft?: string;
  /** Projects to list first (e.g. the ones deployed to this server). */
  first?: string[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects();
  const { personas } = usePersonas();
  const [error, setError] = useState<string>();
  const label = usePersonaLabel()(
    personas.find((p) => p.id === personaId),
    personaId,
  );
  const sorted = [...projects].sort((a, b) => Number(first.includes(b.id)) - Number(first.includes(a.id)));
  return (
    <Dialog open={open} onClose={onClose} label={t("persona.chat")}>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">{t("persona.chatWith", { name: label.name })}</h2>
        <p className="text-xs text-fg-muted">{t("persona.chatPick")}</p>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() =>
                  startPersonaChat(personaId, p.id, navigate, draft).catch((e: Error) => setError(e.message))
                }
                className="flex h-8 w-full items-center rounded-md px-2 text-start text-[13px] hover:bg-bg-hover"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="block space-y-1">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

/** Editor for every part of a persona; built-ins keep their id and name. */
function Editor({
  initial,
  isNew,
  onSaved,
  onCancel,
}: {
  initial: Persona;
  isNew: boolean;
  onSaved: (p: Persona) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [p, setP] = useState(initial);
  const [timeline, setTimeline] = useState(timelineText(initial));
  const [reading, setReading] = useState(readingText(initial));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const profile = (patch: Partial<Persona["profile"]>) => setP({ ...p, profile: { ...p.profile, ...patch } });
  const save = async () => {
    setBusy(true);
    setError(undefined);
    const body = { ...p, profile: { ...p.profile, timeline: parseTimeline(timeline), reading: parseReading(reading) } };
    try {
      onSaved(isNew ? await api.createPersona(body) : await api.updatePersona(p.id, body));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleCategory = (c: Category) =>
    setP({ ...p, categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c] });

  return (
    <Card className="space-y-4 p-pad">
      {!p.builtin && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("persona.f_name")}>
            <input value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} className={input} />
          </Field>
          <Field label={t("persona.f_role")}>
            <input value={p.role ?? ""} onChange={(e) => setP({ ...p, role: e.target.value })} className={input} />
          </Field>
          <Field label={t("persona.f_id")} hint={t("persona.f_idHint")}>
            <input
              value={p.id}
              disabled={!isNew}
              onChange={(e) => setP({ ...p, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              className={`${input} font-mono`}
            />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t("persona.f_model")}>
          <select
            value={p.model}
            onChange={(e) => setP({ ...p, model: e.target.value as PersonaModel })}
            className={input}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("persona.f_tools")}>
          <select
            value={p.tools}
            onChange={(e) => setP({ ...p, tools: e.target.value as Persona["tools"] })}
            className={input}
          >
            <option value="read">{t("persona.tools_read")}</option>
            <option value="edit">{t("persona.tools_edit")}</option>
          </select>
        </Field>
        <Field label={t("persona.f_maxTurns")}>
          <input
            type="number"
            min={1}
            max={200}
            value={p.maxTurns}
            onChange={(e) => setP({ ...p, maxTurns: Number(e.target.value) })}
            className={input}
          />
        </Field>
        <Field label={t("persona.f_group")}>
          <select
            value={p.group}
            onChange={(e) => setP({ ...p, group: e.target.value as PersonaGroup })}
            className={input}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`persona.group_${g}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={p.web} onChange={(e) => setP({ ...p, web: e.target.checked })} />
        {t("persona.f_web")}
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-fg-muted">{t("persona.f_categories")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={p.categories.includes(c)}
                onChange={() => toggleCategory(c)}
              />
              {t(`insight.cat.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-fg-muted">{t("persona.f_icon")}</legend>
        <div className="flex flex-wrap gap-1">
          {Object.keys(PERSONA_ICONS).map((name) => {
            const Icon = PERSONA_ICONS[name] as (typeof PERSONA_ICONS)[string];
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={p.icon === name}
                onClick={() => setP({ ...p, icon: name })}
                className={`rounded-md p-1.5 ${p.icon === name ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover"}`}
              >
                <Icon size={15} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-[11px] text-fg-subtle">{t("persona.englishNote")}</p>
      <Field label={t("persona.s_bio")}>
        <textarea value={p.profile.bio} onChange={(e) => profile({ bio: e.target.value })} rows={3} className={input} />
      </Field>
      <Field label={t("persona.s_style")}>
        <textarea
          value={p.profile.style}
          onChange={(e) => profile({ style: e.target.value })}
          rows={2}
          className={input}
        />
      </Field>
      <Field label={t("persona.s_timeline")} hint={t("persona.timelineHint")}>
        <textarea
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
          rows={6}
          className={`${input} font-mono text-[12px]`}
        />
      </Field>
      <Field label={t("persona.s_reading")} hint={t("persona.readingHint")}>
        <textarea
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          rows={5}
          className={`${input} font-mono text-[12px]`}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("persona.s_checklist")} hint={t("persona.lineHint")}>
          <textarea
            value={toLines(p.profile.checklist)}
            onChange={(e) => profile({ checklist: e.target.value.split("\n") })}
            rows={6}
            className={input}
          />
        </Field>
        <Field label={t("persona.s_pitfalls")} hint={t("persona.lineHint")}>
          <textarea
            value={toLines(p.profile.pitfalls)}
            onChange={(e) => profile({ pitfalls: e.target.value.split("\n") })}
            rows={6}
            className={input}
          />
        </Field>
      </div>
      <Field label={t("persona.s_rules")} hint={t("persona.rulesHint")}>
        <textarea
          value={toLines(p.profile.rules)}
          onChange={(e) => profile({ rules: e.target.value.split("\n") })}
          rows={3}
          className={input}
        />
      </Field>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("persona.cancel")}
        </Button>
        <Button variant="primary" icon={Save} onClick={() => void save()} disabled={busy}>
          {t("persona.save")}
        </Button>
      </div>
    </Card>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 ps-5 text-[13px] leading-relaxed">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Loose title match: "Accelerate" matches "Accelerate: The Science of Lean Software". */
function sameBook(have: string, want: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const a = norm(have);
  const b = norm(want);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

function Profile({ persona }: { persona: Persona }) {
  const { t } = useTranslation();
  const p = persona.profile;
  const [shelf, setShelf] = useState<LibraryItem[]>([]);
  useEffect(() => {
    api
      .library(persona.id)
      .then(setShelf)
      .catch(() => undefined);
  }, [persona.id]);
  const [prompt, setPrompt] = useState<string>();
  return (
    <div>
      <Section title={t("persona.s_bio")}>
        <p className="text-[13px] leading-relaxed">{p.bio}</p>
        {p.style && <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{p.style}</p>}
      </Section>
      <Section title={t("persona.s_settings")}>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{t("persona.modelIs", { model: persona.model })}</Badge>
          <Badge tone={persona.tools === "read" ? "accent" : "neutral"}>{t(`persona.tools_${persona.tools}`)}</Badge>
          {persona.web && <Badge>{t("persona.web")}</Badge>}
          <Badge>{t("persona.turns", { n: persona.maxTurns })}</Badge>
          {persona.categories.map((c) => (
            <Badge key={c} tone="accent">
              {t(`insight.cat.${c}`)}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle">{t("persona.safetyNote")}</p>
      </Section>
      {p.timeline.length > 0 && (
        <Section title={t("persona.s_timeline")}>
          <ol className="space-y-1 border-s border-border ps-4 text-[13px]">
            {p.timeline.map((m) => (
              <li key={`${m.year}-${m.event}`} className="relative">
                <span
                  className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-border-strong"
                  aria-hidden="true"
                />
                <span className="me-2 font-mono text-[12px] text-fg-subtle">{m.year}</span>
                {m.event}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {p.reading.length > 0 && (
        <Section title={t("persona.s_reading")} hint={t("persona.readingLibrary")}>
          <ul className="space-y-1 text-[13px]">
            {p.reading.map((r) => {
              const have = shelf.some((item) => sameBook(item.title, r.title));
              return (
                <li key={r.title} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-fg-muted">
                    · {r.author}
                    {r.year ? ` (${r.year})` : ""}
                  </span>
                  {have ? (
                    <Badge tone="success">{t("persona.inLibrary")}</Badge>
                  ) : (
                    <Link
                      to={`/library?${new URLSearchParams({ persona: persona.id, title: r.title })}`}
                      className="text-[11px] text-accent hover:underline"
                    >
                      {t("persona.addBook")}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {p.checklist.length > 0 && (
        <Section title={t("persona.s_checklist")}>
          <List items={p.checklist} />
        </Section>
      )}
      {p.pitfalls.length > 0 && (
        <Section title={t("persona.s_pitfalls")}>
          <List items={p.pitfalls} />
        </Section>
      )}
      <Section title={t("persona.s_rules")} hint={t("persona.rulesAll")}>
        {p.rules.length > 0 ? (
          <List items={p.rules} />
        ) : (
          <p className="text-xs text-fg-muted">{t("persona.noOwnRules")}</p>
        )}
        <div className="mt-3">
          {prompt === undefined ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void api
                  .personaPrompt(persona.id)
                  .then((r) => setPrompt(r.prompt))
                  .catch(() => undefined)
              }
            >
              {t("persona.showPrompt")}
            </Button>
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-ui bg-bg-muted p-3 font-mono text-[11.5px]">
              {prompt}
            </pre>
          )}
        </div>
      </Section>
      <Section title={t("persona.s_notebook")} hint={t("persona.notebookHint")}>
        <Notebook personaId={persona.id} />
      </Section>
    </div>
  );
}

const BLANK: Persona = {
  id: "",
  builtin: false,
  group: "engineering",
  icon: "UserRound",
  name: "",
  role: "",
  model: "sonnet",
  tools: "read",
  web: false,
  maxTurns: 30,
  categories: [],
  profile: { bio: "", style: "", timeline: [], reading: [], checklist: [], pitfalls: [], rules: [] },
};

/** "Describe it in a sentence" → the AI drafts a persona → you edit it (plan.md 6.2). */
export function NewPersonaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Persona>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const make = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setDraft(await api.draftPersona(description));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t("persona.new")} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <Link to="/personas" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" /> {t("persona.title")}
        </Link>
        {!draft ? (
          <Card className="space-y-3 p-pad">
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold">{t("persona.wizardTitle")}</span>
              <span className="block text-xs text-fg-muted">{t("persona.wizardBody")}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t("persona.wizardHint")}
                className={input}
              />
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft({ ...BLANK })}>
                {t("persona.blank")}
              </Button>
              <Button
                variant="primary"
                icon={Sparkles}
                onClick={() => void make()}
                disabled={busy || description.trim().length < 8}
              >
                {busy ? t("persona.drafting") : t("persona.draft")}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <p className="text-xs text-fg-muted">{t("persona.draftCheck")}</p>
            <Editor
              initial={draft}
              isNew
              onSaved={(p) => navigate(`/personas/${p.id}`, { replace: true })}
              onCancel={() => setDraft(undefined)}
            />
          </>
        )}
      </div>
    </>
  );
}

export function PersonaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { personaId = "" } = useParams();
  const { personas, loaded, reload } = usePersonas();
  const persona = personas.find((p) => p.id === personaId);
  const label = usePersonaLabel()(persona, personaId);
  const [editing, setEditing] = useState(false);
  const [chatting, setChatting] = useState(false);
  if (!persona)
    return (
      <>
        <PageHeader title={t("persona.title")} />
        <p className="p-6 text-[13px] text-fg-muted">{loaded ? t("errors.notFound") : t("persona.loading")}</p>
      </>
    );
  const remove = async () => {
    await api.removePersona(persona.id);
    reload();
    if (!persona.builtin) void navigate("/personas", { replace: true });
  };
  return (
    <>
      <PageHeader
        title={label.name}
        actions={
          <div className="flex gap-1">
            {(persona.edited || !persona.builtin) && (
              <Button
                size="sm"
                variant="ghost"
                icon={persona.builtin ? RotateCcw : Trash2}
                onClick={() => void remove()}
              >
                {persona.builtin ? t("persona.reset") : t("persona.delete")}
              </Button>
            )}
            {!editing && (
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                {t("persona.edit")}
              </Button>
            )}
            <Button size="sm" variant="primary" icon={MessageSquare} onClick={() => setChatting(true)}>
              {t("persona.chat")}
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <Link to="/personas" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" /> {t("persona.title")}
        </Link>
        <div className="flex items-center gap-3">
          <PersonaIcon persona={persona} size={20} />
          <div>
            <h2 className="text-[16px] font-semibold">{label.name}</h2>
            <p className="text-[13px] text-fg-muted">{label.role}</p>
          </div>
        </div>
        {editing ? (
          <Editor
            initial={persona}
            isNew={false}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Profile persona={persona} />
        )}
      </div>
      <PersonaChatDialog personaId={persona.id} open={chatting} onClose={() => setChatting(false)} />
    </>
  );
}
