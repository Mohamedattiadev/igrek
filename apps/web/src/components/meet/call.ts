import { decrypt, encrypt, importTeamKey, roomOfMeeting, type TeamKey } from "@igrek/core";

/**
 * A light call (plan.md 20.8): every person connects directly to every other (up to five), the hub
 * only passes the first messages on, encrypted with the meeting's own key. Sound starts first,
 * the picture follows; on a weak line the picture is turned down and then off by itself. Chat, a
 * raised hand, mute and the whiteboard travel on a data channel between the people themselves.
 */

/** What the hub says about a room (hub calls.ts). */
export interface CallEvent {
  op: "peers" | "joined" | "left" | "signal";
  room: string;
  peers?: { device: string; user: string }[];
  device?: string;
  user?: string;
  name?: string;
  from?: string;
  data?: string;
}

/** How the call reaches the hub: Igrek's server, or the browser's own connection. */
export interface CallTransport {
  send: (msg: { op: "join" | "leave" | "signal"; room: string; to?: string; data?: string; name?: string }) => void;
  subscribe: (fn: (e: CallEvent) => void) => () => void;
}

export interface Peer {
  device: string;
  user: string;
  name: string;
  stream?: MediaStream;
  hand: boolean;
  muted: boolean;
  weak: boolean;
}

/** What goes on the data channel: chat lines, hands, mute, the whiteboard and the pointers on it. */
export type ChannelMessage =
  | { t: "hello"; name: string; user: string }
  | { t: "chat"; text: string; at: number }
  | { t: "hand"; up: boolean }
  | { t: "muted"; muted: boolean }
  | { t: "board"; elements: string }
  | { t: "pointer"; x: number; y: number }
  | { t: "end" };

type Signal =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  /** "Offer again, I added something": the side that does not offer asks the one that does. */
  | { type: "renegotiate" };

const MAX_PEERS = 5;

/** How a connection is doing: share of packets lost coming in, and the round trip. */
async function lineOf(pc: RTCPeerConnection): Promise<{ weak: boolean; rtt: number }> {
  const stats = await pc.getStats();
  let lost = 0;
  let total = 0;
  let rtt = 0;
  stats.forEach(
    (r: { type: string; packetsLost?: number; packetsReceived?: number; currentRoundTripTime?: number }) => {
      if (r.type === "inbound-rtp") {
        lost += r.packetsLost ?? 0;
        total += (r.packetsReceived ?? 0) + (r.packetsLost ?? 0);
      }
      if (r.type === "candidate-pair" && r.currentRoundTripTime) rtt = r.currentRoundTripTime;
    },
  );
  return { weak: (total > 50 && lost / total > 0.08) || rtt > 0.6, rtt };
}

/** Less picture on a weak line (150 kbit/s), none on a very slow one; full again when it recovers. */
async function tune(sender: RTCRtpSender, weak: boolean, rtt: number): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings?.length) return;
  for (const e of params.encodings) {
    e.maxBitrate = weak ? 150_000 : 900_000;
    e.active = !(weak && rtt > 1.2);
  }
  await sender.setParameters(params).catch(() => undefined);
}

export class Call {
  room = "";
  local?: MediaStream;
  readonly peers = new Map<string, Peer>();
  readonly chat: { who: string; text: string; at: number }[] = [];
  hand = false;
  muted = false;
  camera = false;
  sharing = false;
  /** The sound of each person, for the transcript (whose device: their stream). */
  onPeersChanged: () => void = () => undefined;
  onMessage: (from: Peer, m: ChannelMessage) => void = () => undefined;
  private pcs = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  private key?: TeamKey;
  private stop?: () => void;
  private watch?: ReturnType<typeof setInterval>;

  constructor(
    private readonly transport: CallTransport,
    private readonly me: { user: string; name: string },
    private readonly iceServers: RTCIceServer[] = [],
  ) {}

