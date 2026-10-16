import type { SessionListItem } from "@godeye/core";
import { Link } from "react-router";
import { Badge } from "../../components/ui";
import { ActiveDot, HealthBadge, useSummaryText } from "../../components/work";
import { mainModel, modelName, relativeTime } from "../../lib/format";

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
        <p className="truncate text-xs text-fg-subtle">{summary?.did[0] ?? session.title}</p>
      </div>
      {session.author && <Badge tone="accent">{session.author}</Badge>}
      {session.tool !== "claude" && <Badge>{session.tool}</Badge>}
      {model && <span className="hidden font-mono text-[11px] text-fg-subtle md:inline">{modelName(model)}</span>}
      <HealthBadge health={session.health} />
      <span className="w-24 shrink-0 text-end text-[11px] text-fg-subtle">{relativeTime(session.updatedAt)}</span>
    </Link>
  );
}
