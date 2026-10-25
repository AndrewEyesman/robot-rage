// Robot Rage self-hosted server: static files, the game's HTTP backend, the
// IRC lobby and the peer relay, all on one port.
//
//   PORT=8080 DATA_DIR=./data node server/index.mjs     serves public/ (dirplayer)
//   APP_DIR=port/web/dist ...   serves the port's production build instead (hosting):
//     ASSETS_DIR (default port/assets) as /assets, and of GAME_DIR (default
//     public/game) only the files the port reads, never the original movies
//   ICE_SERVERS=stun:stun.example.org:3478 ...   STUN for direct matches (default Google's; '' for none)
//   ADMIN_TOKEN=<secret> ...   enables the admin actions (credits, kicks and bans), from this machine only
//   TRUST_PROXY=cloudflare|xff ...   the client's address from CF-Connecting-IP or the last
//     X-Forwarded-For hop (for limits, logs and bans); unset: the socket's
//   LOG_DIR=./logs LOG_DAYS=14 ...   also log to one file per day, deleted after LOG_DAYS
//   Limits (server/limits.mjs, defaults in brackets): LOGIN_FAILS_PER_ACCOUNT [5],
//     LOGIN_FAILS_PER_ADDRESS [20], LOGIN_LOCK_MIN [1, doubling], LOGIN_LOCK_MAX_MIN [60],
//     LOGIN_FORGET_MIN [60], ACCOUNTS_PER_DAY [5], API_PER_MIN [600], API_MAX_BODY_KB [1024],
//     WS_PER_ADDRESS [40], WS_TOTAL [2000], WS_NEW_PER_MIN [120], WS_MAX_PAYLOAD_KB [256],
//     WS_PING_SEC [30], IRC_MAX_LINE [1024], IRC_LINES_PER_10S [200], IRC_CHAT_PER_10S [10],
//     IRC_REGISTER_SEC [60], RELAY_MSGS_PER_SEC [1000], RELAY_KB_PER_SEC [1024],
//     RELAY_PEERS_PER_HOST [8], RELAY_SILENT_SEC [20], SESSION_DAYS [30], CLIENT_ERRORS_PER_MIN [30]; 0 turns a
//     limit off
//   IRC_REQUIRE_SESSION=1 ...   the lobby takes a nick only with a session owning its robot as
//     PASS (the port sends it; the original and dirplayer send none, so they can't join)
//   MAP_REQUIRE_SESSION=1 ...   paint map saves only with a session (the port sends it), not
//     on the address of the robot's owner (the original's garage sends none)

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Store } from "./store.mjs";
import { createApi } from "./api.mjs";
import { IrcServer, robotNameOfNick } from "./irc.mjs";
import { Relay } from "./relay.mjs";
import { LIMITS, SocketGuard, clientAddress } from "./limits.mjs";
import { createLog, redact } from "./logs.mjs";
import { createClientErrors } from "./clienterrors.mjs";
import { resolveIn, sendFile } from "./static.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || join(ROOT, "public"));
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
const APP_DIR = process.env.APP_DIR ? resolve(process.env.APP_DIR) : "";
const ASSETS_DIR = resolve(process.env.ASSETS_DIR || join(ROOT, "port/assets"));
const GAME_DIR = resolve(process.env.GAME_DIR || join(PUBLIC_DIR, "game"));
// The game files the port fetches itself (main.ini is generated): the login screen's
// bad-language list (port/web/src/director/net.ts). The movies are translated.
const GAME_FILES = new Set(["badlanguage.txt"]);

const log = createLog();
const store = new Store(join(DATA_DIR, "db.json"));
const handleMainAsp = createApi(store, log, {
  adminToken: process.env.ADMIN_TOKEN || "",
  kick: (who) => irc.kick(who) + relay.kick(who),
});
const clientErrors = createClientErrors(log, { perMinute: LIMITS.clientErrorsPerMinute });
const irc = new IrcServer({ log, motd: ["Welcome to your own Robot Rage server."] });
// STUN servers the page uses to connect a match's players directly (WebRTC); the
// relay stays the fallback, so no TURN. Comma-separated URLs, or a JSON
// RTCIceServer list; empty for host candidates only (one machine or one LAN).
function iceServers(value = "stun:stun.l.google.com:19302") {
  const v = value.trim();
  if (!v) return [];
  if (v.startsWith("[")) return JSON.parse(v);
  return [{ urls: v.split(",").map((u) => u.trim()).filter(Boolean) }];
}
const relay = new Relay({ log, iceServers: iceServers(process.env.ICE_SERVERS), onLeave: handleMainAsp.playerLeft });

