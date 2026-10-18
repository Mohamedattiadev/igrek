import { HELP_TOPICS } from "@godeye/core";
import { BookOpen, CircleHelp, Compass } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { request } from "../lib/api";
import { startTour } from "../lib/tour";
import { Markdown } from "./Markdown";
import { Button, Dialog } from "./ui";

/**
 * The in-app guide (plan.md 13.6): every part of God Eye in a sentence with where it is,
 * searchable as you type; a question gets an answer from the guide (small model) with links.
 */
export function HelpGuide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; topics: string[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const shown = HELP_TOPICS.filter((topic) => {
    if (!words.length) return true;
    const text = `${t(`help.t_${topic.id}`)} ${t(`help.d_${topic.id}`)} ${topic.words}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });
  const ask = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setAnswer(
        await request<{ answer: string; topics: string[] }>("/api/help", {
          method: "POST",
          body: JSON.stringify({ question: q }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("help.button")}
        data-tip={t("help.button")}
        className="flex size-7 shrink-0 items-center justify-center rounded-ui text-fg-subtle hover:bg-bg-hover hover:text-fg"
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("help.title")} wide>
        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold">{t("help.title")}</h2>
            <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => go("/guide")}>
              {t("guide.title")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Compass}
              onClick={() => {
                setOpen(false);
                navigate("/");
                startTour();
              }}
            >
              {t("help.tour")}
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) void ask();
            }}
          >
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAnswer(undefined);
              }}
              placeholder={t("help.search")}
              aria-label={t("help.search")}
              className="h-9 min-w-0 flex-1 rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
            />
            <Button type="submit" variant="primary" disabled={busy || !q.trim()}>
              {busy ? t("help.asking") : t("help.ask")}
            </Button>
          </form>
          {error && <p className="text-xs text-danger">{error}</p>}
          {answer && (
            <div className="space-y-2 rounded-ui border border-accent/40 bg-accent-soft/30 p-3 text-[13px]">
              <Markdown text={answer.answer} className="prose-godeye" />
              <div className="flex flex-wrap gap-1">
                {answer.topics.map((id) => {
                  const topic = HELP_TOPICS.find((x) => x.id === id);
                  return topic ? (
                    <Button key={id} size="sm" variant="ghost" onClick={() => go(topic.path)}>
                      {t(`help.t_${id}`)}
                    </Button>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <ul className="max-h-[50vh] divide-y divide-border overflow-auto rounded-ui border border-border">
            {shown.map((topic) => (
              <li key={topic.id} className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{t(`help.t_${topic.id}`)}</p>
                  <p className="text-xs text-fg-muted">{t(`help.d_${topic.id}`)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => go(topic.path)}>
                  {t("help.go")}
                </Button>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-2 text-xs text-fg-subtle">{t("help.none")}</li>}
          </ul>
        </div>
      </Dialog>
    </>
  );
}
