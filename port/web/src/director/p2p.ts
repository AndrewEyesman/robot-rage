// A match's direct connection: a WebRTC DataChannel between the two players' pages,
// with the relay WebSocket (server/relay.mjs) as signalling channel and fallback. The
// original game connected its players directly (port 1626); browsers can't, but
// WebRTC can, for most players. One DirectLink per counterpart of a Multiuser
// connection (multiuser.ts): the joiner has one, to the host; the host one per peer
// that offered.
//
// Signalling: JSON text frames on the relay socket, which the game never sees. The
// joiner offers once the relay has answered its hello (with the ICE servers); the host
// answers, or declines when it is relay-only; candidates trickle both ways.
//
// Handover, per direction, so no message is lost or reordered: until the channel is
// open, messages go over the relay. When it opens, the sender writes a {t: "switch"}
// marker on the relay, then sends everything on the channel. The receiver delivers
// relayed messages as they come and holds channel messages until that sender's marker
// arrives (the relay keeps text and binary frames in order), then delivers them.
//
// Falling back: if the channel doesn't open within CONNECT_TIMEOUT (strict NATs, a
// declined offer, ?p2p=relay on the other side) the link stays on the relay for good.
// If an open channel dies (closed, or ICE disconnected for DISCONNECT_GRACE), the
// sender writes {t: "back", base, frames} on the relay: the messages it sent on the
// channel that the receiver hasn't acknowledged (the receiver acks what it got every
// ACK_DELAY), from channel message number `base`; the receiver delivers the ones it
// hasn't got, ignores the channel from then on, and the sender carries on over the
// relay. The relay socket stays open all match: it reports the opponent leaving.
//
// Settings: ?p2p=relay (or localStorage.rrP2P = 'relay') keeps every connection on
// the relay, so the opponent never learns this player's IP address. ?p2p=fail breaks
// ICE (only relay candidates, and there is no TURN server): for testing the fallback.

/** How long a link may take to open its channel before it settles on the relay. */
export const CONNECT_TIMEOUT = 5000;
/** How long an open channel may stay ICE-disconnected before the link falls back. */
const DISCONNECT_GRACE = 3000;
const ACK_DELAY = 100;
/** Byte offset of an SMUS frame's time stamp: header (6) + error code (4). */
const TIMESTAMP_OFFSET = 10;

export type Transport = 'connecting' | 'direct' | 'relay';
export type P2PSetting = 'auto' | 'relay' | 'fail';

/** The page's setting: ?p2p=relay|fail, else localStorage.rrP2P, else auto. */
export function p2pSetting(): P2PSetting {
  let v: string | null = null;
  try {
    v = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('p2p');
    if (v === null && typeof localStorage !== 'undefined') v = localStorage.getItem('rrP2P');
  } catch {
    // no storage
  }
  return v === 'relay' || v === 'fail' ? v : 'auto';
}

export function webrtcAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/** A control message on the relay socket. */
export interface Control {
  t: string;
  [k: string]: unknown;
}

export interface LinkOptions {
  /** The peer's userID on the host's side; '' on the joiner's (its only counterpart). */
  name: string;
  offerer: boolean;
  iceServers: RTCIceServer[];
  setting: P2PSetting;
  /** Write a control message on the relay socket (the link adds `to` on the host's side). */
  control(m: Control): void;
  /** A whole SMUS frame that came over the channel, in order. */
  deliver(frame: Uint8Array): void;
  /** The relay's clock now (the time stamp the relay would have written). */
  clock(): number;
  onChange?(link: DirectLink): void;
}

