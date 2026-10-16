import type { TerminalInfo } from "@godeye/core";
import { ArrowLeft, SquareTerminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { PromptPicker } from "../components/PromptPicker";
import { TerminalView } from "../components/TerminalView";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useTerminals } from "../lib/live";

const TONE = { running: "success", idle: "neutral", attention: "warning", exited: "neutral" } as const;

export function TerminalStatus({ term }: { term: TerminalInfo }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot tone={TONE[term.status]} pulse={term.status === "running" || term.status === "attention"} />
      <span className={cn("text-[11px]", term.status === "attention" ? "font-medium text-warning" : "text-fg-subtle")}>
        {t(`term.${term.status}`)}
      </span>
    </span>
  );
}

/** JetBrains-style tab strip across all open terminals. */
function Tabs({ terminals, active }: { terminals: TerminalInfo[]; active?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-bg-subtle">
      {terminals.map((term) => (
        <div
          key={term.id}
          className={cn(
            "group flex max-w-60 shrink-0 items-center gap-2 border-e border-border px-3 text-[12px]",
            term.id === active
              ? "bg-bg text-fg shadow-[inset_0_-2px_0_var(--accent)]"
              : "text-fg-muted hover:bg-bg-hover",
          )}
        >
          <Link to={`/t/${term.id}`} className="flex min-w-0 items-center gap-2">
            <StatusDot tone={TONE[term.status]} pulse={term.status === "attention"} />
            <span className="truncate">{term.title}</span>
          </Link>
          <button
            type="button"
            aria-label="Close"
            onClick={async () => {
              await api.closeTerminal(term.id);
              if (term.id === active && term.status === "exited") navigate("/terminals");
            }}
            className="text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function TerminalsPage() {
  const { t } = useTranslation();
  const terminals = useTerminals();
  return (
    <>
      <PageHeader title={t("term.title")} />
      {terminals.length === 0 ? (
        <EmptyState icon={SquareTerminal} title={t("term.empty")} body={t("term.emptyBody")} />
      ) : (
        <div className="p-6">
          <Card>
            <div className="divide-y divide-border">
              {terminals.map((term) => (
                <Link
                  key={term.id}
                  to={`/t/${term.id}`}
                  data-nav-item
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                >
                  <SquareTerminal size={15} className="text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{term.title}</p>
                    <p className="truncate font-mono text-[11px] text-fg-subtle">{term.cwd}</p>
                  </div>
                  <Badge>{t(`term.${term.tool}`)}</Badge>
                  <TerminalStatus term={term} />
                  <span className="w-24 text-end text-[11px] text-fg-subtle">{relativeTime(term.startedAt)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function TerminalPage() {
  const { t } = useTranslation();
  const { termId = "" } = useParams();
  const terminals = useTerminals();
  const term = terminals.find((x) => x.id === termId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs terminals={terminals} active={termId} />
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <Link
          to={
            !term
              ? "/terminals"
              : term.projectId.startsWith("server:")
                ? `/servers/${term.projectId.slice(7)}`
                : `/p/${term.projectId}`
          }
          className="text-fg-subtle hover:text-fg"
          aria-label={t("term.project")}
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{term?.title ?? "…"}</h1>
        {term && term.status !== "exited" && <PromptPicker onUse={(text) => api.terminalInput(term.id, text)} />}
        {term && <Badge>{t(`term.${term.tool}`)}</Badge>}
        {term && <TerminalStatus term={term} />}
      </header>
      <div className="min-h-0 flex-1">{termId && <TerminalView key={termId} id={termId} />}</div>
    </div>
  );
}
