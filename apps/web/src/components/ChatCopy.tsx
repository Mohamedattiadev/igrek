import type { ChatInfo } from "@igrek/core";
import { FileDiff, GitMerge, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { Button, Dialog } from "./ui";

/**
 * Auto mode works in its own copy of the repo (plan.md 0, sandbox). Nothing reaches your
 * folder until you look at the changes and merge them; you can also throw the copy away.
 */
export function ChatCopy({ info }: { info: ChatInfo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [diff, setDiff] = useState<{ files: { path: string; added: number; removed: number }[]; patch: string }>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const wt = info.worktree;
  if (!wt) return null;
  const merge = () => {
    if (!window.confirm(t("copy.mergeConfirm", { branch: wt.baseBranch ?? "HEAD" }))) return;
    setError(undefined);
    api
      .chatCopyMerge(info.id)
      .then(() => setDone(t("copy.merged", { branch: wt.baseBranch ?? "HEAD" })))
      .catch((err: Error) => setError(err.message));
  };
  const discard = () => {
    if (!window.confirm(t("copy.discardConfirm"))) return;
    void api.chatCopyDiscard(info.id).then(() => navigate(`/p/${info.projectId}`));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-4 py-1.5 text-xs">
      <ShieldCheck size={13} className="text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-fg-muted">
        {t("copy.banner", { branch: wt.branch, base: wt.baseBranch ?? wt.base.slice(0, 7) })}{" "}
        {info.sandboxed ? t("copy.sandboxOn") : t("copy.sandboxOff")}
      </span>
      {done && <span className="text-success">{done}</span>}
      {error && <span className="text-danger">{error}</span>}
      <Button size="sm" variant="ghost" icon={FileDiff} onClick={() => void api.chatCopy(info.id).then(setDiff)}>
        {t("copy.changes")}
      </Button>
      <Button size="sm" icon={GitMerge} onClick={merge} data-tip={t("copy.mergeTip")}>
        {t("copy.merge")}
      </Button>
      <Button size="sm" variant="ghost" icon={Trash2} onClick={discard} aria-label={t("copy.discard")} />
      <Dialog open={!!diff} onClose={() => setDiff(undefined)} label={t("copy.changes")} wide>
        {diff && (
          <div className="flex max-h-[80vh] flex-col gap-3 p-5">
            <h2 className="text-[14px] font-semibold">{t("copy.changesTitle", { count: diff.files.length })}</h2>
            <ul className="space-y-0.5 font-mono text-[12px]">
              {diff.files.map((f) => (
                <li key={f.path} className="flex gap-3">
                  <span className="text-success">+{f.added}</span>
                  <span className="text-danger">-{f.removed}</span>
                  <span className="min-w-0 truncate">{f.path}</span>
                </li>
              ))}
            </ul>
            <pre className="min-h-0 flex-1 overflow-auto rounded-ui border border-border bg-bg-subtle p-3 font-mono text-[11.5px] leading-relaxed">
              {diff.patch.split("\n").map((line, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed patch
                  key={i}
                  className={cn(
                    "block",
                    line.startsWith("+") && !line.startsWith("+++") && "text-success",
                    line.startsWith("-") && !line.startsWith("---") && "text-danger",
                    line.startsWith("@@") && "text-accent",
                  )}
                >
                  {line || " "}
                </span>
              ))}
            </pre>
          </div>
        )}
      </Dialog>
    </div>
  );
}