const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class DirectLink {
  readonly name: string;
  transport: Transport = 'connecting';
  /** Why the link is on the relay (or 'open' once direct). */
  reason = 'negotiating';
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private ackTimer: ReturnType<typeof setTimeout> | undefined;
  // Sending: 'relay' before the switch, 'direct' after, 'back' after falling back.
  private out: 'relay' | 'direct' | 'back' = 'relay';
  sent = 0;
  private acked = 0;
  private unacked: Uint8Array[] = [];
  // Receiving, the same states for the other direction.
  private in: 'relay' | 'direct' | 'back' = 'relay';
  got = 0;
  private early: Uint8Array[] = [];
  private closed = false;

  constructor(private o: LinkOptions) {
    this.name = o.name;
    try {
      this.pc = new RTCPeerConnection({ iceServers: o.iceServers, iceTransportPolicy: o.setting === 'fail' ? 'relay' : 'all' });
    } catch (e) {
      this.fail(`no peer connection (${e})`);
      return;
    }
    const pc = this.pc;
    pc.onicecandidate = (e) => {
      if (e.candidate && !this.closed) this.control({ t: 'ice', c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => this.connectionState();
    this.timer = setTimeout(() => {
      if (this.transport === 'connecting') this.fail('timed out');
    }, CONNECT_TIMEOUT);
    if (o.offerer) {
      this.channel(pc.createDataChannel('smus', { ordered: true }));
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => this.control({ t: 'offer', sdp: pc.localDescription!.sdp }))
        .catch((e) => this.fail(`offer failed (${e})`));
    } else {
      pc.ondatachannel = (e) => this.channel(e.channel);
    }
  }

  /** Whether game messages to this counterpart go on the channel now. */
  get sendsDirect() {
    return this.out === 'direct';
  }

  /** A control message from the other end (offer, answer, ice, decline, switch, back). */
  async onControl(m: Control) {
    if (this.closed && m.t !== 'back') return;
    const pc = this.pc;
    try {
      if (m.t === 'offer' && pc) {
        await pc.setRemoteDescription({ type: 'offer', sdp: String(m.sdp) });
        await this.remoteReady();
        await pc.setLocalDescription(await pc.createAnswer());
        this.control({ t: 'answer', sdp: pc.localDescription!.sdp });
      } else if (m.t === 'answer' && pc) {
        await pc.setRemoteDescription({ type: 'answer', sdp: String(m.sdp) });
        await this.remoteReady();
      } else if (m.t === 'ice' && pc) {
        if (this.remoteSet) await pc.addIceCandidate(m.c as RTCIceCandidateInit);
        else this.pendingIce.push(m.c as RTCIceCandidateInit);
      } else if (m.t === 'decline' || m.t === 'unsupported') {
        this.fail(m.t === 'decline' ? 'declined by the other side' : 'the other side has no direct connections', false);
      } else if (m.t === 'switch') {
        console.log(`Multiuser: ${this.who} switched to the direct channel (${this.early.length} channel messages held)`);
        this.in = 'direct';
        for (const f of this.early.splice(0)) this.o.deliver(f);
      } else if (m.t === 'back') {
        // The sender's channel died: the frames from channel message `base` on, which
        // it can't be sure arrived. Deliver the ones that didn't; the channel is done.
        for (const f of this.early.splice(0)) this.o.deliver(f);
        const base = Number(m.base);
        const frames = (m.frames as string[]).map(unb64);
        console.log(`Multiuser: ${this.who} fell back: resends ${frames.length} from channel message ${base}, ${this.got} got here`);
        for (let i = this.got - base; i < frames.length; i++) {
          this.got++;
          this.o.deliver(frames[i]);
        }
        this.in = 'back';
        this.fallBack('the other side fell back');
      }
    } catch (e) {
      if (this.transport === 'connecting') this.fail(`signalling failed (${e})`);
    }
  }

  /**
   * Send a whole SMUS frame on the channel, stamped with the relay's clock as the relay
   * would stamp it. False when the link isn't direct (any more): send it on the relay.
   */
  send(frame: Uint8Array): boolean {
    if (this.out !== 'direct') return false;
    new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(TIMESTAMP_OFFSET, this.o.clock() >>> 0);
    this.unacked.push(frame);
    this.sent++;
    try {
      if (this.dc?.readyState !== 'open') throw new Error('channel not open');
      this.dc.send(frame as Uint8Array<ArrayBuffer>);
    } catch {
      // It's in unacked: the back marker resends it on the relay.
      this.fallBack('channel closed');
    }
    return true;
  }

  /** Close without telling the other side (the relay connection to it is gone). */
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.graceTimer);
    clearTimeout(this.ackTimer);
    if (this.dc) this.dc.onclose = this.dc.onmessage = this.dc.onopen = null;
    if (this.pc) this.pc.onconnectionstatechange = this.pc.onicecandidate = null;
    this.dc?.close();
    this.pc?.close();
    this.pc = null;
    this.dc = null;
  }

  info() {
    return { peer: this.name, transport: this.transport, reason: this.reason, sentDirect: this.sent, gotDirect: this.got };
  }

  // ------------------------------------------------------------------ internals

  private control(m: Control) {
    this.o.control(this.name ? { ...m, to: this.name } : m);
  }

  /** The other side, for the log. */
  private get who() {
    return this.name || 'the host';
  }

  private async remoteReady() {
    this.remoteSet = true;
    for (const c of this.pendingIce.splice(0)) await this.pc!.addIceCandidate(c);
  }

  private channel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => this.opened();
    dc.onclose = () => this.fallBack('channel closed');
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const a = JSON.parse(e.data).a as number;
        if (a > this.acked) {
          this.unacked.splice(0, a - this.acked);
          this.acked = a;
        }
        return;
      }
      if (this.in === 'back') return;
      const frame = new Uint8Array(e.data as ArrayBuffer);
      this.got++;
      if (this.in === 'direct') this.o.deliver(frame);
      else this.early.push(frame);
      this.ackTimer ??= setTimeout(() => {
        this.ackTimer = undefined;
        if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify({ a: this.got }));
      }, ACK_DELAY);
    };
    if (dc.readyState === 'open') this.opened();
  }

  private opened() {
    if (this.closed || this.out !== 'relay' || this.transport !== 'connecting') return;
    clearTimeout(this.timer);
    // The marker goes on the relay after every message sent there so far.
    this.control({ t: 'switch' });
    this.out = 'direct';
    this.set('direct', 'open');
  }

  private connectionState() {
    const st = this.pc?.connectionState;
    if (st === 'failed') {
      if (this.transport === 'connecting') this.fail('ICE failed');
      else this.fallBack('ICE failed');
    } else if (st === 'disconnected' && this.transport === 'direct') {
      this.graceTimer ??= setTimeout(() => {
        this.graceTimer = undefined;
        if (this.pc?.connectionState !== 'connected') this.fallBack('ICE disconnected');
      }, DISCONNECT_GRACE);
    }
  }

  /** The channel never opened: stay on the relay (telling the other side, unless it told us). */
  private fail(reason: string, tell = true) {
    if (this.transport !== 'connecting') return;
    if (tell && !this.closed) this.control({ t: 'decline' });
    this.close();
    this.closed = false; // still takes the other side's switch/back markers
    this.set('relay', reason);
  }

  /** An open channel died: resend what may be lost on the relay and stay there. */
  private fallBack(reason: string) {
    if (this.out === 'direct') {
      this.out = 'back';
      this.control({ t: 'back', base: this.acked, frames: this.unacked.map(b64) });
      this.unacked = [];
    }
    if (this.transport === 'connecting') return this.fail(reason);
    if (this.transport === 'relay') return;
    this.close();
    this.closed = false;
    this.set('relay', reason);
  }

  private set(t: Transport, reason: string) {
    this.transport = t;
    this.reason = reason;
    console.log(`Multiuser: ${t === 'direct' ? 'direct connection' : 'relay'} to ${this.who} (${reason})`);
    this.o.onChange?.(this);
  }
}
