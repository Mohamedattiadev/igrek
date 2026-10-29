import { roomOfMeeting } from "@igrek/core";
import {
  ConnectionQuality,
  ExternalE2EEKeyProvider,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { ChannelMessage, Peer } from "./call";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A big call (plan.md 20.8, more than five people) through a LiveKit router the team runs itself.
 * Everyone sends once to the router, which passes it on; sound and picture are encrypted in each
 * browser with the meeting's own key (LiveKit's end-to-end encryption), so the router cannot see or
 * hear them. It offers the same things as a direct call (call.ts): chat, hand, mute, camera, screen.
 */
export class SfuCall {
  room = "";
  local?: MediaStream;
  readonly peers = new Map<string, Peer>();
  readonly chat: { who: string; text: string; at: number }[] = [];
  hand = false;
  muted = false;
  camera = false;
  sharing = false;
  quality = { upKbps: 0, downKbps: 0, rttMs: 0 };
  onPeersChanged: () => void = () => undefined;
  onMessage: (from: Peer, m: ChannelMessage) => void = () => undefined;
  private lk?: Room;

  constructor(
    private readonly token: (room: string) => Promise<{ url: string; token: string }>,
    private readonly me: { user: string; name: string },
  ) {}

  async join(meetingKey: string, withCamera: boolean): Promise<void> {
    this.room = await roomOfMeeting(meetingKey);
    const { url, token } = await this.token(this.room);
    const keyProvider = new ExternalE2EEKeyProvider();
    await keyProvider.setKey(meetingKey);
    const lk = new Room({
      adaptiveStream: true,
      dynacast: true,
      e2ee: {
        keyProvider,
        worker: new Worker(new URL("livekit-client/e2ee-worker", import.meta.url), { type: "module" }),
      },
    });
    this.lk = lk;
    await lk.setE2EEEnabled(true);
    const changed = () => this.refresh();
    for (const e of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ConnectionQualityChanged,
    ])
      lk.on(e, changed);
    lk.on(RoomEvent.DataReceived, (payload: Uint8Array, from?: RemoteParticipant) => this.received(payload, from));
    await lk.connect(url, token);
    await lk.localParticipant.setMicrophoneEnabled(true);
    if (withCamera) await this.toggleCamera();
    this.refresh();
  }

  /** People and their sound and picture, rebuilt from what the router gives. */
  private refresh(): void {
    const lk = this.lk;
    if (!lk) return;
    this.local = streamOf(lk.localParticipant);
    const known = new Map(this.peers);
    this.peers.clear();
    for (const p of lk.remoteParticipants.values()) {
      const before = known.get(p.sid);
      this.peers.set(p.sid, {
        device: p.sid,
        user: p.identity.split(":")[0] ?? "",
        name: p.name || before?.name || "",
        stream: streamOf(p),
        hand: before?.hand ?? false,
        muted: !p.isMicrophoneEnabled,
        weak: p.connectionQuality === ConnectionQuality.Poor,
      });
    }
    this.onPeersChanged();
  }

  private received(payload: Uint8Array, from?: RemoteParticipant): void {
    const peer = from && this.peers.get(from.sid);
    if (!peer) return;
    const m = JSON.parse(decoder.decode(payload)) as ChannelMessage;
    if (m.t === "hand") peer.hand = m.up;
    else if (m.t === "chat") this.chat.push({ who: peer.name, text: m.text.slice(0, 2000), at: m.at });
    this.onMessage(peer, m);
    this.onPeersChanged();
  }

  broadcast(m: ChannelMessage): void {
    void this.lk?.localParticipant.publishData(encoder.encode(JSON.stringify(m)), { reliable: m.t !== "pointer" });
  }

  say(text: string): void {
    const m = { t: "chat" as const, text, at: Date.now() };
    this.chat.push({ who: this.me.name, text, at: m.at });
    this.broadcast(m);
    this.onPeersChanged();
  }

  raiseHand(): void {
    this.hand = !this.hand;
    this.broadcast({ t: "hand", up: this.hand });
    this.onPeersChanged();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    void this.lk?.localParticipant.setMicrophoneEnabled(!this.muted);
    this.onPeersChanged();
  }

  async toggleCamera(): Promise<void> {
    this.camera = !this.camera;
    await this.lk?.localParticipant.setCameraEnabled(this.camera, {
      resolution: { width: 640, height: 360, frameRate: 24 },
    });
    this.refresh();
  }

  async shareScreen(): Promise<void> {
    this.sharing = !this.sharing;
    await this.lk?.localParticipant.setScreenShareEnabled(this.sharing);
    this.refresh();
  }

  leave(): void {
    void this.lk?.disconnect();
    this.peers.clear();
  }
}

/** A person's tracks as one stream for a video element: picture (screen first) and sound. */
function streamOf(p: Participant): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  const screen = p.getTrackPublication(Track.Source.ScreenShare)?.track;
  const camera = p.getTrackPublication(Track.Source.Camera)?.track;
  const mic = p.getTrackPublication(Track.Source.Microphone)?.track;
  for (const t of [screen ?? camera, mic]) if (t?.mediaStreamTrack) tracks.push(t.mediaStreamTrack);
  return new MediaStream(tracks);
}
