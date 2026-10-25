// Relay standing in for the game's direct player-to-player connections.
//
// Originally one client called waitForNetConnection() on port 1626 and its
// opponent connectToNetServer()'d straight to that client's IP. Browsers can
// neither listen nor dial arbitrary hosts, so the patched player connects
// both ends here instead:
//
//   host:      /ws/p2p/listen?addr=<address>&user=<userID>
//   connector: /ws/p2p/connect?addr=<address>
//
// <address> is the per-tab token the page hands the game as its "IP" (see
// public/index.html). Frames are Shockwave Multiuser (SMUS) messages; the
// relay reads only their envelope (sender, recipients, subject) and forwards
// the bytes, stamped with the relay's clock: the arena estimates lag from
// message time stamps, which the emulator leaves at 0.
//
// What the host's Multiuser instance sees, as with a real listening Xtra:
//   "WaitForNetConnection" from a peer that logged on,
//   errorCode ERR_NO_CONNECTION ("ConnectionProblem") from a peer that went
//   away on its own; the arena turns that into a walkover.
// Messages the host addresses to nobody (getPeerConnectionList() is empty in
// the emulator) go to all its peers.
//
// Direct matches (the port, port/web/src/director/p2p.ts): text frames are JSON
// control messages the game never sees. A client that sends {t: "hello"} gets
// {t: "hello", iceServers, now} back ({t: "time"} just the clock), and from then
// on the relay passes its other control messages (WebRTC offer, answer, ICE
// candidates, the switch markers) to the other end: a peer's to the host with
// `from` set to the peer's userID, the host's to the peer named in `to`. A
// counterpart that never said hello gets nothing; the sender hears
// {t: "unsupported"} instead. Binary frames are relayed exactly as before, and in
// order with the control messages, which is what the switch to a direct
// connection relies on. A client that never sends text frames (the dirplayer
// page) never receives one.
//
// Limits (limits.mjs), per socket: RELAY_MSGS_PER_SEC messages and RELAY_KB_PER_SEC
// (each over a 2 s burst; a match sends a few dozen small frames a second), a frame
// no larger than WS_MAX_PAYLOAD_KB, and RELAY_PEERS_PER_HOST peers per host. A socket
// over them is closed, which its counterpart sees as the player leaving. A robot
// that's banned (`admit`, from index.mjs) can't listen or log on.
//
// Sessions (the port, gameFixes.relayAuth): both URLs may carry `sid`, the player's
// login session; `authenticate(sid, name)` says whether it owns the robot the socket
// speaks for (the host's `user`, the peer's Logon sender). Such a socket can't be
// replaced by one without the same account's session, and when it closes on its own (not
// replaced, not dropped by the host) the relay calls `onLeave(leaver, other)` for
// each counterpart: ranked results take that as the player leaving the match
// (results.mjs). Sockets without a session work as before but never count as leaving.

import { Bucket, LIMITS } from "./limits.mjs";

const MUS_HEADER = 0x7200;
// Multiuser Xtra "no current connection" error, which the client handles.
const ERR_NO_CONNECTION = -2147216214;
const TIMESTAMP_OFFSET = 10; // frame header (6) + error code (4)

export function parseEnvelope(frame) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let pos = 6;
  const readString = () => {
    const len = view.getUint32(pos);
    pos += 4;
    const text = frame.subarray(pos, pos + len).toString("latin1");
    pos += len + (len % 2);
    return text;
  };
  const errorCode = view.getInt32(pos);
  const timestamp = view.getUint32(pos + 4);
  pos += 8;
  const subject = readString();
  const sender = readString();
  const count = view.getUint32(pos);
  pos += 4;
  const recipients = [];
  for (let i = 0; i < count; i++) recipients.push(readString());
  const content = frame.subarray(pos);
  return { errorCode, timestamp, subject, sender, recipients, content };
}

