// Limits for a server open to the public: the client's address behind a proxy,
// rate limits per address and per account, and the caps on WebSocket connections.
// Everything is in memory (a restart forgets it) and configurable by environment;
// the defaults are generous enough that real play, and the regression suite's
// many logins from one machine, never meet them.
//
// TRUST_PROXY: where the client's address comes from.
//   (unset)      the socket's address: the server is reached directly
//   cloudflare   the CF-Connecting-IP header (a Cloudflare Tunnel): then only the
//                tunnel may reach the port, or anyone can claim any address
//   xff          the last X-Forwarded-For hop (one reverse proxy in front)

const int = (env, name, fallback) => {
  const v = env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number >= 0, not ${JSON.stringify(v)}`);
  return n;
};

const flag = (env, name) => {
  const v = (env[name] ?? "").trim();
  if (!["", "0", "1"].includes(v)) throw new Error(`${name} must be 1, 0 or unset, not ${JSON.stringify(env[name])}`);
  return v === "1";
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The limits, from the environment (each variable named next to its default). */
export function loadLimits(env = process.env) {
  const trustProxy = (env.TRUST_PROXY ?? "").trim().toLowerCase();
  if (!["", "cloudflare", "xff"].includes(trustProxy)) throw new Error(`TRUST_PROXY must be cloudflare, xff or unset, not ${JSON.stringify(env.TRUST_PROXY)}`);
  return {
    trustProxy,
    // Logins: failures in a row (forgotten after LOGIN_FORGET_MIN without one) lock the
    // account name, or the address, for LOGIN_LOCK_MIN, doubling with each lockout up to
    // LOGIN_LOCK_MAX_MIN. A locked account name still logs in from an address it logged
    // in from before (since the server started), so a stranger can't lock its owner out.
    loginFailsPerAccount: int(env, "LOGIN_FAILS_PER_ACCOUNT", 5),
    loginFailsPerAddress: int(env, "LOGIN_FAILS_PER_ADDRESS", 20),
    loginLockMs: int(env, "LOGIN_LOCK_MIN", 1) * MINUTE,
    loginLockMaxMs: int(env, "LOGIN_LOCK_MAX_MIN", 60) * MINUTE,
    loginForgetMs: int(env, "LOGIN_FORGET_MIN", 60) * MINUTE,
    // New accounts per address per day.
    accountsPerDay: int(env, "ACCOUNTS_PER_DAY", 5),
    // main.asp requests per address per minute, and the largest request body.
    apiPerMinute: int(env, "API_PER_MIN", 600),
    apiMaxBody: int(env, "API_MAX_BODY_KB", 1024) * 1024,
    // WebSockets: open at once per address and in total, new ones per address per
    // minute, the largest message, and the heartbeat (a socket that doesn't answer a
    // ping within one interval is closed).
    wsPerAddress: int(env, "WS_PER_ADDRESS", 40),
    wsTotal: int(env, "WS_TOTAL", 2000),
    wsNewPerMinute: int(env, "WS_NEW_PER_MIN", 120),
    wsMaxPayload: int(env, "WS_MAX_PAYLOAD_KB", 256) * 1024,
    wsPingMs: int(env, "WS_PING_SEC", 30) * 1000,
    // The lobby (IRC): the longest line, lines per connection per 10 s (more closes the
    // connection), chat messages to a room per 10 s (more are dropped), and how long a
    // connection may take to register.
    ircMaxLine: int(env, "IRC_MAX_LINE", 1024),
    ircLinesPer10s: int(env, "IRC_LINES_PER_10S", 200),
    ircChatPer10s: int(env, "IRC_CHAT_PER_10S", 10),
    ircRegisterMs: int(env, "IRC_REGISTER_SEC", 60) * 1000,
    // The match relay, per socket: messages and bytes per second (averaged over a 2 s
    // burst; more closes the socket, which the game takes as the player leaving), and
    // peers per listening host.
    relayMsgsPerSec: int(env, "RELAY_MSGS_PER_SEC", 1000),
    relayBytesPerSec: int(env, "RELAY_KB_PER_SEC", 1024) * 1024,
    relayPeersPerHost: int(env, "RELAY_PEERS_PER_HOST", 8),
    // A match connection's socket that keeps alive (relay.mjs) and is silent this long is
    // closed, as its player leaving: the arena's own walkover comes after 20 s of silence too.
    relaySilentMs: int(env, "RELAY_SILENT_SEC", 20) * 1000,
    // Ranked results (results.mjs): how close together a round's two reports must arrive,
    // and the ranked matches two accounts may play each other a day (later ones play
    // unranked, against trading wins between one person's accounts). 0, the default, is
    // no limit: with few players, the same two often play each other all evening.
    reportWindowMs: int(env, "REPORT_WINDOW_SEC", 30) * 1000,
    rankedPerPairPerDay: int(env, "RANKED_PER_PAIR_PER_DAY", 0),
    // Error reports from players' browsers (clienterrors.mjs), errors per address per minute.
    clientErrorsPerMinute: int(env, "CLIENT_ERRORS_PER_MIN", 30),
    // Sessions expire after this long unused (each use refreshes them).
    sessionTtlMs: int(env, "SESSION_DAYS", 30) * DAY,
    // Sessions where the original sent none (1 to require, default off, so the original
    // game in dirplayer and older clients keep working). IRC_REQUIRE_SESSION: the lobby
    // takes a nick only with a session that owns the nick's robot as PASS. MAP_REQUIRE_SESSION:
    // paint map saves (setrobotmap) only with a session, not on the owner's address. The
    // port's client sends both (gameFixes.ircAuth, gameFixes.mapSession).
    ircRequireSession: flag(env, "IRC_REQUIRE_SESSION"),
    mapRequireSession: flag(env, "MAP_REQUIRE_SESSION"),
  };
}

export const LIMITS = loadLimits();

/** An address as one key: IPv4-mapped IPv6 addresses as plain IPv4. */
export function normalizeAddress(address) {
  const a = String(address ?? "").trim().toLowerCase();
  return a.startsWith("::ffff:") && a.includes(".") ? a.slice(7) : a;
}

let warnedProxy = false;
/** The client's address for a request (HTTP or WebSocket upgrade), as TRUST_PROXY says. */
export function clientAddress(req, trustProxy = LIMITS.trustProxy, log) {
  const socket = normalizeAddress(req.socket.remoteAddress);
  const header = (name) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v.at(-1) : v;
  };
  if (trustProxy === "cloudflare") {
    const cf = header("cf-connecting-ip");
    return cf ? normalizeAddress(cf) : socket;
  }
  if (trustProxy === "xff") {
    const hops = String(header("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return hops.length ? normalizeAddress(hops.at(-1)) : socket;
  }
  if (!warnedProxy && log && (header("cf-connecting-ip") || header("x-forwarded-for"))) {
    warnedProxy = true;
    log("warning: requests come through a proxy but TRUST_PROXY is unset, so every player shares its address (and its limits)");
  }
  return socket;
}

/**
 * At most `limit` hits per key in each `windowMs` (fixed windows). A limit of 0
 * turns it off.
 */
export class Window {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.counts = new Map(); // key -> { start, n }
  }

  /** Counts a hit; false when the key is over its limit (the hit isn't counted then). */
  hit(key, now = Date.now()) {
    if (!this.limit) return true;
    let c = this.counts.get(key);
    if (!c || now - c.start >= this.windowMs) {
      c = { start: now, n: 0 };
      this.counts.set(key, c);
    }
    if (c.n >= this.limit) return false;
    c.n++;
    return true;
  }

  /** Whether the key could hit now, without counting. */
  allows(key, now = Date.now()) {
    const c = this.counts.get(key);
    return !this.limit || !c || now - c.start >= this.windowMs || c.n < this.limit;
  }

  sweep(now = Date.now()) {
    for (const [key, c] of this.counts) if (now - c.start >= this.windowMs) this.counts.delete(key);
  }
}

/**
 * Failed attempts per key: `fails` in a row (a gap of `forgetMs` without one starts
 * over) lock the key for `lockMs`, doubling with each lockout up to `maxMs`.
 * `fails` 0 turns it off.
 */
export class Lockout {
  constructor({ fails, lockMs, maxMs, forgetMs }) {
    Object.assign(this, { fails, lockMs, maxMs, forgetMs });
    this.state = new Map(); // key -> { fails, lockouts, until, last }
  }

  /** Milliseconds the key stays locked, or 0. */
  locked(key, now = Date.now()) {
    const s = this.state.get(key);
    return s && s.until > now ? s.until - now : 0;
  }

  fail(key, now = Date.now()) {
    if (!this.fails) return;
    let s = this.state.get(key);
    if (!s || (now - s.last > this.forgetMs && s.until <= now)) s = { fails: 0, lockouts: 0, until: 0, last: now };
    s.fails++;
    s.last = now;
    if (s.fails >= this.fails) {
      s.lockouts++;
      s.fails = 0;
      s.until = now + Math.min(this.maxMs, this.lockMs * 2 ** (s.lockouts - 1));
    }
    this.state.set(key, s);
  }

  succeed(key) {
    this.state.delete(key);
  }

  sweep(now = Date.now()) {
    for (const [key, s] of this.state) if (s.until <= now && now - s.last > this.forgetMs) this.state.delete(key);
  }
}

/**
 * A token bucket for one connection: `rate` per second on average, `burst` at once.
 * `rate` 0 turns it off.
 */
export class Bucket {
  constructor(rate, burst = rate) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = Date.now();
  }

  /** Takes `n` tokens; false when there aren't enough (none are taken then). */
  take(n = 1, now = Date.now()) {
    if (!this.rate) return true;
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/**
 * The WebSocket caps: connections open per address and in total, new connections
 * per address per minute, and the heartbeat that closes sockets that stopped
 * answering (a closed laptop, a dropped network).
 */
export class SocketGuard {
  constructor(limits = LIMITS, log = () => {}) {
    this.limits = limits;
    this.log = log;
    this.open = new Map(); // address -> Set<ws>
    this.total = 0;
    this.newPerMinute = new Window(limits.wsNewPerMinute, MINUTE);
    if (limits.wsPingMs) {
      this.timer = setInterval(() => this.heartbeat(), limits.wsPingMs);
      this.timer.unref();
    }
  }

  /** Why a new connection from `address` is refused (an HTTP status and text), or undefined. */
  refuse(address) {
    const { wsTotal, wsPerAddress } = this.limits;
    if (wsTotal && this.total >= wsTotal) return [503, "Service Unavailable"];
    if (wsPerAddress && (this.open.get(address)?.size ?? 0) >= wsPerAddress) return [429, "Too Many Requests"];
    if (!this.newPerMinute.hit(address)) return [429, "Too Many Requests"];
    return undefined;
  }

  /** Counts an accepted socket until it closes, and watches it with the heartbeat. */
  track(ws, address) {
    let set = this.open.get(address);
    if (!set) this.open.set(address, (set = new Set()));
    set.add(ws);
    this.total++;
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.once("close", () => {
      set.delete(ws);
      if (!set.size && this.open.get(address) === set) this.open.delete(address);
      this.total--;
    });
  }

  heartbeat() {
    this.newPerMinute.sweep();
    for (const set of this.open.values()) {
      for (const ws of set) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        try {
          ws.ping();
        } catch {
          // closing already
        }
      }
    }
  }
}
