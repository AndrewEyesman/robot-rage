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
// the bytes untouched.

const MUS_HEADER = 0x7200;
// Multiuser Xtra "no current connection" error, which the client handles.
const ERR_NO_CONNECTION = -2147216214;

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
  pos += 8; // error code + timestamp
  const subject = readString();
  const sender = readString();
  const count = view.getUint32(pos);
  pos += 4;
  const recipients = [];
  for (let i = 0; i < count; i++) recipients.push(readString());
  const content = frame.subarray(pos);
  return { errorCode, subject, sender, recipients, content };
}

export function buildMessage({ errorCode = 0, subject, sender, recipients, contentString }) {
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
  head.writeUInt32BE(0, 4);
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
    this.hosts = new Map(); // address -> { ws, user, peers: Map<lowercased userID, ws> }
  }

  listen(ws, { addr, user }) {
    if (!addr || !user) return ws.close(1008, "addr and user required");
    this.hosts.get(addr)?.ws.close(1000, "replaced");
    const host = { ws, user, peers: new Map(), state: { buffer: Buffer.alloc(0) } };
    this.hosts.set(addr, host);
    this.log(`relay: ${user} listening at ${addr}`);

    ws.on("message", (data) => {
      for (const frame of takeFrames(host.state, Buffer.from(data))) {
        let env;
        try {
          env = parseEnvelope(frame);
        } catch {
          continue;
        }
        if (env.subject === "BreakConnection" && env.recipients[0] === "System") {
          const peerName = this.contentString(env.content);
          host.peers.get(peerName?.toLowerCase())?.close(1000, "breakConnection");
          continue;
        }
        for (const recipient of env.recipients) {
          host.peers.get(recipient.toLowerCase())?.send(frame);
        }
      }
    });
    ws.on("close", () => {
      if (this.hosts.get(addr) === host) this.hosts.delete(addr);
      for (const peer of host.peers.values()) peer.close(1001, "host left");
      this.log(`relay: ${user} stopped listening`);
    });
  }

  connect(ws, { addr }) {
    const host = this.hosts.get(addr);
    const state = { buffer: Buffer.alloc(0) };
    let peerName = null;

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
        if (!peerName) {
          // First frame is the Logon; its sender is the peer's userID.
          peerName = env.sender;
          host.peers.get(peerName.toLowerCase())?.close(1000, "replaced");
          host.peers.set(peerName.toLowerCase(), ws);
          this.log(`relay: ${peerName} connected to ${host.user}`);
          if (env.subject === "Logon") continue;
        }
        if (host.ws.readyState === host.ws.OPEN) host.ws.send(frame);
      }
    });
    ws.on("close", () => {
      if (peerName && host.peers.get(peerName.toLowerCase()) === ws) {
        host.peers.delete(peerName.toLowerCase());
        this.log(`relay: ${peerName} left ${host.user}`);
      }
    });
  }

  contentString(content) {
    // [u16 tag=3][u32 len][bytes]
    if (content.length < 6 || content.readUInt16BE(0) !== 3) return null;
    const len = content.readUInt32BE(2);
    return content.subarray(6, 6 + len).toString("latin1");
  }
}
