// The Multiuser Xtra (new(xtra("Multiuser"))), over the game server's WebSockets, the
// way the dirplayer page connects it (public/index.html, server/relay.mjs):
//
// - connectToNetServer to an IRC port of main.ini in #text mode: /ws/irc?addr=<tab
//   address>. Text frames carry raw IRC lines both ways.
// - connectToNetServer(..., host, 1626, ...): /ws/p2p/connect?addr=<host>, binary SMUS
//   frames. The first frame is the Logon, whose sender names this peer at the relay.
// - waitForNetConnection([#userID: name, ...]): /ws/p2p/listen?addr=<tab address>&user=<name>.
//   Browsers can't listen; the relay forwards the peers that connect to this address.
//
// Messages reach scripts as Director delivers them: the most specific
// setNetMessageHandler registration (subject+sender, subject, sender, default) is
// called between frames (or from checkNetMessages), with the message property list
// [#errorCode, #recipients, #senderID, #subject, #content, #timeStamp] when
// passMessage is set; otherwise the message waits for getNetMessage().
//
// Where dirplayer is known to differ from Director (docs/inventory.md), this follows
// Director: points and rects keep float components, sendNetMessage returns an error
// code instead of failing, a lost connection is reported with Multiuser's own
// "no current connection" code, and getPeerConnectionList lists a listener's peers.

import { invoke } from './dispatch';
import { myAddress, player } from './api';
import { warnOnce } from './player';
import { byteToChar, charToByte } from '../lingo/charset';
import { LFloat, LList, LPoint, LPropList, LRect, LSymbol, isInt, lingoString, num, sym, type LValue } from '../lingo';

/** "There is no current connection": a connection that failed or went away. The arena and lobby test for it. */
export const ERR_NO_CONNECTION = -2147216214;

const MUS_HEADER = 0x7200;
/** The IRC ports main.ini lists (ircports); everything else is a peer on port 1626. */
const IRC_PORTS = new Set([8777, 8778, 8779, 8780, 8781]);

export interface MultiuserMessage {
  errorCode: number;
  recipients: string[];
  senderID: string;
  subject: string;
  content: LValue;
  timeStamp: number;
}

interface Registration {
  handler: string;
  /** VOID or 0: a movie-script handler, called as handler(0, message). */
  target: object | undefined;
  subject: string | undefined;
  sender: string | undefined;
  passMessage: boolean;
}

const unset = (v: unknown) => v === undefined || v === 0 || v === '' || v === null;
const str = (v: unknown) => (typeof v === 'string' ? v : lingoString(v as LValue));

function wsBase() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

/** The message as the property list scripts receive. */
export function messageList(m: MultiuserMessage): LPropList {
  return new LPropList([
    [sym('errorCode'), m.errorCode],
    [sym('recipients'), new LList([...m.recipients])],
    [sym('senderID'), m.senderID],
    [sym('subject'), m.subject],
    [sym('content'), m.content],
    [sym('timeStamp'), m.timeStamp],
  ]);
}

/** A property list's value by key name, whether the key is a symbol or a string. */
function propOf(l: LPropList, name: string): LValue {
  for (let i = 1; i <= l.count; i++) {
    const k = l.getPropAt(i);
    const kn = k instanceof LSymbol ? k.name : typeof k === 'string' ? k : undefined;
    if (kn !== undefined && kn.toLowerCase() === name.toLowerCase()) return l.getAt(i);
  }
  return undefined;
}

export class MultiuserXtra {
  private ws: WebSocket | null = null;
  private mode: 'smus' | 'text' = 'smus';
  private registrations: Registration[] = [];
  /** Arrived, not yet dispatched (Director hands messages to scripts between frames). */
  private incoming: MultiuserMessage[] = [];
  /** Dispatched without passMessage, or with no handler: for getNetMessage(). */
  private waiting: MultiuserMessage[] = [];
  private pendingOut: (Uint8Array | string)[] = [];
  private userID = '';
  private listener = false;
  private peers: string[] = [];
  private opened = false;
  private closedByUs = false;
  private scheduled = false;
  private recvBuffer = new Uint8Array(0);