  /** Whether this window can take part at all (the Linux desktop app's engine often cannot). */
  static supported(): boolean {
    return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Sound first (it is ready in a moment), then the room; the camera is added when asked for. */
  async join(meetingKey: string, withCamera: boolean): Promise<void> {
    this.key = await importTeamKey(meetingKey);
    this.room = await roomOfMeeting(meetingKey);
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.stop = this.transport.subscribe((e) => {
      if (e.room === this.room) void this.on(e).catch(() => undefined);
    });
    this.transport.send({ op: "join", room: this.room, name: this.me.name });
    this.watch = setInterval(() => void this.checkLines(), 5000);
    if (withCamera) void this.toggleCamera();
  }

  private async on(e: CallEvent): Promise<void> {
    if (e.op === "peers") {
      for (const p of (e.peers ?? []).slice(0, MAX_PEERS - 1)) this.connect(p.device, p.user);
    } else if (e.op === "joined" && e.device) {
      this.peers.set(e.device, {
        device: e.device,
        user: e.user ?? "",
        name: e.name ?? "",
        hand: false,
        muted: false,
        weak: false,
      });
      this.connect(e.device, e.user ?? "");
      this.onPeersChanged();
    } else if (e.op === "left" && e.device) this.drop(e.device);
    else if (e.op === "signal" && e.from && e.data && this.key) {
      const sealed = JSON.parse(e.data) as { nonce: string; data: string };
      const signal = await decrypt<Signal>(this.key, this.room, sealed.nonce, sealed.data);
      await this.onSignal(e.from, e.user ?? "", signal);
    }
  }

  private async send(to: string, signal: Signal): Promise<void> {
    if (!this.key) return;
    const sealed = await encrypt(this.key, this.room, signal);
    this.transport.send({ op: "signal", room: this.room, to, data: JSON.stringify(sealed) });
  }

  private peerConnection(device: string, user: string): RTCPeerConnection {
    const known = this.pcs.get(device);
    if (known) return known;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(device, pc);
    if (!this.peers.has(device))
      this.peers.set(device, { device, user, name: "", hand: false, muted: false, weak: false });
    for (const track of this.local?.getTracks() ?? []) if (this.local) pc.addTrack(track, this.local);
    pc.onicecandidate = (ev) =>
      ev.candidate && void this.send(device, { type: "ice", candidate: ev.candidate.toJSON() });
    pc.ontrack = (ev) => {
      const peer = this.peers.get(device);
      if (peer) peer.stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.onPeersChanged();
    };
    pc.ondatachannel = (ev) => this.channel(device, ev.channel);
    // Anything added later (the camera, a shared screen) is offered again, always by the same side.
    pc.onnegotiationneeded = () =>
      void (this.leads(user) ? this.offer(device, pc) : this.send(device, { type: "renegotiate" }));
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable" && this.again.delete(device)) void this.offer(device, pc);
    };
    pc.onconnectionstatechange = () => pc.connectionState === "failed" && pc.restartIce();
    return pc;
  }

  /**
   * Of each two people, only one ever makes offers: the one whose id sorts first. The other answers
   * and, when it adds something, asks for a new offer. Two offers can then never cross.
   */
  private leads(user: string): boolean {
    return this.me.user < user;
  }

  /** People still owed an offer once the one under way is answered. */
  private again = new Set<string>();

  private connect(device: string, user: string): void {
    if (this.pcs.has(device)) return;
    const pc = this.peerConnection(device, user);
    if (this.leads(user)) this.channel(device, pc.createDataChannel("igrek"));
  }

  private async offer(device: string, pc: RTCPeerConnection): Promise<void> {
    if (pc.signalingState !== "stable") {
      this.again.add(device);
      return;
    }
    await pc.setLocalDescription(await pc.createOffer());
    await this.send(device, { type: "offer", sdp: pc.localDescription?.sdp ?? "" });
  }

  private async onSignal(device: string, user: string, s: Signal): Promise<void> {
    const pc = this.peerConnection(device, user);
    if (s.type === "ice") await pc.addIceCandidate(s.candidate).catch(() => undefined);
    else if (s.type === "renegotiate") {
      if (this.leads(user)) await this.offer(device, pc);
    } else if (s.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: s.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await this.send(device, { type: "answer", sdp: pc.localDescription?.sdp ?? "" });
    } else if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription({ type: "answer", sdp: s.sdp });
  }