export function buildMessage({ errorCode = 0, timestamp = 0, subject, sender, recipients, contentString }) {
  const parts = [];
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n >>> 0);
    parts.push(b);
  };
  const str = (s) => {
    const bytes = Buffer.from(s, "latin1");
    u32(bytes.length);
    parts.push(bytes);
    if (bytes.length % 2) parts.push(Buffer.alloc(1));
  };
  const head = Buffer.alloc(8);
  head.writeInt32BE(errorCode, 0);
  head.writeUInt32BE(timestamp >>> 0, 4);
  parts.push(head);
  str(subject);
  str(sender);
  u32(recipients.length);
  recipients.forEach(str);
  if (contentString === undefined) {
    parts.push(Buffer.from([0, 0])); // VOID
  } else {
    parts.push(Buffer.from([0, 3])); // string tag
    str(contentString);
  }
  const payload = Buffer.concat(parts);
  const frame = Buffer.alloc(6);
  frame.writeUInt16BE(MUS_HEADER, 0);
  frame.writeUInt32BE(payload.length, 2);
  return Buffer.concat([frame, payload]);
}

class FrameTooLarge extends Error {}

// Split a byte stream into complete SMUS frames, keeping any remainder (a frame
// larger than `max` throws FrameTooLarge).
function takeFrames(state, chunk, max = 0) {
  state.buffer = state.buffer.length ? Buffer.concat([state.buffer, chunk]) : chunk;
  const frames = [];
  while (state.buffer.length >= 6) {
    if (state.buffer.readUInt16BE(0) !== MUS_HEADER) {
      state.buffer = Buffer.alloc(0);
      break;
    }
    const total = 6 + state.buffer.readUInt32BE(2);
    if (max && total > max) throw new FrameTooLarge(`frame of ${total} bytes`);
    if (state.buffer.length < total) break;
    frames.push(state.buffer.subarray(0, total));
    state.buffer = state.buffer.subarray(total);
  }
  return frames;
}

