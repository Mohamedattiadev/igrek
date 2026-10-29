import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useBackgroundTasks } from "../lib/background";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { Count, usePopover } from "./ui";

/**
 * What is working in the background, in the top bar: a turning mark while something runs, a count
 * of what finished and was not seen yet, and the list of both, each a link back to its page.
 */
export function BackgroundChip() {
  const { t } = useTranslation();
  const tasks = useBackgroundTasks();
  const [open, setOpen, ref] = usePopover();
  const running = tasks.filter((x) => x.status === "running");
  const fresh = tasks.filter((x) => x.status !== "running" && !x.seen);
  if (!tasks.length) return null;
  const label = running.length ? t("background.running", { count: running.length }) : t("background.title");
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        data-tip={label}
        className="flex h-7 items-center gap-1 rounded-ui px-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        {running.length ? (
          <Loader2 size={15} className="animate-spin text-accent" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={15} className="text-success" aria-hidden="true" />
        )}
        {(running.length > 0 || fresh.length > 0) && (
          <Count n={running.length || fresh.length} tone={running.length ? "accent" : "warning"} />
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-80 rounded-ui border border-border bg-bg p-1 shadow-ui">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("background.title")}
          </p>
          <ul>
            {tasks.map((x) => (
              <li key={x.key}>
                <Link
                  to={x.path}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-bg-hover",
                    x.status !== "running" && x.seen && "text-fg-muted",
                  )}
                >
                  {x.status === "running" ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
                  ) : x.status === "done" ? (
                    <CheckCircle2 size={13} className="shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <XCircle size={13} className="shrink-0 text-danger" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">
                    {x.status === "running"
                      ? t("background.since", { when: relativeTime(x.startedAt) })
                      : t(`background.${x.status}`, { when: relativeTime(x.finishedAt ?? x.startedAt) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
