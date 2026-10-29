import {
  type AiTool,
  coachPrompt,
  type EnhanceContextKind,
  type EnhanceResult,
  isWeakPrompt,
  renderEnhanced,
} from "@igrek/core";
import {
  BookmarkPlus,
  Brain,
  Check,
  CircleAlert,
  FileCode,
  GitBranch,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  MessagesSquare,
  PenLine,
  SquareTerminal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/settings";
import { Badge, Button, Dialog, field, ModelMark, useModelTip } from "./ui";

export interface EnhanceTarget {
  projectId?: string;
  sessionId?: string;
  tool?: AiTool;
  file?: { path: string; selection?: string; startLine?: number; endLine?: number };
  /** The chat's persona: its checklist shapes the "done when" items. */
  personaId?: string;
}

const CONTEXT_ICONS: Record<EnhanceContextKind, typeof Brain> = {
  log: SquareTerminal,
  memory: Brain,
  session: MessagesSquare,
  git: GitBranch,
  file: FileCode,
  error: CircleAlert,
  team: Users,
};

/** Shown under a weak prompt in "suggest" mode: a nudge, never a block. */
export function EnhanceHint({ text, onEnhance }: { text: string; onEnhance: () => void }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const modelTip = useModelTip();
  if (settings.enhanceMode === "off" || !isWeakPrompt(text)) return null;
  return (
    <button
      type="button"
      onClick={onEnhance}
      data-tip={modelTip(t("enhance.hintTip"))}
      className="inline-flex items-center gap-1 text-[11.5px] text-fg-subtle hover:text-fg"
    >
      <PenLine size={11} /> {t("enhance.hint")}
      <ModelMark />
    </button>
  );
}

export function EnhanceButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const modelTip = useModelTip();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("enhance.button")}
      data-tip={modelTip(t("enhance.buttonTip"))}
      data-tip-kbd="Ctrl ⇧ Enter"
      className="inline-flex items-center gap-0.5 rounded-md p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-accent disabled:opacity-40"
    >
      <PenLine size={15} />
      <ModelMark />
    </button>
  );
}

/**
 * Lazy prompt in, clear prompt out (plan.md Faz 4.5). Shows what context was
 * used (each piece can be switched off), asks when the request is too vague,
 * and lets the user send the enhanced text, edit it, or keep their own.
 */
