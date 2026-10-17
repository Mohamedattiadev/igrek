import type { Briefing } from "@godeye/core";
import { ChevronDown, ChevronRight, RefreshCw, Sunrise, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, Card } from "./ui";

/** The morning briefing (plan.md 11): yesterday, today, where it's stuck; can be read aloud by the browser. */
export function BriefingCard() {
  const { t, i18n } = useTranslation();
  const [briefing, setBriefing] = useState<Briefing | null>();
  const [open, setOpen] = useState(() => new Date().getHours() < 12);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .briefing()
      .then(setBriefing)
      .catch(() => setBriefing(null));
    return () => window.speechSynthesis?.cancel();
  }, []);
  const refresh = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setBriefing(await api.briefing(true));
      setOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const speak = () => {
    if (!briefing || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = [
      briefing.focus,
      `${t("briefing.yesterday")}. ${briefing.yesterday.join(". ")}`,
      briefing.today.length ? `${t("briefing.today")}. ${briefing.today.join(". ")}` : "",
      briefing.stuck.length ? `${t("briefing.stuck")}. ${briefing.stuck.join(". ")}` : "",
    ].join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = i18n.language;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  const empty = briefing && !briefing.yesterday.length && !briefing.today.length && !briefing.stuck.length;
  return (
    <Card className="p-pad">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          {open ? (
            <ChevronDown size={14} className="text-fg-subtle" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="text-fg-subtle" aria-hidden="true" />
          )}
          <Sunrise size={15} className="text-warning" aria-hidden="true" />
          <span className="text-[13px] font-semibold">{t("briefing.title")}</span>
          {briefing?.focus && !open && <span className="min-w-0 truncate text-xs text-fg-muted">{briefing.focus}</span>}
        </button>
        {briefing && !empty && "speechSynthesis" in window && (
          <Button
            size="sm"
            variant="ghost"
            icon={speaking ? VolumeX : Volume2}
            onClick={speak}
            aria-label={t("briefing.read")}
          />
        )}
        <Button size="sm" variant="ghost" icon={RefreshCw} disabled={busy} onClick={() => void refresh()}>
          {busy ? t("briefing.writing") : briefing ? t("briefing.again") : t("briefing.write")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {open && briefing && (
        <div className="mt-3 space-y-2 text-[13px]">
          {empty ? (
            <p className="text-fg-muted">{t("briefing.quiet")}</p>
          ) : (
            <>
              {briefing.focus && <p className="font-medium">{briefing.focus}</p>}
              {(["yesterday", "today", "stuck"] as const).map((k) =>
                briefing[k].length ? (
                  <div key={k}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                      {t(`briefing.${k}`)}
                    </p>
                    <ul className="mt-0.5 list-disc space-y-0.5 ps-4">
                      {briefing[k].map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </>
          )}
        </div>
      )}
      {open && briefing === null && <p className="mt-2 text-xs text-fg-muted">{t("briefing.none")}</p>}
    </Card>
  );
}
