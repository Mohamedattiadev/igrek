import { FileClock, Moon, ScrollText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { docsApi } from "../lib/ops-api";
import { Markdown } from "./Markdown";
import { Button, CopyButton, Dialog } from "./ui";

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Release notes from commits, sessions and merged team runs (plan.md 13.2). */
export function ReleaseNotesButton({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ markdown: string; since: string; commits: number }>();
  const [error, setError] = useState<string>();
  const run = async () => {
    setOpen(true);
    setResult(undefined);
    setError(undefined);
    try {
      setResult(await post(`/api/projects/${projectId}/release-notes`, { language: i18n.language }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={FileClock} onClick={() => void run()} data-tip={t("writeups.notesTip")}>
        {t("writeups.notes")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("writeups.notes")} wide>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("writeups.notes")}</h2>
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : !result ? (
            <p className="text-[13px] text-fg-muted">{t("writeups.writing")}</p>
          ) : (
            <>
              <p className="text-xs text-fg-muted">
                {t("writeups.since", { since: result.since, count: result.commits })}
              </p>
              <div className="max-h-[60vh] overflow-auto rounded-ui border border-border p-3">
                <Markdown text={result.markdown} className="prose-godeye" />
              </div>
              <div className="flex justify-end gap-2">
                <CopyButton text={result.markdown} />
                <Button
                  variant="primary"
                  onClick={async () => {
                    await docsApi.savePage(projectId, {
                      title: t("writeups.notesTitle", { date: new Date().toISOString().slice(0, 10) }),
                      body: result.markdown,
                    });
                    setOpen(false);
                    onSaved();
                  }}
                >
                  {t("writeups.toWiki")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

interface Adr {
  number: number;
  title: string;
  date: string;
  context: string;
  decision: string;
  consequences: string;
}

/** The decisions in memory as ADRs (plan.md 13.2): download as docs/adr, or put in the wiki. */
export function AdrExportButton({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [adrs, setAdrs] = useState<Adr[]>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const run = async () => {
    setOpen(true);
    setAdrs(undefined);
    setError(undefined);
    setNote(undefined);
    try {
      setAdrs(await post<Adr[]>(`/api/projects/${projectId}/adrs`, { language: i18n.language }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const download = async () => {
    const res = await fetch(`/api/projects/${projectId}/adrs/zip`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(adrs),
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = "adr.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const markdown = (list: Adr[]) =>
    list
      .map(
        (a) =>
          `## ${a.number}. ${a.title}\n\n*${a.date}*\n\n**${t("writeups.context")}:** ${a.context}\n\n**${t("writeups.decision")}:** ${a.decision}\n\n**${t("writeups.consequences")}:** ${a.consequences}`,
      )
      .join("\n\n");
  return (
    <>
      <Button size="sm" variant="ghost" icon={ScrollText} onClick={() => void run()} data-tip={t("writeups.adrTip")}>
        {t("writeups.adr")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("writeups.adr")} wide>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("writeups.adr")}</h2>
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : !adrs ? (
            <p className="text-[13px] text-fg-muted">{t("writeups.writing")}</p>
          ) : (
            <>
              <div className="max-h-[60vh] overflow-auto rounded-ui border border-border p-3">
                <Markdown text={markdown(adrs)} className="prose-godeye" />
              </div>
              {note && <p className="text-xs text-success">{note}</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => void download()}>{t("writeups.zip")}</Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    await docsApi.savePage(projectId, { title: t("writeups.adrTitle"), body: markdown(adrs) });
                    setNote(t("writeups.savedWiki"));
                  }}
                >
                  {t("writeups.toWiki")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** End-of-day note (plan.md 13.2): today, tomorrow, stuck; shared with the team if you want. */
export function DayEndButton() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const run = async () => {
    setOpen(true);
    setText(undefined);
    setError(undefined);
    setNote(undefined);
    try {
      setText((await post<{ text: string }>("/api/dayend", { language: i18n.language })).text);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={Moon} onClick={() => void run()} data-tip={t("writeups.dayTip")}>
        {t("writeups.day")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("writeups.day")} wide>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("writeups.day")}</h2>
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : text === undefined ? (
            <p className="text-[13px] text-fg-muted">{t("writeups.writing")}</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                aria-label={t("writeups.day")}
                className="w-full rounded-ui border border-border bg-bg p-3 text-[13px] outline-none focus:border-accent"
              />
              {note && <p className="text-xs text-fg-muted">{note}</p>}
              <div className="flex justify-end gap-2">
                <CopyButton text={text} />
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      const r = await post<{ sent: number }>("/api/dayend/share", { text });
                      setNote(t("writeups.shared", { count: r.sent }));
                    } catch (err) {
                      setNote((err as Error).message);
                    }
                  }}
                >
                  {t("writeups.share")}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
