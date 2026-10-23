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

// Split a byte stream into complete SMUS frames, keeping any remainder.
function takeFrames(state, chunk) {
  state.buffer = state.buffer.length ? Buffer.concat([state.buffer, chunk]) : chunk;
  const frames = [];
  while (state.buffer.length >= 6) {
    if (state.buffer.readUInt16BE(0) !== MUS_HEADER) {
      state.buffer = Buffer.alloc(0);
      break;
    }
    const total = 6 + state.buffer.readUInt32BE(2);
    if (state.buffer.length < total) break;
    frames.push(state.buffer.subarray(0, total));
    state.buffer = state.buffer.subarray(total);
  }
  return frames;
}

export class Relay {
  constructor({ log }) {
    this.log = log;
    this.hosts = new Map(); // address -> { ws, user, peers: Map<lowercased userID, peer> }
    this.epoch = Date.now();
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

  listen(ws, { addr, user }) {
    if (!addr || !user) return ws.close(1008, "addr and user required");
    const previous = this.hosts.get(addr);
    const host = { ws, user, peers: new Map(), state: { buffer: Buffer.alloc(0) } };
    this.hosts.set(addr, host);
    previous?.ws.close(1000, "replaced");
    this.log(`relay: ${user} listening at ${addr}`);

    ws.on("message", (data) => {
      for (const frame of takeFrames(host.state, Buffer.from(data))) {
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

  connect(ws, { addr }) {
    const host = this.hosts.get(addr);
    const state = { buffer: Buffer.alloc(0) };
    let peer = null;

    if (!host) {
      ws.send(buildMessage({
        errorCode: ERR_NO_CONNECTION,
        subject: "ConnectToNetServer",
        sender: "System",
        recipients: ["*"],
      }));
      return ws.close(1000, "nobody listening");
    }

    ws.on("message", (data) => {
      for (const frame of takeFrames(state, Buffer.from(data))) {
        let env;
        try {
          env = parseEnvelope(frame);
        } catch {
          continue;
        }
        if (!peer) {
          // First frame is the Logon; its sender is the peer's userID.
          peer = { ws, name: env.sender, expected: false };
          const key = peer.name.toLowerCase();
          const replaced = host.peers.get(key);
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
      }
      this.log(`relay: ${peer.name} left ${host.user}`);
    });
  }

  contentString(content) {
    // [u16 tag=3][u32 len][bytes]
    if (content.length < 6 || content.readUInt16BE(0) !== 3) return null;
    const len = content.readUInt32BE(2);
    return content.subarray(6, 6 + len).toString("latin1");
  }
}
