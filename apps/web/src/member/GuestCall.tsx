import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { Call, type CallEvent, type CallTransport } from "../components/meet/call";
import { Tile } from "../components/meet/MeetRoom";
import { Button, field } from "../components/ui";
import { cn } from "../lib/cn";

/** A guest's own connection to the hub: it opens this one call's room and nothing else. */
function guestTransport(token: string): { transport: CallTransport; close: () => void } {
  const listeners = new Set<(e: CallEvent) => void>();
  const queue: string[] = [];
  const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws?guest=${encodeURIComponent(token)}`);
  ws.onopen = () => {
    for (const m of queue.splice(0)) ws.send(m);
  };
  ws.onmessage = (m) => {
    const e = JSON.parse(String(m.data)) as CallEvent;
    for (const fn of listeners) fn(e);
  };
  return {
    transport: {
      send: (msg) => (ws.readyState === 1 ? ws.send(JSON.stringify(msg)) : queue.push(JSON.stringify(msg))),
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    close: () => ws.close(),
  };
}

/**
 * Someone outside the team, with a one-time link (plan.md 20.8): their name, then the call. The
 * meeting's key is in the link after "#", so it never reaches the hub; they see nothing else.
 */
export function GuestCall({ token, meetingKey, title }: { token: string; meetingKey: string; title: string }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [call, setCall] = useState<Call>();
  const [, redraw] = useState(0);
  const [error, setError] = useState<string>();
  const [left, setLeft] = useState(false);
  useEffect(() => () => call?.leave(), [call]);
  const join = () => {
    const { transport, close } = guestTransport(token);
    const c = new Call(transport, { user: `guest:${name.trim()}`, name: name.trim() }, [
      { urls: "stun:stun.l.google.com:19302" },
    ]);
    c.onPeersChanged = () => redraw((n) => n + 1);
    const leave = c.leave.bind(c);
    c.leave = () => {
      leave();
      close();
    };
    c.join(meetingKey, false)
      .then(() => setCall(c))
      .catch((err: Error) => setError(err.message));
  };
  if (left) return <p className="mx-auto mt-24 max-w-sm px-4 text-[14px]">{t("meet.guestBye")}</p>;
  if (!call)
    return (
      <form
        className="mx-auto mt-24 max-w-sm space-y-3 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) join();
        }}
      >
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          <Logo className="size-7" /> {title}
        </h1>
        <p className="text-xs text-fg-muted">{t("meet.guestHint")}</p>
        <input
          className={cn(field, "w-full")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("meet.guestName")}
          aria-label={t("meet.guestName")}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {t("meet.join")}
        </Button>
      </form>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <h1 className="text-[16px] font-semibold">{title}</h1>
      <div className="grid gap-2 sm:grid-cols-2">
        <Tile stream={call.local} name={name} muted={call.muted} self />
        {[...call.peers.values()].map((p) => (
          <Tile key={p.device} stream={p.stream} name={p.name} muted={p.muted} hand={p.hand} weak={p.weak} />
        ))}
      </div>
      <div className="flex justify-center gap-2">
        <Button icon={call.muted ? MicOff : Mic} onClick={() => call.toggleMute()} aria-label={t("meet.mute")} />
        <Button
          icon={call.camera ? Video : VideoOff}
          onClick={() => void call.toggleCamera()}
          aria-label={t("meet.camera")}
        />
        <Button
          variant="primary"
          icon={PhoneOff}
          onClick={() => {
            call.leave();
            setLeft(true);
          }}
        >
          {t("meet.leave")}
        </Button>
      </div>
    </div>
  );
}
