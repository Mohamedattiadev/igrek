import type { OrgMeeting } from "@igrek/core";
import {
  Circle,
  ExternalLink,
  Hand,
  Link2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PenLine,
  PhoneOff,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { nameOf, type OrgApi, type OrgView } from "../org/api";
import { Button, field } from "../ui";
import { Call, type CallTransport, type MeetCall, type Peer } from "./call";

// Only a meeting that opens its whiteboard downloads it (the first screen stays light). Its fonts
// come from this page's own server (vite.excalidraw.ts), never a CDN; set before it loads.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
const MeetBoard = lazy(() => import("./MeetBoard"));

export function Tile({
  stream,
  name,
  muted,
  self,
  hand,
  weak,
}: {
  stream?: MediaStream;
  name: string;
  muted?: boolean;
  self?: boolean;
  hand?: boolean;
  weak?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  const video = !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-subtle"
      style={{ aspectRatio: "16 / 9" }}
      data-live={stream ? "true" : undefined}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={self}
        className={cn("h-full w-full object-cover", !video && "hidden")}
      />
      {!video && <span className="text-[20px] font-semibold text-fg-muted">{name.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute start-2 bottom-2 inline-flex items-center gap-1 rounded-ui bg-bg px-1.5 py-0.5 text-[11.5px]">
        {muted && <MicOff size={12} className="text-danger" aria-hidden="true" />}
        {hand && <Hand size={12} className="text-warning" aria-hidden="true" />}
        {weak && <WifiOff size={12} className="text-warning" aria-hidden="true" />}
        {name}
      </span>
    </div>
  );
}

/**
 * Each person's sound, cut into 30-second pieces and written down on this computer (Whisper), only
 * while everyone in the call has agreed. Lines are kept with who said them.
 */
function useScribe(
  call: MeetCall | undefined,
  on: boolean,
  transcribe: OrgApi["transcribe"],
  onLine: (who: string, at: number, text: string) => void,
): void {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!call) return;
    const before = call.onPeersChanged;
    call.onPeersChanged = () => {
      before();
      tick((n) => n + 1);
    };
    return () => {
      call.onPeersChanged = before;
    };
  }, [call]);
  const streams =
    call && on && transcribe
      ? [
          { who: "", stream: call.local },
          ...[...call.peers.values()].map((p) => ({ who: p.user || p.name, stream: p.stream })),
        ]
      : [];
  const key = streams.map((s) => `${s.who}:${s.stream?.id ?? ""}`).join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the set of voices is the reason to start again
  useEffect(() => {
    if (!transcribe) return;
    const recorders: MediaRecorder[] = [];
    let alive = true;
    for (const { who, stream } of streams) {
      const audio = stream?.getAudioTracks()[0];
      if (!audio) continue;
      const piece = () => {
        if (!alive) return;
        const rec = new MediaRecorder(new MediaStream([audio]));
        const started = Date.now();
        rec.ondataavailable = (e) => {
          if (e.data.size > 2000)
            void transcribe(e.data)
              .then((text) => text.trim() && onLine(who, started, text.trim()))
              .catch(() => undefined);
        };
        rec.onstop = piece;
        try {
          rec.start();
        } catch {
          // The track is not ready yet (just joined, a camera switch): try again in a moment.
          setTimeout(piece, 1000);
          return;
        }
        recorders.push(rec);
        setTimeout(() => rec.state === "recording" && rec.stop(), 30_000);
      };
      piece();
    }
    return () => {
      alive = false;
      for (const r of recorders) if (r.state === "recording") r.stop();
    };
  }, [key]);
}