// The game reads its server settings from main.ini. Hostnames ending in
// .robotrage.local never resolve; the page's socket resolver maps them to
// this server's WebSocket endpoints. There is no `fallbackip`: with one, the
// fan lobby wrapper first logs on to a Robot Rage relay server that this
// server does not implement, and the scripts it would need are compiled at
// runtime, which the emulator cannot do.
function mainIni(origin) {
  const api = `${origin}/api/`;
  return [
    "[info]",
    'version = "version 1.9"',
    'folder = ""',
    'ircprefix = "r"',
    `gurl = "${api}"`,
    `externalipurl = "${api}ip.php"`,
    `robotcounturl = "${api}robotcount.php"`,
    `ip2countryurl = "${api}ip2country.php"`,
    `passurl = "${api}sites/pass.php"`,
    `helpurl = "${api}sites/help.php"`,
    `subscribeurl = "${api}sites/subscribe.php"`,
    `shopurl = "${api}sites/shop.php"`,
    "debugplaybackenabled = false",
    "alwaysontop = false",
    "upnpenabled = false",
    "",
    "[server]",
    'ircip1 = "irc.robotrage.local"',
    'ircip2 = "irc.robotrage.local"',
    "ircwait = 50",
    "ircports = [8777, 8778, 8779, 8780, 8781]",
    "",
    "[defaultRooms]",
    'list = ["room1", "room2", "room3", "room4", "room5", "room6", "room7"]',
    "",
    "[filelist]",
    'arena = "arena104.dcr"',
    'factory = "factory0604.dcr"',
    'lobby = "lobby060.dcr"',
    'login = "login013.dcr"',
    'robotwars = "robotwars.cct"',
    'texter = "texter.cct"',
    "",
    "[stuff]",
    "p2pport = 1626",
    "laktare = 0",
    'mainasp = "main.asp"',
    "klo = 1",
    "raketer = 1",
    "missiler = 1",
    "minor = 1",
    "grk = 1",
    'newsflash = ""',
    "",
  ].join("\r\n");
}

class TooLarge extends Error {}
const CLIENT_ERROR_MAX_BODY = 32 * 1024;

async function readBody(req, max = LIMITS.apiMaxBody) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (max && size > max) throw new TooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("latin1");
}

// The game's text is Latin-1 (Director; port/web/src/director/net.ts): its forms
// percent-encode one byte per character, and it reads replies byte for byte. So each %XX
// is one character, not a byte of UTF-8 as URLSearchParams takes it (a paint map's bytes
// above 127 became U+FFFD), and main.asp replies go back as Latin-1.
const LATIN1 = "text/plain; charset=iso-8859-1";
const latin1Decode = (s) => s.replace(/\+/g, " ").replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
function parseForm(text) {
  return Object.fromEntries(
    text.replace(/^\?/, "").split("&").filter(Boolean).map((pair) => {
      const at = pair.indexOf("=");
      return at < 0 ? [latin1Decode(pair), ""] : [latin1Decode(pair.slice(0, at)), latin1Decode(pair.slice(at + 1))];
    }),
  );
}

function originOf(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}

// A request from this machine that didn't come through a proxy (one that adds
// X-Forwarded-For, as a reverse proxy in front of the server would, or a Cloudflare
// Tunnel's CF-Connecting-IP).
function isLocal(req) {
  const addr = req.socket.remoteAddress || "";
  const h = req.headers;
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(addr) && !h["x-forwarded-for"] && !h.forwarded && !h["cf-connecting-ip"] && !h["x-real-ip"];
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const path = resolveIn(PUBLIC_DIR, pathname);
  if (!path) return send(res, 403, "forbidden");
  return sendFile(req, res, path, { index: true });
}