  /** setNetMessageHandler(#handler, scriptObject, subject, sender, passMessage) */
  setNetMessageHandler(handler: unknown, target?: unknown, subject?: unknown, sender?: unknown, passMessage?: unknown): number {
    const s = unset(subject) ? undefined : str(subject).toLowerCase();
    const f = unset(sender) ? undefined : str(sender).toLowerCase();
    // A registration is keyed by its filters: registering again replaces it, handler 0 removes it.
    this.registrations = this.registrations.filter((r) => r.subject !== s || r.sender !== f);
    if (!unset(handler)) {
      this.registrations.push({
        handler: handler instanceof LSymbol ? handler.name : str(handler),
        target: unset(target) || typeof target !== 'object' ? undefined : (target as object),
        subject: s,
        sender: f,
        passMessage: !!num(passMessage as LValue),
      });
    }
    return 0;
  }

  /**
   * connectToNetServer(userName, password, serverID, port, movieID [, mode, encryptionKey])
   * connectToNetServer(serverID, port, [#userID:, #password:, #movieID:], mode [, encryptionKey])
   * Mode is #smus (or 0) or #text (or 1).
   */
  connectToNetServer(...args: unknown[]): number {
    let user: string, password: string, host: string, port: number, movieID: string, mode: unknown;
    if (args[2] instanceof LPropList) {
      host = str(args[0]);
      port = num(args[1] as LValue);
      user = str(propOf(args[2], 'userID'));
      password = str(propOf(args[2], 'password'));
      movieID = str(propOf(args[2], 'movieID'));
      mode = args[3];
    } else {
      user = str(args[0]);
      password = str(args[1]);
      host = str(args[2]);
      port = num(args[3] as LValue);
      movieID = str(args[4]);
      mode = args[5];
    }
    this.mode = (mode instanceof LSymbol && mode.name.toLowerCase() === 'text') || mode === 1 ? 'text' : 'smus';
    this.userID = user;
    this.listener = false;
    const url = IRC_PORTS.has(port) ? `${wsBase()}/ws/irc?addr=${encodeURIComponent(myAddress())}` : port === 1626 ? `${wsBase()}/ws/p2p/connect?addr=${encodeURIComponent(host)}` : '';
    if (!url) {
      warnOnce(`Multiuser: no route to ${host}:${port}`);
      this.receive({ errorCode: ERR_NO_CONNECTION, recipients: [user], senderID: 'System', subject: 'ConnectToNetServer', content: undefined, timeStamp: 0 });
      return 0;
    }
    // The Logon goes first; Director encrypts its content, which the relay never reads.
    const logon = this.mode === 'smus' ? encodeMessage({ errorCode: 0, recipients: ['System'], senderID: user, subject: 'Logon', content: new LList([movieID, user, password]), timeStamp: 0 }) : null;
    this.open(url, logon, true);
    return 0;
  }

  /** waitForNetConnection(userID or [#userID:, #maxConnections:, #localTCPPort:...]) */
  waitForNetConnection(arg: unknown, ..._rest: unknown[]): number {
    const user = arg instanceof LPropList ? str(propOf(arg, 'userID')) : str(arg);
    this.userID = user;
    this.mode = 'smus';
    this.listener = true;
    this.peers = [];
    this.open(`${wsBase()}/ws/p2p/listen?addr=${encodeURIComponent(myAddress())}&user=${encodeURIComponent(user)}`, null, false);
    return 0;
  }

  /**
   * sendNetMessage(recipients, subject, content) or
   * sendNetMessage([#recipients:, #subject:, #content:, #udp:]). Recipients are a name or
   * a list of names. In #text mode only the content goes out, as text.
   */
  sendNetMessage(a: unknown, subject?: unknown, content?: unknown): number {
    let recipients: unknown = a;
    if (a instanceof LPropList && subject === undefined && content === undefined) {
      recipients = propOf(a, 'recipients');
      subject = propOf(a, 'subject');
      content = propOf(a, 'content');
      // #udp: there is no UDP over a WebSocket.
    }
    if (!this.ws || this.closedByUs || this.ws.readyState > WebSocket.OPEN) return ERR_NO_CONNECTION;
    if (this.mode === 'text') {
      this.send(str(content));
      return 0;
    }
    const names = recipients instanceof LList ? recipients.items.map(str) : unset(recipients) ? [] : [str(recipients)];
    this.send(encodeMessage({ errorCode: 0, recipients: names, senderID: this.userID, subject: subject === undefined ? '' : str(subject), content: content as LValue, timeStamp: 0 }));
    return 0;
  }

  /** The oldest message waiting, or an empty message when there is none. */
  getNetMessage(): LPropList {
    const m = this.waiting.shift();
    return messageList(m ?? { errorCode: 0, recipients: [], senderID: '', subject: '', content: undefined, timeStamp: 0 });
  }