/** The buttons under the call: sound, camera, screen, hand, chat, board, transcript, a guest link, leave. */
function Controls({
  api,
  meeting,
  call,
  panel,
  setPanel,
  scribing,
  setScribing,
  everyoneAgreed,
  onGuest,
  onError,
  onLeave,
}: {
  api: OrgApi;
  meeting: OrgMeeting;
  call?: MeetCall;
  panel?: "chat" | "board";
  setPanel: (fn: (p?: "chat" | "board") => "chat" | "board" | undefined) => void;
  scribing: boolean;
  setScribing: (fn: (v: boolean) => boolean) => void;
  everyoneAgreed: boolean;
  onGuest: (link: string) => void;
  onError: (message: string) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const button = (on: boolean) =>
    cn(
      "flex items-center justify-center rounded-full border border-border",
      on ? "bg-accent text-white" : "bg-bg hover:bg-bg-hover",
    );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(!!call?.muted)}
        onClick={() => call?.toggleMute()}
        aria-label={call?.muted ? t("meet.unmute") : t("meet.mute")}
        data-tip={call?.muted ? t("meet.unmute") : t("meet.mute")}
      >
        {call?.muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </button>
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(!!call?.camera)}
        onClick={() => void call?.toggleCamera().catch((e: Error) => onError(e.message))}
        aria-label={t("meet.camera")}
        data-tip={t("meet.camera")}
      >
        {call?.camera ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
      </button>
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(!!call?.sharing)}
        onClick={() => void call?.shareScreen().catch(() => undefined)}
        aria-label={t("meet.share")}
        data-tip={t("meet.share")}
      >
        <MonitorUp size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(!!call?.hand)}
        onClick={() => call?.raiseHand()}
        aria-label={t("meet.hand")}
        data-tip={t("meet.hand")}
      >
        <Hand size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(panel === "chat")}
        onClick={() => setPanel((p) => (p === "chat" ? undefined : "chat"))}
        aria-label={t("meet.chat")}
        data-tip={t("meet.chat")}
      >
        <MessageSquare size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        style={{ width: 40, height: 40 }}
        className={button(panel === "board")}
        onClick={() => setPanel((p) => (p === "board" ? undefined : "board"))}
        aria-label={t("meet.board")}
        data-tip={t("meet.board")}
      >
        <PenLine size={18} aria-hidden="true" />
      </button>
      {api.transcribe && (
        <button
          type="button"
          style={{ width: 40, height: 40 }}
          className={button(scribing)}
          disabled={!everyoneAgreed}
          onClick={() => setScribing((v) => !v)}
          aria-label={t("meet.record")}
          data-tip={everyoneAgreed ? t("meet.record") : t("meet.recordNeedsAll")}
        >
          <Circle size={18} className={scribing ? "text-danger" : ""} aria-hidden="true" />
        </button>
      )}
      {api.guestLink && (
        <button
          type="button"
          style={{ width: 40, height: 40 }}
          className={button(false)}
          aria-label={t("meet.guest")}
          data-tip={t("meet.guest")}
          onClick={() =>
            call &&
            void api
              .guestLink?.(call.room)
              .then((token) =>
                onGuest(
                  `${api.hubUrl ?? location.origin}/#/guest/${token}/${meeting.key}/${encodeURIComponent(meeting.title)}`,
                ),
              )
          }
        >
          <Link2 size={18} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="flex h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-[13px] font-medium text-white"
        onClick={onLeave}
      >
        <PhoneOff size={16} aria-hidden="true" /> {t("meet.leave")}
      </button>
    </div>
  );
}

/** Everyone invited: the people named and the members of the teams asked. */
function invited(m: OrgMeeting, view: OrgView): number {
  const teams = view.structure.teams.filter((t) => m.teams.includes(t.id)).flatMap((t) => t.members);
  return new Set([...m.attendees, ...teams]).size;
}

