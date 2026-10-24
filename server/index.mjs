// Robot Rage self-hosted server: static files, the game's HTTP backend, the
// IRC lobby and the peer relay, all on one port.
//
//   PORT=8080 GAME_DIR=./public/game DATA_DIR=./data node server/index.mjs
//   ICE_SERVERS=stun:stun.example.org:3478 ...   STUN for direct matches (default Google's; '' for none)
//   ADMIN_TOKEN=<secret> ...   enables the admingrant action (testing), from this machine only

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Store } from "./store.mjs";
import { createApi } from "./api.mjs";
import { IrcServer } from "./irc.mjs";
import { Relay } from "./relay.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || join(ROOT, "public"));
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));

const log = (...args) => console.log(new Date().toISOString(), ...args);
const store = new Store(join(DATA_DIR, "db.json"));
const handleMainAsp = createApi(store, log, { adminToken: process.env.ADMIN_TOKEN || "" });
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
const relay = new Relay({ log, iceServers: iceServers(process.env.ICE_SERVERS) });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".dcr": "application/x-director",
  ".cct": "application/x-director",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
};

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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("latin1");
}

function originOf(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}

// A request from this machine that didn't come through a proxy (one that adds
// X-Forwarded-For, as a reverse proxy in front of the server would).
function isLocal(req) {
  const addr = req.socket.remoteAddress || "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(addr) && !req.headers["x-forwarded-for"] && !req.headers.forwarded;
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const path = normalize(join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!path.startsWith(PUBLIC_DIR)) return send(res, 403, "forbidden");
  let file = path;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    send(res, 404, "not found");
  }
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
      const params = Object.fromEntries(new URLSearchParams(req.method === "POST" ? await readBody(req) : url.search));
      const name = pathname.slice("/api/".length).toLowerCase();
      switch (name) {
        case "main.asp":
        case "abuse.asp": // the arena's report button
          return send(res, 200, handleMainAsp(params, { trusted: isLocal(req) }));
        case "ip.php":
          // The page supplies the real per-tab address as the sw1 param.
          return send(res, 200, "");
        case "robotcount.php":
          return send(res, 200, String(irc.clients.size));
        case "ip2country.php":
          // The login screen reads the part after "=".
          return send(res, 200, "country=SE");
        default:
          log(`api: unhandled ${req.method} ${name}`, params);
          return send(res, 200, "[#err: 0]");
      }
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    log("http error", err);
    send(res, 500, "error");
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://local");
  const params = Object.fromEntries(url.searchParams);
  // The emulator reports a successful connectToNetServer as soon as the socket
  // opens, so a connection to nobody must fail before that.
  if (url.pathname === "/ws/p2p/connect" && !relay.isListening(params.addr)) {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    switch (url.pathname) {
      case "/ws/irc": {
        const session = irc.connect({
          address: params.addr || "0.0.0.0",
          send: (line) => ws.readyState === ws.OPEN && ws.send(line),
          close: () => ws.close(),
        });
        // The emulator's Multiuser Xtra writes text-mode messages as UTF-8.
        ws.on("message", (data) => session.receive(data.toString("utf8")));
        ws.on("close", () => session.disconnect());
        return;
      }
      case "/ws/p2p/listen":
        return relay.listen(ws, params);
      case "/ws/p2p/connect":
        return relay.connect(ws, params);
      default:
        ws.close(1008, "unknown endpoint");
    }
  });
});

server.listen(PORT, () => log(`Robot Rage server on http://localhost:${PORT}`));
