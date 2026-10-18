import type { SessionListItem } from "@igrek/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "../../components/ui";
import { ActiveDot, HealthBadge, useSummaryText } from "../../components/work";
import { mainModel, modelName, relativeTime } from "../../lib/format";
import { PersonaIcon, useMyName, usePersonaLabel, usePersonas } from "../../lib/personas";

/** "Mohamed → Backend Senior persona" (plan.md 6.3). */
function PersonaChip({ personaId, author }: { personaId: string; author?: string }) {
  const { personas } = usePersonas();
  const me = useMyName();
  const persona = personas.find((p) => p.id === personaId);
  const name = usePersonaLabel()(persona, personaId).name;
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">
      <PersonaIcon persona={persona} size={10} className="size-3.5 bg-transparent" />
      {t("persona.ranAs", { who: author ?? me, name })}
    </span>
  );
}

export function SessionRow({ session, projectId }: { session: SessionListItem; projectId: string }) {
  const summary = useSummaryText(session.summary);
  const model = mainModel(session.models);
  return (
    <Link
      to={`/p/${projectId}/s/${session.id}`}
      data-nav-item
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
    >
      <ActiveDot active={session.active} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{session.summary?.title || session.title}</p>
        {(summary?.did[0] ?? session.title) !== (session.summary?.title || session.title) && (
          <p className="truncate text-xs text-fg-subtle">{summary?.did[0] ?? session.title}</p>
        )}
      </div>
      <span className="hidden shrink-0 sm:contents">
        {session.persona ? (
          <PersonaChip personaId={session.persona} author={session.author} />
        ) : (
          session.author && <Badge tone="accent">{session.author}</Badge>
        )}
      </span>
      {session.tool !== "claude" && <Badge>{session.tool}</Badge>}
      {model && <span className="hidden font-mono text-[11px] text-fg-subtle md:inline">{modelName(model)}</span>}
      <HealthBadge health={session.health} />
      <span className="shrink-0 text-end text-[11px] text-fg-subtle sm:w-24">{relativeTime(session.updatedAt)}</span>
    </Link>
  );
}