export function EnhancePanel({
  text,
  target,
  onUse,
  onClose,
  onPlanMode,
}: {
  text: string;
  target: EnhanceTarget;
  onUse: (prompt: string) => void;
  onClose: () => void;
  onPlanMode?: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<EnhanceResult & { id: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [exclude, setExclude] = useState<EnhanceContextKind[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dropped, setDropped] = useState<number[]>([]);
  const [draft, setDraft] = useState<string>();
  /** The AI version is still being written (the instant template is shown meanwhile). */
  const [refining, setRefining] = useState(false);
  /** An AI version that arrived after the user started editing: offered, never forced. */
  const [pendingAi, setPendingAi] = useState<EnhanceResult & { id: string }>();
  const [saved, setSaved] = useState(false);
  const runId = useRef(0);
  const draftRef = useRef<string>(undefined);
  draftRef.current = draft;

  const run = (opts: { exclude?: EnhanceContextKind[]; answers?: Record<string, string>; template?: boolean } = {}) => {
    const id = ++runId.current;
    setBusy(true);
    setError(undefined);
    setDraft(undefined);
    setDropped([]);
    setPendingAi(undefined);
    setSaved(false);
    const body = {
      text,
      ...target,
      exclude: opts.exclude ?? exclude,
      answers: Object.entries(opts.answers ?? answers).map(([question, answer]) => ({ question, answer })),
    };
    // 1) Instant: the no-AI version from the project's facts.
    const fast = api.enhance({ ...body, template: true }).then((r) => {
      if (id !== runId.current) return;
      setResult(r);
      setBusy(false);
    });
    if (opts.template) {
      fast.catch((err: Error) => setError(err.message)).finally(() => setBusy(false));
      return;
    }
    // 2) Better: the small model's version replaces it unless the user is already editing.
    setRefining(true);
    api
      .enhance(body)
      .then((r) => {
        if (id !== runId.current || r.mode !== "ai") return;
        if (draftRef.current === undefined) setResult(r);
        else setPendingAi(r);
      })
      .catch(() => undefined)
      .finally(() => {
        if (id !== runId.current) return;
        setRefining(false);
        setBusy(false);
      });
    fast.catch(() => undefined);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for the text it was opened with
  useEffect(() => run(), []);

  const rendered = result?.parts ? renderEnhanced(result.parts, dropped) : "";
  const final = draft ?? rendered;
  const use = (choice: "enhanced" | "edited" | "original") => {
    const value = choice === "original" ? text : final;
    if (result) void api.enhanceUsed(result.id, choice, value, target.sessionId).catch(() => undefined);
    onUse(value);
  };
  const saveToLibrary = () =>
    void api
      .savePrompt({ title: (result?.expanded ?? text).slice(0, 70), body: final, tags: ["enhanced"] })
      .then(() => setSaved(true))
      .catch(() => undefined);

  return (
    <fieldset
      aria-label={t("enhance.title")}
      className="min-w-0 space-y-3 rounded-ui border border-accent/40 bg-bg p-3 shadow-ui"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && result?.parts) {
          e.preventDefault();
          use(draft !== undefined ? "edited" : "enhanced");
        }
      }}
    >
      <div className="flex items-center gap-2">
        <PenLine size={15} className="text-accent" />
        <h3 className="text-[13px] font-semibold">{t("enhance.title")}</h3>
        {refining ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
            data-tip={t("enhance.refiningTip")}
          >
            <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> {t("enhance.refining")}
          </span>
        ) : (
          result?.mode === "template" && (
            <span data-tip={t("enhance.templateTip")}>
              <Badge tone="warning">{t("enhance.template")}</Badge>
            </span>
          )
        )}
        {pendingAi && (
          <Button
            size="sm"
            variant="ghost"
            icon={PenLine}
            onClick={() => {
              setResult(pendingAi);
              setPendingAi(undefined);
              setDraft(undefined);
            }}
          >
            {t("enhance.useAi")}
          </Button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("enhance.close")}
          className="rounded-md p-1 text-fg-subtle hover:bg-bg-hover"
        >
          <X size={14} />
        </button>
      </div>

      {result && result.context.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-fg-subtle">{t("enhance.used")}</span>
          {result.context.map((item) => {
            const Icon = CONTEXT_ICONS[item.kind];
            return (
              <button
                key={item.kind}
                type="button"
                data-tip={t(`enhance.ctxTip_${item.kind}`)}
                onClick={() => {
                  const next = [...exclude, item.kind];
                  setExclude(next);
                  run({ exclude: next });
                }}
                className="group inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:border-danger hover:text-danger"
              >
                <Icon size={11} />
                {t(`enhance.ctx_${item.kind}`, { label: item.label })}
                <X size={10} className="opacity-40 group-hover:opacity-100" />
              </button>
            );
          })}
          {exclude.length > 0 && (
            <button
              type="button"
              className="text-[11px] text-accent hover:underline"
              onClick={() => {
                setExclude([]);
                run({ exclude: [] });
              }}
            >
              {t("enhance.restore")}
            </button>
          )}
        </div>
      )}

      {busy && (
        <div className="space-y-2 py-2" aria-live="polite">
          <p className="text-xs text-fg-muted">{t("enhance.working")}</p>
          <div className="h-1 overflow-hidden rounded-full bg-bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      {!busy && result?.questions && (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">{result.explanation ?? t("enhance.questionsIntro")}</p>
          {result.questions.map((q) => (
            <div key={q.question} className="space-y-1.5">
              <p className="text-[13px] font-medium">{q.question}</p>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers({ ...answers, [q.question]: option })}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      answers[q.question] === option
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border hover:border-accent",
                    )}
                  >
                    {option}
                  </button>
                ))}
                <input
                  placeholder={t("enhance.other")}
                  aria-label={t("enhance.other")}
                  value={q.options.includes(answers[q.question] ?? "") ? "" : (answers[q.question] ?? "")}
                  onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                  className="h-6 w-36 rounded-full border border-border bg-bg px-2.5 text-xs outline-none focus:border-accent"
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => run({ template: true })} data-tip={t("enhance.skipTip")}>
              {t("enhance.skip")}
            </Button>
            <Button
              usesModel
              size="sm"
              variant="primary"
              disabled={!result.questions.every((q) => answers[q.question]?.trim())}
              onClick={() => run()}
            >
              {t("enhance.continue")}
            </Button>
          </div>
        </div>
      )}

      {!busy && result?.parts && (
        <>
          {result.explanation && <p className="text-xs text-fg-muted">{result.explanation}</p>}
          {result.suggestPlan && (
            <div className="flex items-center gap-2 rounded-ui bg-warning-soft px-3 py-2 text-xs text-warning">
              <ListChecks size={14} />
              <span className="flex-1">{t("enhance.bigJob")}</span>
              {onPlanMode && (
                <Button size="sm" onClick={onPlanMode}>
                  {t("enhance.planMode")}
                </Button>
              )}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-fg-subtle">{t("enhance.yours")}</p>
              <p className="whitespace-pre-wrap rounded-ui bg-bg-subtle p-2 text-[13px] text-fg-muted">{text}</p>
            </div>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-[11px] font-medium text-fg-subtle">
                {t("enhance.better")}
                {draft !== undefined && <span className="text-accent">· {t("enhance.edited")}</span>}
              </p>
              <textarea
                value={final}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(16, Math.max(6, final.split("\n").length + 1))}
                aria-label={t("enhance.better")}
                className={cn(field, "h-auto w-full resize-y p-2 font-mono leading-relaxed py-1.5")}
              />
            </div>
          </div>
          {result.parts.assumptions.length > 0 && draft === undefined && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-fg-subtle" data-tip={t("enhance.assumptionsTip")}>
                {t("enhance.assumptions")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.parts.assumptions.map((a, i) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setDropped(dropped.includes(i) ? dropped.filter((d) => d !== i) : [...dropped, i])}
                    data-tip={dropped.includes(i) ? t("enhance.assumptionAdd") : t("enhance.assumptionDrop")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                      dropped.includes(i)
                        ? "border-border text-fg-subtle line-through"
                        : "border-warning/50 text-warning",
                    )}
                  >
                    {a} <X size={10} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {result.expanded && (
            <p className="text-[11px] text-fg-subtle" data-tip={t("enhance.expandedTip")}>
              {t("enhance.expanded", { text: result.expanded })}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={saved ? Check : BookmarkPlus}
              disabled={saved}
              onClick={saveToLibrary}
              data-tip={t("enhance.saveTip")}
            >
              {saved ? t("enhance.saved") : t("enhance.save")}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => use("original")} data-tip={t("enhance.sendOriginalTip")}>
              {t("enhance.sendOriginal")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={PenLine}
              onClick={() => use(draft !== undefined ? "edited" : "enhanced")}
              data-tip-kbd="Ctrl Enter"
            >
              {t("enhance.send")}
            </Button>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** For places without a text box of their own (terminals): write the lazy prompt here, get it back improved. */
export function EnhanceDialog({
  open,
  onClose,
  target,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  target: EnhanceTarget;
  onUse: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string>();
  const close = () => {
    setSubmitted(undefined);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} label={t("enhance.title")} wide>
      <div className="p-4">
        {submitted === undefined ? (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <PenLine size={15} className="text-accent" /> {t("enhance.title")}
            </h2>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                  e.preventDefault();
                  setSubmitted(text.trim());
                }
              }}
              rows={3}
              placeholder={t("enhance.dialogPlaceholder")}
              aria-label={t("enhance.dialogPlaceholder")}
              className={cn(field, "h-auto w-full resize-none p-2 py-1.5")}
            />
            <div className="flex justify-end">
              <Button
                usesModel
                variant="primary"
                icon={PenLine}
                disabled={!text.trim()}
                onClick={() => setSubmitted(text.trim())}
              >
                {t("enhance.button")}
              </Button>
            </div>
          </div>
        ) : (
          <EnhancePanel
            text={submitted}
            target={target}
            onClose={() => setSubmitted(undefined)}
            onUse={(prompt) => {
              onUse(prompt);
              setText("");
              close();
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

/** Prompt coach (plan.md 13.1): what to add for a better result, checked while typing, no AI. */
export function PromptCoach({ text }: { text: string }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [debounced, setDebounced] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 400);
    return () => clearTimeout(timer);
  }, [text]);
  if (settings.enhanceMode === "off") return null;
  const tips = coachPrompt(debounced);
  if (!tips.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
      <Lightbulb size={11} className="text-warning" aria-hidden="true" />
      {tips.map((tip) => (
        <span key={tip} data-tip={t(`coach.${tip}Tip`)} className="rounded-full border border-border px-2 py-0.5">
          {t(`coach.${tip}`)}
        </span>
      ))}
    </span>
  );
}