  getNumberWaitingNetMessages(): number {
    return this.waiting.length + this.incoming.length;
  }

  /** checkNetMessages(n): hand up to n arrived messages to the scripts now. */
  checkNetMessages(n?: unknown): number {
    this.drain(n === undefined ? Infinity : Math.max(1, num(n as LValue)));
    return 0;
  }

  /** breakConnection(peer) on a listener drops that peer; otherwise closes the connection. */
  breakConnection(peer?: unknown): number {
    if (this.listener && !unset(peer)) {
      const name = str(peer);
      this.send(encodeMessage({ errorCode: 0, recipients: ['System'], senderID: this.userID, subject: 'BreakConnection', content: name, timeStamp: 0 }));
      this.peers = this.peers.filter((p) => p.toLowerCase() !== name.toLowerCase());
      return 0;
    }
    this.dispose();
    return 0;
  }

  /**
   * Director closes an instance's connection when the last reference to it goes away.
   * JavaScript can't see that, so translations call dispose() where the original drops
   * its instance (gMultiuserInstanceIRC = VOID).
   */
  dispose() {
    this.closedByUs = true;
    this.pendingOut = [];
    this.ws?.close(1000);
    this.ws = null;
  }

  /**
   * The machine's addresses. The page has none to give, so it answers "" like dirplayer;
   * the game then shares IP 0 and the server substitutes the relay address (docs/notes.md).
   */
  getNetAddressCookie(_encrypted?: unknown, _index?: unknown): string {
    return '';
  }

  /** The userIDs of the peers connected to this listener. */
  getPeerConnectionList(): LList {
    return new LList([...this.peers]);
  }

  getNetErrorString(code: unknown): string {
    const n = num(code as LValue);
    if (n === 0) return 'No error.';
    if (n === ERR_NO_CONNECTION) return 'There is no current connection.';
    return `Unknown error (${n}).`;
  }

  setNetBufferLimits(..._args: unknown[]): number {
    return 0;
  }

  // ---------------------------------------------------------------- transport

  private open(url: string, logon: Uint8Array | null, announce: boolean) {
    this.dispose();
    this.closedByUs = false;
    this.opened = false;
    this.recvBuffer = new Uint8Array(0);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.receive({ errorCode: ERR_NO_CONNECTION, recipients: [this.userID], senderID: 'System', subject: 'ConnectToNetServer', content: undefined, timeStamp: 0 });
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    const current = () => this.ws === ws && !this.closedByUs;
    ws.onopen = () => {
      if (!current()) return;
      this.opened = true;
      if (logon) ws.send(logon);
      for (const out of this.pendingOut.splice(0)) ws.send(out);
      if (announce) this.receive({ errorCode: 0, recipients: [this.userID], senderID: 'System', subject: 'ConnectToNetServer', content: undefined, timeStamp: 0 });
    };
    ws.onmessage = (e) => {
      if (!current()) return;
      if (typeof e.data === 'string') {
        this.receive({ errorCode: 0, recipients: [this.userID], senderID: 'System', subject: 'String', content: e.data, timeStamp: 0 });
      } else if (this.mode === 'text') {
        let s = '';
        for (const b of new Uint8Array(e.data as ArrayBuffer)) s += byteToChar(b);
        this.receive({ errorCode: 0, recipients: [this.userID], senderID: 'System', subject: 'String', content: s, timeStamp: 0 });
      } else {
        this.receiveBytes(new Uint8Array(e.data as ArrayBuffer));
      }
    };
    // Browsers follow an error with close; some WebSocket implementations stop at the error.
    ws.onclose = ws.onerror = () => {
      if (!current()) return;
      this.ws = null;
      // A connection that never opened failed to connect; one that did was lost.
      this.receive({ errorCode: ERR_NO_CONNECTION, recipients: [this.userID], senderID: 'System', subject: this.opened ? 'ConnectionProblem' : 'ConnectToNetServer', content: undefined, timeStamp: 0 });
    };
  }