// The production build (APP_DIR): Vite's hashed files under /app never change, the
// extracted assets only when they're extracted again, the page itself on every build.
async function serveApp(req, res, pathname) {
  const route = (root, rel, cacheControl) => {
    const path = resolveIn(root, rel);
    return path ? sendFile(req, res, path, { cacheControl }) : send(res, 403, "forbidden");
  };
  if (pathname.startsWith("/assets/")) return route(ASSETS_DIR, pathname.slice("/assets".length), "public, max-age=86400");
  if (pathname.startsWith("/game/")) {
    const name = pathname.slice("/game/".length);
    return GAME_FILES.has(name) ? route(GAME_DIR, name, "no-cache") : send(res, 404, "not found");
  }
  if (pathname.startsWith("/app/")) return route(APP_DIR, pathname, "public, max-age=31536000, immutable");
  return route(APP_DIR, pathname === "/" ? "/game.html" : pathname, "no-cache");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  // The game builds some paths as moviePath & "/" & file, giving "//".
  const pathname = url.pathname.replace(/\/{2,}/g, "/");
  try {
    if (pathname === "/game/main.ini") {
      return send(res, 200, mainIni(originOf(req)));
    }
    if (pathname.startsWith("/api/")) {
      const address = clientAddress(req, LIMITS.trustProxy, log);
      const name = pathname.slice("/api/".length).toLowerCase();
      let body;
      try {
        // The page's error reports are small (src/error-report.ts).
        body = req.method === "POST" ? await readBody(req, name === "clienterror" ? CLIENT_ERROR_MAX_BODY : undefined) : url.search;
      } catch (err) {
        if (!(err instanceof TooLarge)) throw err;
        log(`api: request body too large (${address})`);
        res.setHeader("Connection", "close");
        return send(res, 413, "too large");
      }
      if (name === "clienterror") {
        if (req.method !== "POST") return send(res, 405, "POST only");
        // JSON in UTF-8 (readBody reads Latin-1, for the game's forms).
        res.writeHead(clientErrors(Buffer.from(body, "latin1").toString("utf8"), address)).end();
        return;
      }
      const params = parseForm(body);
      switch (name) {
        case "main.asp":
        case "abuse.asp": { // the arena's report button
          const reply = handleMainAsp(params, { trusted: isLocal(req), address });
          return typeof reply === "string" ? send(res, 200, Buffer.from(reply, "latin1"), LATIN1) : send(res, reply.status, reply.body);
        }
        case "ip.php":
          // The page supplies the real per-tab address as the sw1 param.
          return send(res, 200, "");
        case "robotcount.php":
          return send(res, 200, String(irc.clients.size));
        case "ip2country.php":
          // The login screen reads the part after "=".
          return send(res, 200, "country=SE");
        default:
          log(`api: unhandled ${req.method} ${name} (${address})`, redact(params));
          return send(res, 200, "[#err: 0]");
      }
    }
    return APP_DIR ? serveApp(req, res, pathname) : serveStatic(req, res, pathname);
  } catch (err) {
    log("http error", err);
    send(res, 500, "error");
  }
});

// Limits on WebSockets (limits.mjs): message size, connections per address and in
// total, new connections per minute, and a heartbeat that closes dead sockets.
const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.wsMaxPayload || undefined });
const sockets = new SocketGuard(LIMITS, log);
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://local");
  const params = Object.fromEntries(url.searchParams);
  const address = clientAddress(req, LIMITS.trustProxy, log);
  const reject = (status, text) => socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  if (store.banFor({ address })) return reject(403, "Forbidden");
  const refused = sockets.refuse(address);
  if (refused) {
    log(`ws: ${url.pathname} from ${address} refused (${refused[1]})`);
    return reject(...refused);
  }
  // The emulator reports a successful connectToNetServer as soon as the socket
  // opens, so a connection to nobody must fail before that.
  if (url.pathname === "/ws/p2p/connect" && !relay.isListening(params.addr)) return reject(404, "Not Found");
  const admission = { clientAddress: address, admit: handleMainAsp.robotRefused, authenticate: handleMainAsp.sessionOwnsRobot };
  wss.handleUpgrade(req, socket, head, (ws) => {
    sockets.track(ws, address);
    ws.on("error", (err) => log(`ws: ${url.pathname} error (${address}): ${err.message}`));
    switch (url.pathname) {
      case "/ws/irc": {
        const session = irc.connect({
          address: params.addr || "0.0.0.0",
          send: (line) => ws.readyState === ws.OPEN && ws.send(line),
          close: () => ws.close(),
          clientAddress: address,
          admit: (nick, pass) => handleMainAsp.ircRefused(robotNameOfNick(nick), pass),
        });
        // The emulator's Multiuser Xtra writes text-mode messages as UTF-8.
        ws.on("message", (data) => session.receive(data.toString("utf8")));
        ws.on("close", () => session.disconnect());
        return;
      }
      case "/ws/p2p/listen":
        return relay.listen(ws, params, admission);
      case "/ws/p2p/connect":
        return relay.connect(ws, params, admission);
      default:
        ws.close(1008, "unknown endpoint");
    }
  });
});

if (APP_DIR) {
  for (const [what, path] of [["the build (npm run build in port/web)", join(APP_DIR, "game.html")], ["the extracted assets", join(ASSETS_DIR, "loader002")], ["the game files", join(GAME_DIR, "badlanguage.txt")]])
    if (!existsSync(path)) log(`warning: ${path} missing: ${what}`);
}
server.listen(PORT, () => log(`Robot Rage server on http://localhost:${PORT}` + (APP_DIR ? ` (the port from ${APP_DIR}, assets from ${ASSETS_DIR})` : ` (${PUBLIC_DIR})`)));

// docker stop: stop taking requests, give the store's debounced write (250 ms) time to
// land, then exit.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log(`${signal}: shutting down`);
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