/** The call itself: everyone's picture or initial, the buttons, the chat, the board. */
export function MeetRoom({
  api,
  view,
  meeting,
  onLeave,
  dark,
}: {
  api: OrgApi;
  view: OrgView;
  meeting: OrgMeeting;
  onLeave: () => void;
  dark: boolean;
}) {
  const { t } = useTranslation();
  const [call, setCall] = useState<MeetCall>();
  const [, redraw] = useState(0);
  const [error, setError] = useState<string>();
  const [panel, setPanel] = useState<"chat" | "board">();
  const [text, setText] = useState("");
  const [guest, setGuest] = useState<string>();
  const [scribing, setScribing] = useState(false);
  const board = useRef<string>(meeting.board ?? "");
  const me = view.me.id;
  // More than five people with a router set up: through the router (sfu.ts); otherwise directly.
  const big = !!api.sfu && invited(meeting, view) > 5;
  useEffect(() => {
    if (!api.call || !Call.supported()) return;
    const who = { user: me, name: view.me.displayName || view.me.username };
    let alive = true;
    let made: MeetCall | undefined;
    const start = async () => {
      const c: MeetCall =
        big && api.sfu
          ? new (await import("./sfu")).SfuCall(api.sfu, who)
          : new Call(api.call as CallTransport, who, view.state.meet.iceServers);
      made = c;
      c.onPeersChanged = () => redraw((n) => n + 1);
      await c.join(meeting.key, false);
      if (alive) setCall(c);
    };
    start().catch((err: Error) => setError(err.message));
    return () => {
      alive = false;
      made?.leave();
    };
  }, [api.call, api.sfu, big, meeting.key, me, view.me.displayName, view.me.username, view.state.meet.iceServers]);
  const inCall = [me, ...[...(call?.peers.values() ?? [])].map((p) => p.user)].filter(Boolean);
  const everyoneAgreed = inCall.every((u) => meeting.consent[u]);
  useScribe(
    call,
    scribing && everyoneAgreed,
    api.transcribe,
    (who, at, line) =>
      void api.act("org-meeting-line", {
        id: `${meeting.id}-${at}-${who}`.slice(0, 40),
        meeting: meeting.id,
        who: who || me,
        at,
        text: line,
      }),
  );
  const leave = () => {
    if (board.current)
      void api.act("org-meeting-board", {
        id: `${meeting.id}-board`.slice(0, 40),
        meeting: meeting.id,
        board: board.current,
      });
    call?.leave();
    onLeave();
  };
  if (!Call.supported())
    return (
      <div className="space-y-2 rounded-xl border border-warning bg-warning-soft p-4 text-[13px]">
        <p>{t("meet.noWebrtc")}</p>
        <a
          href={`${location.origin}${location.pathname}${location.search}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
        >
          <ExternalLink size={14} aria-hidden="true" /> {t("meet.openInBrowser")}
        </a>
      </div>
    );
  const peers = [...(call?.peers.values() ?? [])];
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-danger">{error}</p>}
      {!everyoneAgreed && meeting.consent[me] === undefined && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-border bg-bg p-3 text-[13px]">
          <span className="flex-1">{t("meet.consentAsk")}</span>
          <Button
            size="sm"
            onClick={() =>
              void api.act("org-meeting", {
                ...meeting,
                consent: { ...meeting.consent, [me]: true },
                updatedAt: Date.now(),
              })
            }
          >
            {t("meet.consentYes")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void api.act("org-meeting", {
                ...meeting,
                consent: { ...meeting.consent, [me]: false },
                updatedAt: Date.now(),
              })
            }
          >
            {t("meet.consentNo")}
          </Button>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]" style={{ gridTemplateColumns: panel ? undefined : "1fr" }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Tile stream={call?.local} name={t("meet.you")} muted={call?.muted} self hand={call?.hand} />
          {peers.map((p: Peer) => (
            <Tile
              key={p.device}
              stream={p.stream}
              name={p.name || nameOf(view, p.user)}
              muted={p.muted}
              hand={p.hand}
              weak={p.weak}
            />
          ))}
        </div>
        {panel === "chat" && call && (
          <div className="flex flex-col rounded-xl border border-border bg-bg" style={{ width: 300, height: 360 }}>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-[13px]">
              {call.chat.map((c) => (
                <p key={`${c.at}${c.who}`}>
                  <span className="font-semibold">{c.who}</span> {c.text}
                </p>
              ))}
            </div>
            <form
              className="border-t border-border p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) call.say(text.trim());
                setText("");
              }}
            >
              <input
                className={cn(field, "w-full")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("meet.chat")}
                aria-label={t("meet.chat")}
              />
            </form>
          </div>
        )}
      </div>
      {panel === "board" && call && (
        <div className="overflow-hidden rounded-xl border border-border" style={{ height: 480 }}>
          <Suspense fallback={<p className="p-4 text-[13px] text-fg-subtle">{t("meet.boardLoading")}</p>}>
            <MeetBoard call={call} initial={meeting.board} dark={dark} onScene={(s) => (board.current = s)} />
          </Suspense>
        </div>
      )}
      <Controls
        api={api}
        meeting={meeting}
        call={call}
        panel={panel}
        setPanel={setPanel}
        scribing={scribing}
        setScribing={setScribing}
        everyoneAgreed={everyoneAgreed}
        onGuest={setGuest}
        onError={setError}
        onLeave={leave}
      />
      {guest && (
        <p className="text-center text-[12px] text-fg-muted">
          {t("meet.guestLink")} <span className="font-mono">{guest}</span>
        </p>
      )}
      {scribing && <p className="text-center text-[12px] text-danger">{t("meet.recording")}</p>}
      {call && call.peers.size > 0 && (
        <p className="text-center text-[11.5px] text-fg-subtle">{t("meet.quality", call.quality)}</p>
      )}
    </div>
  );
}