  private send(data: Uint8Array | string) {
    const ws = this.ws;
    if (!ws) return;
    if (ws.readyState === WebSocket.CONNECTING) this.pendingOut.push(data);
    else if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  private receiveBytes(chunk: Uint8Array) {
    const buf = new Uint8Array(this.recvBuffer.length + chunk.length);
    buf.set(this.recvBuffer);
    buf.set(chunk, this.recvBuffer.length);
    let pos = 0;
    while (buf.length - pos >= 6) {
      const view = new DataView(buf.buffer, buf.byteOffset + pos);
      if (view.getUint16(0) !== MUS_HEADER) {
        pos = buf.length;
        break;
      }
      const total = 6 + view.getUint32(2);
      if (buf.length - pos < total) break;
      try {
        this.receive(decodeMessage(buf.subarray(pos + 6, pos + total)));
      } catch (e) {
        console.warn('Multiuser: bad message', e);
      }
      pos += total;
    }
    this.recvBuffer = buf.slice(pos);
  }

  /** A message arrived (or the Xtra made one): queue it for the next dispatch. */
  private receive(m: MultiuserMessage) {
    if (this.listener) {
      // The relay announces each peer that logs on, and reports the ones that go away.
      if (m.subject === 'WaitForNetConnection' && m.errorCode === 0 && !this.peers.some((p) => p.toLowerCase() === m.senderID.toLowerCase())) this.peers.push(m.senderID);
      if (m.errorCode !== 0) this.peers = this.peers.filter((p) => p.toLowerCase() !== m.senderID.toLowerCase());
    }
    this.incoming.push(m);
    if (!this.scheduled) {
      this.scheduled = true;
      setTimeout(() => {
        this.scheduled = false;
        this.drain(Infinity);
      }, 0);
    }
  }

  private drain(n: number) {
    while (n-- > 0 && this.incoming.length) this.dispatch(this.incoming.shift()!);
  }

  private dispatch(m: MultiuserMessage) {
    let best: Registration | undefined;
    let bestRank = -1;
    for (const r of this.registrations) {
      if (r.subject !== undefined && r.subject !== m.subject.toLowerCase()) continue;
      if (r.sender !== undefined && r.sender !== m.senderID.toLowerCase()) continue;
      const rank = (r.subject !== undefined ? 2 : 0) + (r.sender !== undefined ? 1 : 0);
      if (rank > bestRank) {
        best = r;
        bestRank = rank;
      }
    }
    if (!best) {
      this.waiting.push(m);
      return;
    }
    const args: unknown[] = [];
    if (best.passMessage) args.push(messageList(m));
    else this.waiting.push(m);
    try {
      if (best.target) invoke(best.target, best.handler, args);
      else {
        const h = player?.movieHandler(best.handler);
        if (h) h(0, ...args);
        else warnOnce(`Multiuser: no movie handler ${best.handler}`);
      }
    } catch (e) {
      // As a script error in Director: reported, and the player carries on.
      console.error(e);
    }
  }
}

/** xtra("Multiuser"): new(xtra("Multiuser")) is `new (xtra('Multiuser'))()` or `newMultiuser()`. */
export function xtra(name: string): typeof MultiuserXtra {
  if (name.toLowerCase() !== 'multiuser') warnOnce(`xtra("${name}") is not part of the port`);
  return MultiuserXtra;
}

export function newMultiuser(): MultiuserXtra {
  return new MultiuserXtra();
}

// ---------------------------------------------------------------- SMUS encoding

// Lingo value tags in SMUS content.
const T_VOID = 0, T_INT = 1, T_SYMBOL = 2, T_STRING = 3, T_FLOAT = 6, T_LIST = 7, T_POINT = 8, T_RECT = 9, T_PROPLIST = 10, T_MEDIA = 20;

class Writer {
  private bytes: number[] = [];
  u16(n: number) {
    this.bytes.push((n >> 8) & 255, n & 255);
  }
  u32(n: number) {
    this.bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  }
  /** Strings are Windows-1252 bytes, padded to an even length. */
  string(s: string) {
    const b = [...s].map((c) => {
      const x = charToByte(c);
      return x >= 0 ? x : 63;
    });
    this.u32(b.length);
    this.bytes.push(...b);
    if (b.length % 2) this.bytes.push(0);
  }
  f64(x: number) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    for (let i = 0; i < 8; i++) this.bytes.push(dv.getUint8(i));
  }
  value(v: LValue) {
    if (v === undefined) this.u16(T_VOID);
    else if (isInt(v)) {
      this.u16(T_INT);
      this.u32(v | 0);
    } else if (typeof v === 'number' || v instanceof LFloat) {
      this.u16(T_FLOAT);
      this.f64(num(v));
    } else if (typeof v === 'string') {
      this.u16(T_STRING);
      this.string(v);
    } else if (v instanceof LSymbol) {
      this.u16(T_SYMBOL);
      this.string(v.name);
    } else if (v instanceof LList) {
      this.u16(T_LIST);
      this.u32(v.count);
      for (const x of v.items) this.value(x);
    } else if (v instanceof LPropList) {
      this.u16(T_PROPLIST);
      this.u32(v.count);
      for (let i = 1; i <= v.count; i++) {
        this.value(v.getPropAt(i));
        this.value(v.getAt(i));
      }
    } else if (v instanceof LPoint) {
      // Each component is a tagged value, so float points stay float.
      this.u16(T_POINT);
      this.value(v.locH);
      this.value(v.locV);
    } else if (v instanceof LRect) {
      this.u16(T_RECT);
      for (const x of [v.left, v.top, v.right, v.bottom]) this.value(x);
    } else if (v instanceof Uint8Array) {
      this.u16(T_MEDIA);
      this.u32(v.length);
      this.bytes.push(...v);
      if (v.length % 2) this.bytes.push(0);
    } else {
      // Colors, vectors, objects: the game never sends them.
      warnOnce(`Multiuser: can't send ${lingoString(v)}`);
      this.u16(T_VOID);
    }
  }
  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  pos = 0;
  private dv: DataView;
  constructor(private b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u16() {
    const n = this.dv.getUint16(this.pos);
    this.pos += 2;
    return n;
  }
  u32() {
    const n = this.dv.getUint32(this.pos);
    this.pos += 4;
    return n;
  }
  i32() {
    const n = this.dv.getInt32(this.pos);
    this.pos += 4;
    return n;
  }
  string() {
    const len = this.u32();
    if (this.pos + len > this.b.length) throw new Error('string past the end');
    let s = '';
    for (let i = 0; i < len; i++) s += byteToChar(this.b[this.pos + i]);
    this.pos += len + (len % 2);
    return s;
  }
  value(): LValue {
    const tag = this.u16();
    switch (tag) {
      case T_VOID:
        return undefined;
      case T_INT:
        return this.i32();
      case T_SYMBOL:
        return sym(this.string());
      case T_STRING:
        return this.string();
      case T_FLOAT: {
        const x = this.dv.getFloat64(this.pos);
        this.pos += 8;
        return Number.isInteger(x) ? new LFloat(x) : x;
      }
      case T_LIST: {
        const n = this.u32();
        const items: LValue[] = [];
        for (let i = 0; i < n; i++) items.push(this.value());
        return new LList(items);
      }
      case T_PROPLIST: {
        const n = this.u32();
        const entries: [LValue, LValue][] = [];
        for (let i = 0; i < n; i++) {
          const k = this.value();
          entries.push([k, this.value()]);
        }
        return new LPropList(entries);
      }
      case T_POINT:
        return new LPoint(this.value() as number, this.value() as number);
      case T_RECT:
        return new LRect(this.value() as number, this.value() as number, this.value() as number, this.value() as number);
      case T_MEDIA: {
        const len = this.u32();
        const data = this.b.slice(this.pos, this.pos + len);
        this.pos += len + (len % 2);
        return data;
      }
      default:
        throw new Error(`unknown SMUS value tag ${tag}`);
    }
  }
}

/** A whole SMUS frame: header 0x7200, payload length, then the message. */
export function encodeMessage(m: MultiuserMessage): Uint8Array {
  const w = new Writer();
  w.u32(m.errorCode | 0);
  w.u32(m.timeStamp >>> 0);
  w.string(m.subject);
  w.string(m.senderID);
  w.u32(m.recipients.length);
  for (const r of m.recipients) w.string(r);
  w.value(m.content);
  const payload = w.done();
  const out = new Uint8Array(6 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, MUS_HEADER);
  dv.setUint32(2, payload.length);
  out.set(payload, 6);
  return out;
}

/** A message from a frame's payload (after the 6-byte header). */
export function decodeMessage(payload: Uint8Array): MultiuserMessage {
  const r = new Reader(payload);
  const errorCode = r.i32();
  const timeStamp = r.u32();
  const subject = r.string();
  const senderID = r.string();
  const n = r.u32();
  const recipients: string[] = [];
  for (let i = 0; i < n; i++) recipients.push(r.string());
  const content = r.pos < payload.length ? r.value() : undefined;
  return { errorCode, recipients, senderID, subject, content, timeStamp };
}