  private channel(device: string, dc: RTCDataChannel): void {
    this.channels.set(device, dc);
    dc.onopen = () => {
      dc.send(JSON.stringify({ t: "hello", name: this.me.name, user: this.me.user } satisfies ChannelMessage));
      if (this.hand) dc.send(JSON.stringify({ t: "hand", up: true }));
      if (this.muted) dc.send(JSON.stringify({ t: "muted", muted: true }));
    };
    dc.onmessage = (ev) => {
      const peer = this.peers.get(device);
      if (!peer) return;
      const m = JSON.parse(String(ev.data)) as ChannelMessage;
      if (m.t === "hello") Object.assign(peer, { name: m.name.slice(0, 60), user: m.user });
      else if (m.t === "hand") peer.hand = m.up;
      else if (m.t === "muted") peer.muted = m.muted;
      else if (m.t === "chat") this.chat.push({ who: peer.name, text: m.text.slice(0, 2000), at: m.at });
      this.onMessage(peer, m);
      this.onPeersChanged();
    };
  }

  /** To everyone in the call, on the data channels. */
  broadcast(m: ChannelMessage): void {
    const text = JSON.stringify(m);
    for (const dc of this.channels.values()) if (dc.readyState === "open") dc.send(text);
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
    for (const t of this.local?.getAudioTracks() ?? []) t.enabled = !this.muted;
    this.broadcast({ t: "muted", muted: this.muted });
    this.onPeersChanged();
  }

  /** The camera on or off; added to every connection (which offers itself again). */
  async toggleCamera(): Promise<void> {
    const video = this.local?.getVideoTracks()[0];
    if (video) {
      video.stop();
      this.local?.removeTrack(video);
      for (const pc of this.pcs.values()) for (const s of pc.getSenders()) if (s.track === video) pc.removeTrack(s);
      this.camera = false;
    } else {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 24 } });
      const track = cam.getVideoTracks()[0];
      if (!track || !this.local) return;
      this.local.addTrack(track);
      for (const pc of this.pcs.values()) pc.addTrack(track, this.local);
      this.camera = true;
    }
    this.onPeersChanged();
  }

  /** The screen instead of the camera, until sharing stops. */
  async shareScreen(): Promise<void> {
    if (this.sharing) return;
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = screen.getVideoTracks()[0];
    if (!track || !this.local) return;
    this.sharing = true;
    for (const pc of this.pcs.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else pc.addTrack(track, this.local);
    }
    track.onended = () => {
      this.sharing = false;
      const cam = this.local?.getVideoTracks()[0];
      for (const pc of this.pcs.values())
        for (const s of pc.getSenders()) if (s.track === track) void s.replaceTrack(cam ?? null);
      this.onPeersChanged();
    };
    this.onPeersChanged();
  }

  /** Every few seconds: a line losing packets or slow gets less picture, then none; sound stays. */
  private async checkLines(): Promise<void> {
    for (const [device, pc] of this.pcs) {
      const { weak, rtt } = await lineOf(pc);
      const peer = this.peers.get(device);
      if (peer && peer.weak !== weak) {
        peer.weak = weak;
        this.onPeersChanged();
      }
      for (const s of pc.getSenders()) if (s.track?.kind === "video") await tune(s, weak, rtt);
    }
  }

  private drop(device: string): void {
    this.pcs.get(device)?.close();
    this.pcs.delete(device);
    this.channels.delete(device);
    this.peers.delete(device);
    this.onPeersChanged();
  }

  leave(): void {
    if (this.room) this.transport.send({ op: "leave", room: this.room });
    for (const device of [...this.pcs.keys()]) this.drop(device);
    for (const t of this.local?.getTracks() ?? []) t.stop();
    clearInterval(this.watch);
    this.stop?.();
  }
}