const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export class Relay {
  constructor({ log, iceServers = [], limits = LIMITS, onLeave = () => {} }) {
    this.log = log;
    this.onLeave = onLeave;
    this.iceServers = iceServers;
    this.limits = limits;
    this.hosts = new Map(); // address -> { ws, user, peers: Map<lowercased userID, peer> }
    this.epoch = Date.now();
  }

  /**
   * Watches a socket's traffic against the limits: the returned function takes a
   * message's size and answers false (having closed the socket) when it's over them.
   */
  meter(ws, who) {
    const { relayMsgsPerSec, relayBytesPerSec } = this.limits;
    const msgs = new Bucket(relayMsgsPerSec, 2 * relayMsgsPerSec);
    const bytes = new Bucket(relayBytesPerSec, 2 * relayBytesPerSec);
    return (size) => {
      if (msgs.take() && bytes.take(size)) return true;
      this.overLimit(ws, who(), "rate limit");
      return false;
    };
  }

  overLimit(ws, who, reason) {
    if (ws.readyState === ws.OPEN) this.log(`relay: ${who} closed (${reason}, ${ws.clientAddress})`);
    ws.close(1008, reason);
  }

  /** Closes the sockets of these robots (lowercased names) or from this address. Returns how many. */
  kick({ names = new Set(), address } = {}) {
    let n = 0;
    const hit = (name, ws) => names.has(String(name).toLowerCase()) || (address && ws.clientAddress === address);
    for (const host of [...this.hosts.values()]) {
      for (const peer of [...host.peers.values()]) {
        if (hit(peer.name, peer.ws)) {
          peer.ws.close(1008, "kicked");
          n++;
        }
      }
      if (hit(host.user, host.ws)) {
        host.ws.close(1008, "kicked");
        n++;
      }
    }
    return n;
  }

  isListening(addr) {
    return this.hosts.has(addr);
  }

  now() {
    return (Date.now() - this.epoch) >>> 0;
  }

  forward(ws, frame) {
    if (ws.readyState !== ws.OPEN) return;
    frame.writeUInt32BE(this.now(), TIMESTAMP_OFFSET);
    ws.send(frame);
  }

  notify(ws, { errorCode = 0, subject, sender, recipient }) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(buildMessage({ errorCode, timestamp: this.now(), subject, sender, recipients: [recipient] }));
  }

  // Drop a peer without telling the host (it asked for it or was replaced).
  dropPeer(peer, reason) {
    peer.expected = true;
    peer.ws.close(1000, reason);
  }

  // `clientAddress`: the player's real address (for kicks and the log); `admit(user)`
  // a reason to refuse that robot, or undefined.
  // `authenticate(sid, name)`: whether the session owns that robot (see the top).
  listen(ws, { addr, user, sid }, { clientAddress = "", admit = () => undefined, authenticate = () => false } = {}) {
    if (!addr || !user) return ws.close(1008, "addr and user required");
    ws.clientAddress = clientAddress;
    const refused = admit(user);
    if (refused) return ws.close(1008, refused);
    const authenticated = !!sid && authenticate(sid, user);
    const previous = this.hosts.get(addr);
    // A listener with a session gives way only to the same account (the same tab back in the lobby, maybe with another robot).
    if (previous?.authenticated && !(authenticated && (sameName(previous.user, user) || authenticate(sid, previous.user)))) {
      this.log(`relay: ${user} refused at ${addr} (${previous.user} listens there, ${clientAddress})`);
      return ws.close(1008, "address in use");
    }
    const host = { ws, user, authenticated, peers: new Map(), state: { buffer: Buffer.alloc(0) } };
    this.hosts.set(addr, host);
    if (previous) {
      previous.replaced = true;
      previous.ws.close(1000, "replaced");
    }
    this.log(`relay: ${user} listening at ${addr}${authenticated ? "" : " (no session)"}`);
    const allowed = this.meter(ws, () => user);

    ws.on("message", (data, isBinary) => {
      if (!allowed(data.length)) return;
      if (!isBinary) return this.control(ws, host, null, data);
      for (const frame of this.frames(ws, user, host.state, data)) {
        let env;
        try {
          env = parseEnvelope(frame);
        } catch {
          continue;
        }
        if (env.recipients.length === 1 && env.recipients[0] === "System") {
          if (env.subject === "BreakConnection") {
            const peer = host.peers.get(this.contentString(env.content)?.toLowerCase());
            if (peer) this.dropPeer(peer, "breakConnection");
          }
          continue;
        }
        for (const peer of this.recipientsOf(host, env.recipients)) this.forward(peer.ws, frame);
      }
    });
    ws.on("close", () => {
      if (this.hosts.get(addr) === host) this.hosts.delete(addr);
      for (const peer of host.peers.values()) {
        this.notify(peer.ws, { errorCode: ERR_NO_CONNECTION, subject: "ConnectionProblem", sender: user, recipient: peer.name });
        this.dropPeer(peer, "host left");
        if (host.authenticated && !host.replaced) this.onLeave(user, peer.name);
      }
      this.log(`relay: ${user} stopped listening`);
    });
  }

  // Peers are matched by the userID they logged on with. The game addresses
  // its opponent by a name decoded from the IRC nick, so with a single peer
  // any name reaches it.
  recipientsOf(host, recipients) {
    const peers = [...host.peers.values()];
    if (recipients.length === 0 || recipients.includes("*")) return peers;
    const named = recipients.map((r) => host.peers.get(r.toLowerCase())).filter(Boolean);
    if (named.length) return [...new Set(named)];
    return peers.length === 1 ? peers : [];
  }

  /** The complete SMUS frames in a message (none, and the socket closed, for an oversized one). */
  frames(ws, who, state, data) {
    try {
      return takeFrames(state, Buffer.from(data), this.limits.wsMaxPayload);
    } catch (e) {
      if (!(e instanceof FrameTooLarge)) throw e;
      state.buffer = Buffer.alloc(0);
      this.overLimit(ws, who, e.message);
      return [];
    }
  }

  connect(ws, { addr, sid }, { clientAddress = "", admit = () => undefined, authenticate = () => false } = {}) {
    const host = this.hosts.get(addr);
    const state = { buffer: Buffer.alloc(0) };
    let peer = null;
    ws.clientAddress = clientAddress;

    if (!host) {
      ws.send(buildMessage({
        errorCode: ERR_NO_CONNECTION,
        subject: "ConnectToNetServer",
        sender: "System",
        recipients: ["*"],
      }));
      return ws.close(1000, "nobody listening");
    }

    const allowed = this.meter(ws, () => peer?.name ?? `a peer of ${host.user}`);
    ws.on("message", (data, isBinary) => {
      if (!allowed(data.length)) return;
      if (!isBinary) return this.control(ws, host, peer, data);
      for (const frame of this.frames(ws, peer?.name ?? "a peer", state, data)) {
        let env;
        try {
          env = parseEnvelope(frame);
        } catch {
          continue;
        }
        if (!peer) {
          // First frame is the Logon; its sender is the peer's userID.
          const refused = admit(env.sender);
          if (refused) return ws.close(1008, refused);
          const { relayPeersPerHost } = this.limits;
          if (relayPeersPerHost && host.peers.size >= relayPeersPerHost && !host.peers.has(env.sender.toLowerCase())) {
            return this.overLimit(ws, env.sender, "too many peers");
          }
          const authenticated = !!sid && authenticate(sid, env.sender);
          const key = env.sender.toLowerCase();
          const replaced = host.peers.get(key);
          if (replaced?.authenticated && !authenticated) {
            this.log(`relay: ${env.sender} refused by ${host.user} (connected with a session, ${clientAddress})`);
            return ws.close(1008, "name in use");
          }
          peer = { ws, name: env.sender, expected: false, authenticated };
          host.peers.set(key, peer);
          if (replaced) this.dropPeer(replaced, "replaced");
          this.log(`relay: ${peer.name} connected to ${host.user}`);
          this.notify(host.ws, { subject: "WaitForNetConnection", sender: peer.name, recipient: host.user });
          if (env.subject === "Logon") continue;
        }
        this.forward(host.ws, frame);
      }
    });
    ws.on("close", () => {
      if (!peer || host.peers.get(peer.name.toLowerCase()) !== peer) return;
      host.peers.delete(peer.name.toLowerCase());
      if (!peer.expected) {
        this.notify(host.ws, { errorCode: ERR_NO_CONNECTION, subject: "ConnectionProblem", sender: peer.name, recipient: host.user });
        if (peer.authenticated) this.onLeave(peer.name, host.user);
      }
      this.log(`relay: ${peer.name} left ${host.user}`);
    });
  }

  // A text frame: a control message (see the top of this file).
  control(ws, host, peer, data) {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== "string") return;
    const send = (to, m) => to?.readyState === to?.OPEN && to.send(JSON.stringify(m));
    if (msg.t === "hello" || msg.t === "time") {
      ws.signalling = true;
      return send(ws, { t: msg.t, c: msg.c, now: this.now(), ...(msg.t === "hello" ? { iceServers: this.iceServers } : {}) });
    }
    let target, out;
    if (ws === host.ws) {
      target = host.peers.get(String(msg.to ?? "").toLowerCase())?.ws;
      out = { ...msg, to: undefined };
    } else {
      if (!peer) return; // before its Logon
      target = host.ws;
      out = { ...msg, from: peer.name };
    }
    if (target?.signalling && target.readyState === target.OPEN) send(target, out);
    else if (msg.t !== "unsupported") send(ws, { t: "unsupported", from: ws === host.ws ? msg.to : undefined });
  }

  contentString(content) {
    // [u16 tag=3][u32 len][bytes]
    if (content.length < 6 || content.readUInt16BE(0) !== 3) return null;
    const len = content.readUInt32BE(2);
    return content.subarray(6, 6 + len).toString("latin1");
  }
}
