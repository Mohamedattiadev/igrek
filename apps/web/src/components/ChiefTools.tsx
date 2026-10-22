import type { TelegramStatus } from "@igrek/core";
import { BookOpen, ExternalLink, Send, Smartphone, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { Button, Dialog, field } from "./ui";

/** Above the chief's chat: its notebook (what it remembers) and the Telegram bot that reaches it. */
export function ChiefTools() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<"notes" | "phone">();
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="min-w-0 flex-1 text-fg-muted">{t("chief.intro")}</span>
      <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => setOpen("notes")}>
        {t("chief.notes")}
      </Button>
      <Button size="sm" variant="ghost" icon={Smartphone} onClick={() => setOpen("phone")}>
        {t("chief.phone")}
      </Button>
      <Dialog open={open === "notes"} onClose={() => setOpen(undefined)} label={t("chief.notes")} wide>
        <Notes onClose={() => setOpen(undefined)} />
      </Dialog>
      <Dialog open={open === "phone"} onClose={() => setOpen(undefined)} label={t("chief.phone")} wide>
        <Phone onClose={() => setOpen(undefined)} />
      </Dialog>
    </div>
  );
}

/** NOTES.md in the chief's folder: Claude Code reads it at every start, the user can change it here. */
function Notes({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    api
      .chiefNotes()
      .then((r) => current && setText(r.text))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, []);
  const save = async () => {
    try {
      await api.saveChiefNotes(text ?? "");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="space-y-2 p-4 text-[13px]">
      <h2 className="text-[15px] font-semibold">{t("chief.notes")}</h2>
      <p className="text-xs text-fg-muted">{t("chief.notesHint")}</p>
      <textarea
        value={text ?? ""}
        onChange={(e) => setText(e.target.value)}
        aria-label={t("chief.notes")}
        className="h-80 w-full rounded-ui border border-border bg-bg p-2 font-mono text-[12px] outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("chief.cancel")}
        </Button>
        <Button variant="primary" disabled={text === undefined} onClick={() => void save()}>
          {t("chief.save")}
        </Button>
      </div>
    </div>
  );
}

/** Connecting the Telegram bot: a token from @BotFather, then "/start <code>" sent to the bot. */
function Phone({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TelegramStatus>();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<TelegramStatus>) => {
    setBusy(true);
    setError(undefined);
    try {
      setStatus(await action());
      setToken("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let current = true;
    // While a pairing code waits, look again so "paired" shows as soon as the phone sends it.
    const load = () =>
      void api
        .telegram()
        .then((s) => current && setStatus(s))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 4000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="space-y-3 p-4 text-[13px]">
      <h2 className="text-[15px] font-semibold">{t("chief.phoneTitle")}</h2>
      <p className="text-xs text-fg-muted">{t("chief.phoneIntro")}</p>
      {!status?.configured && (
        <>
          <ol className="list-decimal space-y-1 ps-5 text-xs">
            <li>{t("chief.step1")}</li>
            <li>{t("chief.step2")}</li>
          </ol>
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA..."
              aria-label={t("chief.token")}
              className={`${field} min-w-0 flex-1 font-mono`}
              autoComplete="off"
            />
            <Button
              variant="primary"
              icon={Send}
              disabled={busy || !token.trim()}
              onClick={() => void run(() => api.connectTelegram(token))}
            >
              {t("chief.connect")}
            </Button>
          </div>
        </>
      )}
      {status?.configured && !status.paired && status.pairCode && (
        <div className="space-y-1 rounded-ui border border-border bg-bg-subtle p-3">
          <p>{t("chief.pair", { bot: status.bot ?? "" })}</p>
          <p className="select-all font-mono text-[15px]">/start {status.pairCode}</p>
          {status.bot && (
            <a
              href={`https://t.me/${status.bot}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent-hover underline"
            >
              <ExternalLink size={12} aria-hidden="true" /> t.me/{status.bot}
            </a>
          )}
        </div>
      )}
      {status?.paired && <p className="text-success">{t("chief.paired", { bot: status.bot ?? "" })}</p>}
      {status?.error && <p className="text-xs text-danger">{status.error}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-fg-subtle">{t("chief.phonePrivacy")}</p>
      <div className="flex justify-end gap-2">
        {status?.configured && (
          <Button variant="ghost" icon={Unplug} disabled={busy} onClick={() => void run(api.disconnectTelegram)}>
            {t("chief.disconnect")}
          </Button>
        )}
        <Button onClick={onClose}>{t("chief.close")}</Button>
      </div>
    </div>
  );
}

/** A run the chief started has a result: where, how it ended, and its page to look and approve. */
export function RunReport({ text }: { text: string }) {
  const { t } = useTranslation();
  const [runId = "", status = "", project = "", changed = "0"] = text.split("|");
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-subtle p-2 text-xs">
      <span className="min-w-0 flex-1">
        {t("chief.run", {
          project,
          status: t(`flows.status_${status}`, { defaultValue: status }),
          count: Number(changed) || 0,
        })}
      </span>
      <Link to={`/runs/${runId}`} className="shrink-0 font-medium text-accent-hover underline">
        {t("chief.openRun")}
      </Link>
    </p>
  );
}
