import { Hand } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "../components/ui";
import type { MemberClient } from "./client";
import type { MemberProject, MemberTask } from "./model";

export const field =
  "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";

function Claim({
  client,
  task,
  onTake,
}: {
  client: MemberClient;
  task: MemberTask;
  onTake: (task: MemberTask, yes: boolean) => void;
}) {
  const { t } = useTranslation();
  const me = client.me();
  if (task.claimedBy)
    return (
      <p className="flex items-center gap-1.5 rounded-ui bg-bg-subtle px-1.5 py-1 text-[12px]">
        <span className="flex size-5 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold">
          {task.claimedBy.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 truncate">
          <span className="font-semibold">{task.claimedBy.id === me?.id ? t("board.you") : task.claimedBy.name}</span>{" "}
          <span className="text-fg-muted">{t("board.onIt")}</span>
        </span>
        {me && task.claimedBy.id === me.id && (
          <button
            type="button"
            onClick={() => onTake(task, false)}
            className="ms-auto text-[11px] text-fg-subtle hover:text-fg"
          >
            {t("board.release")}
          </button>
        )}
      </p>
    );
  if (!me || me.role === "viewer") return null;
  return (
    <button
      type="button"
      onClick={() => onTake(task, true)}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-ui border border-accent bg-accent-soft py-1 text-[12px] font-medium text-accent hover:bg-accent hover:text-white"
    >
      <Hand size={13} aria-hidden="true" /> {t("board.take")}
    </button>
  );
}

/** The project's board in the browser: the four columns, a new card, and "I'm taking this". */
export function BoardView({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState("");
  const me = client.me();
  const tasks = [...project.tasks.values()].filter((x) => !x.deleted);
  const take = (task: MemberTask, yes: boolean) =>
    void client.claim(project.key, task.id, yes).catch((e: Error) => setError(e.message));
  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {me && me.role !== "viewer" && (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void client.addTask(project.key, title).then(() => setTitle(""));
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("member.newCard")}
            aria-label={t("member.newCard")}
            className={field}
          />
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {t("member.add")}
          </Button>
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        {(["todo", "doing", "review", "done"] as const).map((col) => (
          <section key={col} className="space-y-2 rounded-ui border border-border bg-bg-subtle p-2">
            <h3 className="text-[11.5px] font-semibold uppercase text-fg-muted">{t(`board.col_${col}`)}</h3>
            {tasks
              .filter((x) => x.status === col)
              .map((task) => (
                <Card key={task.id} className="space-y-2 p-2.5">
                  <p className="text-[13px] font-medium">{task.title}</p>
                  <Claim client={client} task={task} onTake={take} />
                  {task.assignee && (
                    <p className="text-[11px] text-fg-muted">
                      <Badge>{task.assignee.name}</Badge>
                    </p>
                  )}
                </Card>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
