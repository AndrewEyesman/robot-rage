// End-to-end check of the lobby (IRC) and match relay, driving two players
// the way the game does: registration, room list, opponent lookup, challenge,
// P2P handshake, arena traffic, disconnects and the score report; then the
// hardening for a public server: robot data checks, kicks and bans, the lobby's
// identity (a session as IRC PASS), (on a second server with low limits, behind a
// pretend proxy) every limit and session expiry, and (on a third, hosted as
// docker-compose.yml: IRC_REQUIRE_SESSION=1, MAP_REQUIRE_SESSION=1) the sessions those
// require.
//
//   node scripts/test-multiplayer.mjs
//
// Starts its own servers on free ports with throwaway DATA_DIRs.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { buildMessage, parseEnvelope } from "../server/relay.mjs";
import { parseLingo } from "../server/lingo.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 18000 + Math.floor(Math.random() * 1000);
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const ERR_NO_CONNECTION = -2147216214;
const ADMIN_TOKEN = "test-admin-token";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, what, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    const found = check();
    if (found) return found;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

function startServer(dataDir, port = PORT, env = {}) {
  const child = spawn(process.execPath, [join(ROOT, "server/index.mjs")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ICE_SERVERS: "stun:stun.test.invalid:3478, stun:other.test.invalid", ADMIN_TOKEN, ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (process.env.VERBOSE) process.stdout.write(chunk);
  });
  return { child, output: () => output, ready: waitFor(() => output.includes("Robot Rage server on"), "server start", 5000) };
}

// Forms and replies in Latin-1, as the game sends and reads them (a character per byte).
const latin1Form = (fields) =>
  Object.entries(fields)
    .map((pair) => pair.map((v) => String(v).replace(/[^A-Za-z0-9*._-]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))).join("="))
    .join("&");

async function mainAsp(fields, http = HTTP) {
  const res = await fetch(`${http}/api/main.asp`, { method: "POST", body: latin1Form(fields), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return Buffer.from(await res.arrayBuffer()).toString("latin1");
}

const prop = (text, name) => text.match(new RegExp(`#${name}: ("[^"]*"|-?\\d+)`))?.[1]?.replace(/"/g, "");

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

// One lobby connection, written like the game's IRC object: lines end in
// LF CR, replies are matched on the words the game reads.
class Irc {
  static async connect(addr, ws = WS) {
    const irc = new Irc();
    irc.ws = await open(`${ws}/ws/irc?addr=${addr}`);
    irc.lines = [];
    irc.closed = false;
    irc.ws.on("message", (data) => irc.lines.push(...String(data).split(/\r?\n/).filter(Boolean)));
    irc.ws.on("close", () => (irc.closed = true));
    return irc;
  }

  send(line) {
    this.ws.send(`${line}\n\r`);
  }

  // `pass`: the original sends an empty PASS, the port's lobby its session (gameFixes.ircAuth).
  async login(nick, pass = "") {
    this.send(`PASS ${pass}`);
    this.send(`NICK ${nick}`);
    this.send(`USER Shockplay 0 * ${nick}`);
    await this.expect((w) => w[1] === "376", "376");
  }

  // Resolves with the words of the first new line `match` accepts.
  async expect(match, what) {
    const words = await waitFor(() => {
      const index = this.lines.findIndex((line) => match(line.split(" "), line));
      if (index < 0) return null;
      const [line] = this.lines.splice(0, index + 1).slice(-1);
      return line.split(" ");
    }, what);
    return words;
  }

  clear() {
    this.lines = [];
  }
}

// One Multiuser instance on the relay: frames in, envelopes out.
class Peer {
  static async listen(addr, user) {
    return Peer.wrap(await open(`${WS}/ws/p2p/listen?addr=${addr}&user=${user}`), user);
  }

  static async connect(addr, user) {
    const peer = Peer.wrap(await open(`${WS}/ws/p2p/connect?addr=${addr}`), user);
    peer.send("System", "Logon", "encrypted logon payload");
    return peer;
  }

  static wrap(ws, user) {
    const peer = new Peer();
    Object.assign(peer, { ws, user, messages: [], controls: [], log: [], closed: false });
    // Binary frames are SMUS messages; text frames the relay's control messages (direct matches).
    ws.on("message", (data, isBinary) => {
      const item = isBinary ? parseEnvelope(Buffer.from(data)) : JSON.parse(String(data));
      (isBinary ? peer.messages : peer.controls).push(item);
      peer.log.push(isBinary ? item.subject : `{${item.t}}`);
    });
    ws.on("close", () => (peer.closed = true));
    return peer;
  }

  send(recipients, subject, contentString = "") {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    this.ws.send(buildMessage({ subject, sender: this.user, recipients: list, contentString }));
  }

  async expect(subject) {
    return waitFor(() => {
      const index = this.messages.findIndex((m) => m.subject === subject);
      return index < 0 ? null : this.messages.splice(index, 1)[0];
    }, `${this.user} receiving ${subject}`);
  }

  control(message) {
    this.ws.send(JSON.stringify(message));
  }

  async expectControl(t) {
    return waitFor(() => {
      const index = this.controls.findIndex((m) => m.t === t);
      return index < 0 ? null : this.controls.splice(index, 1)[0];
    }, `${this.user} receiving control ${t}`);
  }

  async silent(subject, ms = 150) {
    await sleep(ms);
    assert.ok(!this.messages.some((m) => m.subject === subject), `${this.user} got unexpected ${subject}`);
  }
}

const results = [];
async function step(name, fn) {
  await fn();
  results.push(name);
  console.log(`ok - ${name}`);
}

const dataDir = mkdtempSync(join(tmpdir(), "robotrage-test-"));
const server = startServer(dataDir);
let server2, server3;

try {
  await server.ready;

  // Accounts and robots, as created through the login and garage screens.
  const players = {};
  for (const [key, email, robotname] of [["a", "crusher@test", "Crusher"], ["b", "smasher@test", "Smasher"]]) {
    const login = await mainAsp({ action: "createmember", membername: email, password: "pw" });
    const sid = prop(login, "sid");
    const robot = await mainAsp({ action: "createrobot", sessionID: sid, robotname });
    players[key] = { sid, robotname, robotid: Number(prop(robot, "robotid")) };
  }
  const { a, b } = players;
  a.addr = "10.1.1.1";
  b.addr = "10.2.2.2";
  // The game's nick: "_R" & rank & name & ipcode (all tabs share one ipcode).
  a.nick = "_R0Crusher4F2A";
  b.nick = "_R0Smasher4F2A";
  const hex = (n) => n.toString(16).toUpperCase();

  let ircA, ircB;
  await step("IRC registration: 001 carries the tab address, 265 the count, 376 ends", async () => {
    ircA = await Irc.connect(a.addr);
    ircA.send("PASS ");
    ircA.send(`NICK ${a.nick}`);
    ircA.send(`USER Shockplay 0 * ${a.nick}`);
    const welcome = await ircA.expect((w) => w[1] === "001", "001");
    assert.equal(welcome.join(" ").split("@").at(-1), a.addr);
    const count = await ircA.expect((w) => w[1] === "265", "265");
    assert.equal(Number(count[6]), 1);
    await ircA.expect((w) => w[1] === "376", "376");
    ircB = await Irc.connect(b.addr);
    await ircB.login(b.nick);
  });

  await step("rooms: JOIN, NAMES and LIST with the game's mask", async () => {
    ircA.send("JOIN #rw1e");
    const names = await ircA.expect((w) => w[1] === "353", "353");
    assert.equal(names[4], "#rw1e");
    ircB.send("JOIN #rw1e");
    const joined = await ircA.expect((w) => w[1] === "JOIN", "JOIN");
    assert.equal(joined[0].slice(1, joined[0].indexOf("!")), b.nick);
    const users = (await ircB.expect((w) => w[1] === "353", "353")).slice(5).map((u) => u.replace(/^[:@+]+/, ""));
    assert.deepEqual(users.sort(), [a.nick, b.nick].sort());
    await ircB.expect((w) => w[1] === "366", "366");

    ircA.send("LIST #r*");
    const room = await ircA.expect((w) => w[1] === "322" || w[1] === "323", "322");
    assert.equal(room[1], "322");
    assert.equal(room[3].slice(1), "rw1e");
    assert.equal(Number(room[4]), 2);
    await ircA.expect((w) => w[1] === "323", "323");
  });

  await step("LUSERS and ISON", async () => {
    ircA.send("LUSERS");
    const count = await ircA.expect((w) => w[1] === "265", "265");
    assert.equal(Number(count[6]), 2);
    ircA.send(`ISON ${b.nick} nobody`);
    const ison = await ircA.expect((w) => w[1] === "303", "303");
    assert.deepEqual(ison.slice(3).map((w) => w.replace(/^:/, "")).filter(Boolean), [b.nick]);
  });

  // Both players open their listener on entering the lobby.
  const hostA = await Peer.listen(a.addr, a.robotname);
  const hostB = await Peer.listen(b.addr, b.robotname);

  let addressOfB;
  await step("opponent lookup: SMUS_SendIP / SMUS_GetIP get the relay address", async () => {
    ircA.send(`PRIVMSG ${b.nick} :SMUS_SendIP  `);
    const ask = await ircB.expect((w) => w[1] === "PRIVMSG", "SMUS_SendIP");
    assert.equal(ask[3], ":SMUS_SendIP");
    // The emulator has no address cookies, so the game's own IP is 0.
    ircB.send(`PRIVMSG ${a.nick} :SMUS_GetIP 0 0_${hex(b.robotid)}`);
    const reply = await ircA.expect((w) => w[1] === "PRIVMSG", "SMUS_GetIP");
    assert.equal(reply[3], ":SMUS_GetIP");
    const [ip, id] = reply.slice(5).join(" ").split("_");
    assert.equal(ip, b.addr);
    assert.equal(parseInt(id, 16), b.robotid);
    addressOfB = ip;
  });

  await step("lobby ping: connect, P2P_Ping/Pong, P2P_Ping_Exit, breakConnection", async () => {
    const pinger = await Peer.connect(addressOfB, a.robotname);
    const hello = await hostB.expect("WaitForNetConnection");
    assert.equal(hello.sender, a.robotname);
    pinger.send(b.robotname, "P2P_Ping");
    const ping = await hostB.expect("P2P_Ping");
    hostB.send(ping.sender, "P2P_Pong");
    await pinger.expect("P2P_Pong");
    pinger.send(b.robotname, "P2P_Ping_Exit", "42");
    await hostB.expect("P2P_Ping_Exit");
    hostB.send("System", "BreakConnection", a.robotname);
    await waitFor(() => pinger.closed, "pinger closed");
    await hostB.silent("ConnectionProblem");
  });

  await step("connecting to an address nobody listens on fails before open", async () => {
    await assert.rejects(open(`${WS}/ws/p2p/connect?addr=10.9.9.9`), /404/);
  });

  let challenger;
  await step("challenge: #ip is the challenger's address, then SMUS_ConnectToMe", async () => {
    const challenge = `[#id: ${a.robotid}, #server: 0, #ip: 0, #rank: 0]`;
    ircA.send(`PRIVMSG ${b.nick} :Challenge 0 ${challenge}`);
    const got = await ircB.expect((w) => w[1] === "PRIVMSG", "Challenge");
    assert.equal(got[3], ":Challenge");
    const body = got.slice(5).join(" ");
    assert.match(body, new RegExp(`#ip: "${a.addr.replace(/\./g, "\\.")}"`));
    assert.match(body, new RegExp(`#id: ${a.robotid}`));
    // Behind the same "router", the challenged player hosts.
    ircB.send(`PRIVMSG ${a.nick} :SMUS_ConnectToMe  `);
    const go = await ircA.expect((w) => w[1] === "PRIVMSG", "SMUS_ConnectToMe");
    assert.equal(go[3], ":SMUS_ConnectToMe");

    challenger = await Peer.connect(addressOfB, a.robotname);
    await hostB.expect("WaitForNetConnection");
    challenger.send(a.nick, "P2P_Connected");
    const connected = await hostB.expect("P2P_Connected");
    hostB.send(connected.sender, "P2P_ConnectedOK");
    await challenger.expect("P2P_ConnectedOK");
  });

  await step("match start from an old client (setrwgames without a session)", async () => {
    const description = `[#server: ${b.robotid}, #client: ${a.robotid}, #servername: "Smasher", #clientname: "Crusher"]`;
    assert.equal(prop(await mainAsp({ action: "setrwgames", gamegescription: description }), "err"), "0");
  });

  await step("arena traffic: ready handshake, stamped messages, name and broadcast routing", async () => {
    ircA.send("PART #rw1e");
    ircB.send("PART #rw1e");
    // The host addresses its opponent by the name decoded from the IRC nick,
    // which need not match the logon name exactly.
    hostB.send("crusher ", "ready", "x");
    const ready = await challenger.expect("ready");
    challenger.send("Smasher", "ready ok");
    const ok = await hostB.expect("ready ok");
    assert.ok(ready.errorCode === 0 && ok.errorCode === 0);
    await sleep(20);
    challenger.send("Smasher", "!");
    const later = await hostB.expect("!");
    const stamp = (env) => env.timestamp;
    assert.ok(stamp(later) > 0, "relay stamps the time");
    assert.ok(stamp(later) >= stamp(ok));
    // chat2 goes to getPeerConnectionList(), which is empty in the emulator.
    hostB.send([], "chat2", "hello");
    await challenger.expect("chat2");

    // A second robot pinging the host must not get the opponent's traffic.
    const bystander = await Peer.connect(addressOfB, "Bystander");
    await hostB.expect("WaitForNetConnection");
    hostB.send(a.robotname, "p2p_ping");
    await challenger.expect("p2p_ping");
    await bystander.silent("p2p_ping");
    bystander.ws.close();
    await hostB.expect("ConnectionProblem");
  });

  await step("direct-match signalling: hello, offer/answer routing, markers in order, old clients untouched", async () => {
    const host = await Peer.listen("10.5.5.5", "Signaller");
    host.control({ t: "hello", c: 12.5 });
    const hello = await host.expectControl("hello");
    assert.equal(hello.c, 12.5);
    assert.ok(hello.now > 0);
    assert.deepEqual(hello.iceServers, [{ urls: ["stun:stun.test.invalid:3478", "stun:other.test.invalid"] }]);
    host.control({ t: "time", c: 3 });
    const time = await host.expectControl("time");
    assert.ok(time.now >= hello.now && time.iceServers === undefined);

    const joiner = await Peer.connect("10.5.5.5", "Joiner");
    await host.expect("WaitForNetConnection");
    joiner.control({ t: "hello", c: 1 });
    await joiner.expectControl("hello");
    joiner.control({ t: "offer", sdp: "v=0 offer" });
    const offer = await host.expectControl("offer");
    assert.deepEqual(offer, { t: "offer", sdp: "v=0 offer", from: "Joiner" });
    host.control({ t: "answer", sdp: "v=0 answer", to: "joiner" });
    assert.deepEqual(await joiner.expectControl("answer"), { t: "answer", sdp: "v=0 answer" });

    // The switch marker keeps its place between the game's frames, both ways.
    joiner.send("Signaller", "before");
    joiner.control({ t: "switch" });
    joiner.send("Signaller", "after");
    await host.expect("after");
    assert.deepEqual(host.log.slice(-3), ["before", "{switch}", "after"]);
    host.send("Joiner", "before");
    host.control({ t: "switch", to: "Joiner" });
    host.send("Joiner", "after");
    await joiner.expect("after");
    assert.deepEqual(joiner.log.slice(-3), ["before", "{switch}", "after"]);

    // A client that never sends text frames (the dirplayer page) gets none, and is relayed as before.
    const old = await Peer.connect("10.5.5.5", "OldPage");
    await host.expect("WaitForNetConnection");
    host.control({ t: "offer", sdp: "x", to: "OldPage" });
    assert.deepEqual(await host.expectControl("unsupported"), { t: "unsupported", from: "OldPage" });
    host.send("OldPage", "ready", "x");
    await old.expect("ready");
    old.send("Signaller", "ready ok");
    await host.expect("ready ok");
    assert.equal(old.controls.length, 0);
    old.ws.close();
    joiner.ws.close();
    host.ws.close();
  });

  await step("opponent dropping out reaches the host as a connection error", async () => {
    challenger.ws.close();
    const problem = await hostB.expect("ConnectionProblem");
    assert.equal(problem.errorCode, ERR_NO_CONNECTION);
    assert.equal(problem.sender, a.robotname);
  });

  await step("host leaving reaches the client as a connection error", async () => {
    const client = await Peer.connect(addressOfB, a.robotname);
    await hostB.expect("WaitForNetConnection");
    hostB.ws.close();
    const problem = await client.expect("ConnectionProblem");
    assert.equal(problem.errorCode, ERR_NO_CONNECTION);
    await waitFor(() => client.closed, "client closed");
  });

  await step("back in the lobby: a new listener replaces the old one", async () => {
    const old = await Peer.listen(a.addr, a.robotname);
    await waitFor(() => hostA.closed, "first listener replaced");
    const pinger = await Peer.connect(a.addr, b.robotname);
    await old.expect("WaitForNetConnection");
    pinger.ws.close();
    old.ws.close();
  });

  await step("IRC reconnect from the same tab takes over the stale nick", async () => {
    const again = await Irc.connect(a.addr);
    await again.login(a.nick);
    await waitFor(() => ircA.closed, "stale IRC connection closed");
    await ircB.expect((w) => w[1] === "QUIT" || w[1] === "PART", "old nick leaving");
    const other = await Irc.connect("10.3.3.3");
    other.send(`NICK ${a.nick}`);
    other.send("USER Shockplay 0 * x");
    await other.expect((w) => w[1] === "433", "433 from another tab");
    other.ws.close();
    again.ws.close();
  });

  // ---------------------------------------------------------------- ranked results
  const report = (from, to, winner) =>
    mainAsp({ action: "setrobotscore", sessionid: from.sid, robotid: from.robotid, robotname: from.robotname, user1id: from.robotid, user2id: to.robotid, winner, checksum: 7 });
  const card = async (who) => {
    const text = await mainAsp({ action: "getrobotall", robotid: who.robotid });
    const [, win, lose, draw] = text.match(/#Win: (\d+), #lose: (\d+), #draw: (\d+)/).map(Number);
    return { score: Number(prop(text, "score")), win, lose, draw };
  };
  const startMatch = (host, guest, withSession = true) =>
    mainAsp({
      action: "setrwgames",
      gamegescription: `[#server: ${host.robotid}, #client: ${guest.robotid}, #servername: "${host.robotname}", #clientname: "${guest.robotname}", #serverip: "${host.robotname}"]`,
      ...(withSession ? { sessionid: host.sid } : {}),
    });

  await step("a ranked round counts once both players report the same result", async () => {
    await startMatch(b, a);
    const first = await report(b, a, b.robotid);
    assert.equal(prop(first, "err"), "0");
    assert.equal(prop(first, "score"), "0");
    assert.deepEqual(await card(b), { score: 0, win: 0, lose: 0, draw: 0 }, "one report changes nothing");
    const second = await report(a, b, b.robotid);
    assert.equal(prop(second, "err"), "0", "the loser's report is accepted");
    assert.equal(prop(second, "score"), "0");
    assert.deepEqual(await card(b), { score: 10, win: 1, lose: 0, draw: 0 });
    assert.deepEqual(await card(a), { score: 0, win: 0, lose: 1, draw: 0 });
    // A tie, reported by both.
    await report(a, b, 0);
    await report(b, a, 0);
    assert.equal((await card(a)).draw, 1);
    assert.equal((await card(b)).draw, 1);
  });

  await step("a single report (an old client's winner-only report) or disagreeing reports don't count", async () => {
    const single = await report(b, a, b.robotid);
    assert.equal(prop(single, "err"), "0", "an old client's report gets its usual reply");
    assert.equal(prop(single, "score"), "10");
    assert.deepEqual(await card(b), { score: 10, win: 1, lose: 0, draw: 1 });
    // a claims the round for itself: the two disagree.
    await report(a, b, a.robotid);
    assert.deepEqual(await card(b), { score: 10, win: 1, lose: 0, draw: 1 });
    assert.deepEqual(await card(a), { score: 0, win: 0, lose: 1, draw: 1 });
  });

  await step("reports without a started match don't count; forged reports are refused", async () => {
    const login = await mainAsp({ action: "createmember", membername: "third@test", password: "pw" });
    const robot = await mainAsp({ action: "createrobot", sessionID: prop(login, "sid"), robotname: "Third" });
    const c = { sid: prop(login, "sid"), robotname: "Third", robotid: Number(prop(robot, "robotid")) };
    assert.equal(prop(await report(c, a, c.robotid), "err"), "0");
    assert.equal(prop(await report(a, c, c.robotid), "err"), "0");
    assert.deepEqual(await card(c), { score: 0, win: 0, lose: 0, draw: 0 });
    assert.equal((await card(a)).lose, 1);
    // A start without the host's session (as the original sends it) opens a match between robots that have none.
    await startMatch(c, a, false);
    await report(c, a, c.robotid);
    await report(a, c, c.robotid);
    assert.deepEqual(await card(c), { score: 10, win: 1, lose: 0, draw: 0 }, "a started match between c and a counts");
    const forged = await mainAsp({ action: "setrobotscore", sessionid: a.sid, robotid: a.robotid, user1id: b.robotid, user2id: a.robotid, winner: b.robotid });
    assert.equal(prop(forged, "err"), "-1");
    const wrongWinner = await report(a, b, c.robotid);
    assert.equal(prop(wrongWinner, "err"), "-1");
  });

  // ---------------------------------------------------------------- economy
  const robotText = ({ ram = ["r1"], torn = [], hjul = ["h2"], motor = ["ma1"], batteri = ["b1"], vapen = [], inventory = [], money = 50, pansar = 50 } = {}) => {
    const l = (xs) => `[${xs.map((x) => `#${x}`).join(", ")}]`;
    return `[#robotDescription: [#ram: ${l(ram)}, #torn: ${l(torn)}, #hjul: ${l(hjul)}, #motor: ${l(motor)}, #batteri: ${l(batteri)}, #vapen: ${l(vapen)}, #wpnPos: ${l(vapen.map(() => "f"))}, #special: [], #ammunition: []], #inventory: ${l(inventory)}, #money: ${money}, #space: 100, #spaceleft: 10, #maxSpeed: 40, #pansar: ${pansar}, #info1: ${1112 - money}, #saveMap: 0, #soldweapons: []]`;
  };
  const save = (who, robot, economy = true) =>
    mainAsp({ action: "setrobot", sessionid: who.sid, robotid: who.robotid, robotname: who.robotname, proplist: robotText(robot), ...(economy ? { economy: 1 } : {}) });
  const stored = async (who) => {
    const text = await mainAsp({ action: "getrobot", sessionid: who.sid, robotid: who.robotid });
    return { money: Number(text.match(/#money: (-?\d+)/)?.[1]), info1: Number(text.match(/#info1: (-?\d+)/)?.[1]), text };
  };
  const grant = (robot, amount, extra = {}) => mainAsp({ action: "admingrant", robot, amount, token: ADMIN_TOKEN, ...extra });

  await step("economy: a legit first save, buys, install, sale and save pass", async () => {
    // A never-saved robot's first save: the empty robot the client fills in (50 credits).
    assert.equal(prop(await save(a, {}), "money"), "50");
    // Buy the Dagger (10) and the Plow (25).
    assert.equal(prop(await save(a, { inventory: ["v7", "v6"], money: 15 }), "money"), "15");
    // Install the Dagger, sell the Plow (90% of 25, truncated: 22).
    const sold = await save(a, { vapen: ["v7"], money: 37 });
    assert.equal(prop(sold, "err"), "0");
    assert.equal(prop(sold, "money"), "37");
    assert.deepEqual((({ money, info1 }) => ({ money, info1 }))(await stored(a)), { money: 37, info1: 1075 });
    // An old client (no economy=1) saves the same way.
    assert.equal(prop(await save(a, { vapen: ["v7"], money: 37 }, false), "err"), "0");
  });

  await step("economy: inflated money is cut to the legal amount; unpaid or misinstalled parts are refused", async () => {
    const inflated = await save(a, { vapen: ["v7"], money: 5000 });
    assert.equal(prop(inflated, "err"), "0");
    assert.equal(prop(inflated, "money"), "37", "the server keeps the legal money");
    const s = await stored(a);
    assert.equal(s.money, 37);
    assert.equal(s.info1, 1075, "info1 follows, or the client would zero the money");
    // A Large Chassi (400) out of nowhere.
    assert.equal(prop(await save(a, { vapen: ["v7"], inventory: ["r3"], money: 37 }), "err"), "-1");
    // Two chassis installed (the Small one sold back for the Medium is fine; two at once isn't).
    assert.equal(prop(await save(a, { ram: ["r1", "r1"], vapen: ["v7"], money: 0 }), "err"), "-1");
    // Three batteries; a tower weapon without a tower.
    assert.equal(prop(await save(a, { vapen: ["v7"], money: 0, batteri: ["b1", "b1", "b1"] }), "err"), "-1");
    assert.equal(prop(await save(a, { vapen: ["v7", "v3"], money: 0 }), "err"), "-1");
    assert.equal((await stored(a)).money, 37, "refused saves change nothing");
    // Armour beyond the chassis' limit (83 for the Small Chassi) is cut.
    await save(a, { vapen: ["v7"], money: 37, pansar: 500 });
    assert.match((await stored(a)).text, /#pansar: 83,/);
    await save(a, { vapen: ["v7"], money: 37, pansar: 52 });
  });

  await step("economy: the admin grant is off without the token and pays on the next load", async () => {
    assert.equal(prop(await mainAsp({ action: "admingrant", robot: a.robotid, amount: 100 }), "err"), "-1");
    assert.equal(prop(await mainAsp({ action: "admingrant", robot: a.robotid, amount: 100, token: "wrong" }), "err"), "-1");
    assert.equal(prop(await grant("crusher", 2063, { set: 1 }), "amount"), "2026");
    assert.deepEqual((({ money, info1 }) => ({ money, info1 }))(await stored(a)), { money: 2063, info1: 1112 - 2063 });
  });

  await step("economy: a Super Pack bought for 2100; selling its parts can't mint credits", async () => {
    const pack = ["v1", "v9", "v4", "v16", "v17", "v3", "b3"];
    // 2063 credits can't pay for it...
    assert.equal(prop(await save(a, { vapen: ["v7"], inventory: pack, money: 0 }), "err"), "-1");
    // ... 2137 can, leaving 37.
    await grant(a.robotid, 74);
    assert.equal((await stored(a)).money, 2137);
    assert.equal(prop(await save(a, { vapen: ["v7"], inventory: pack, money: 37 }), "money"), "37");
    // Sold one by one they bring 6 x 288 + 270 = 1998, not the 2100 paid.
    const resold = await save(a, { vapen: ["v7"], money: 2137 });
    assert.equal(prop(resold, "money"), "2035");
    assert.equal((await stored(a)).money, 2035);
  });

  await step("economy: prizes come from confirmed results only, paid with the next save or load", async () => {
    await startMatch(a, b);
    await report(a, b, a.robotid);
    await report(b, a, a.robotid);
    // A round a claims alone: no prize for it.
    await report(a, b, a.robotid);
    // The arena's "update m" adds 10 per round won (here 2, one unconfirmed); the server pays 10.
    await sleep(50);
    const saved = await save(a, { vapen: ["v7"], money: 2055 });
    assert.equal(prop(saved, "money"), "2035", "a report still waiting for its partner holds the prize back");
    assert.equal(prop(await report(b, a, b.robotid), "err"), "0");
    // b disagreed about the second round, so a has one confirmed win: the prize is paid at the next load.
    assert.equal((await stored(a)).money, 2045);
    assert.equal(prop(await save(a, { vapen: ["v7"], money: 2045 }), "money"), "2045", "paid once");
    // b won a round earlier but never saved its robot: the prize waits for its first save.
    assert.equal(prop(await save(b, {}), "money"), "60");
  });

  await step("economy: the grant tool, on a data file and through a running server", async () => {
    const file = join(dataDir, "grant-test.json");
    writeFileSync(file, JSON.stringify({ robots: { 7: { robotid: 7, robotname: "Tool", propertyList: robotText({ money: 9 }) } } }));
    const tool = (args, env = {}) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [join(ROOT, "scripts/grant-credits.mjs"), ...args], { env: { ...process.env, ...env } });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        child.on("close", (code) => resolve({ code, out }));
      });
    const offline = await tool(["tool", "500", "--data", file]);
    assert.equal(offline.code, 0, offline.out);
    const robot = JSON.parse(readFileSync(file, "utf8")).robots[7];
    assert.equal(robot.ledger.money, 9);
    assert.deepEqual(robot.credits.map((c) => c.amount), [500]);
    const set = await tool(["7", "100", "--set", "--data", file]);
    assert.equal(set.code, 0, set.out);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).robots[7].credits.map((c) => c.amount), [500, -409]);
    const online = await tool([String(a.robotid), "5", "--url", HTTP], { ADMIN_TOKEN });
    assert.equal(online.code, 0, online.out);
    assert.equal((await stored(a)).money, 2050);
    assert.notEqual((await tool([String(a.robotid), "5", "--url", HTTP], { ADMIN_TOKEN: "" })).code, 0, "no token, no grant");
  });

  await step("arena PING and abuse report", async () => {
    assert.equal(prop(await mainAsp({ action: "PING", sessionid: a.sid, robotid: a.robotid }), "err"), "0");
    const res = await fetch(`${HTTP}/api/abuse.asp`, {
      method: "POST",
      body: new URLSearchParams({ action: "reportabuse", sessionid: a.sid, user1id: a.robotid, user2id: b.robotid }),
    });
    assert.equal(prop(await res.text(), "err"), "0");
  });

  // ---------------------------------------------------------------- robot data
  await step("robot data: unparsable, oversized, unexpected or mistyped robot data is refused", async () => {
    const reply = (await stored(a)).text;
    const [, , start, end] = parseLingo(reply).entry("propertyList");
    const before = reply.slice(start, end);
    const send = (proplist) => mainAsp({ action: "setrobot", sessionid: a.sid, robotid: a.robotid, proplist, economy: 1 });
    const bad = {
      unparsable: before.slice(0, -1),
      "a string": '"[#robotDescription: []]"',
      "a plain list": "[1, 2, 3]",
      "an unexpected property": before.replace("#space:", '#note: "hi", #space:'),
      "a mistyped property": before.replace(/#space: \d+/, '#space: "100"'),
      "a non-part inventory": before.replace("#inventory: []", "#inventory: [1, 2]"),
      "a property twice": before.replace("#space:", "#money: 99999, #space:"),
      "an unexpected slot": before.replace("#special: []", "#special: [], #extra: []"),
      "too large": before.replace("#soldweapons: []", `#soldweapons: [${Array(3000).fill("#v7").join(", ")}]`),
      "nested too deep": `[#robotDescription: [#ram: ${"[".repeat(5000)}${"]".repeat(5000)}]]`,
    };
    for (const [what, text] of Object.entries(bad)) {
      assert.notEqual(text, before, what);
      assert.equal(prop(await send(text), "err"), "-1", what);
    }
    assert.equal((await stored(a)).text, reply, "refused saves change nothing");
    assert.equal(prop(await send(before), "err"), "0", "the stored data itself passes");
  });

  await step("robot data: bad robot names and paint maps are refused; the garage's session-less map save works", async () => {
    for (const robotname of ['Quote"Bot', "[Bracket]", "x".repeat(25), "Tab\tBot"]) {
      assert.equal(prop(await mainAsp({ action: "createrobot", sessionid: b.sid, robotname }), "err"), "-1", robotname);
    }
    const map = (m, extra = {}) => mainAsp({ action: "setrobotmap", robotid: a.robotid, robotname: a.robotname, map: m, ...extra });
    assert.equal(prop(await map("**\u0001**", { sessionid: a.sid }), "err"), "-1", "a control character");
    assert.equal(prop(await map("**\t**\t**", { sessionid: a.sid }), "err"), "-1", "three maps");
    assert.equal(prop(await map("*".repeat(300 * 1024), { sessionid: a.sid }), "err"), "-1", "too large");
    // The garage's own save: no session, right after the owner's setrobot from the same address.
    // Bytes above 127 are one character each (Latin-1), both ways.
    const painted = "(*\u00ff*+,\u00e9\t(+P";
    assert.equal(prop(await map(painted), "err"), "0");
    assert.equal(await mainAsp({ action: "getrobotmap", sessionid: a.sid, robotid: a.robotid }), painted);
    // The port's save (gameFixes.mapSession): with the session.
    assert.equal(prop(await map(`${painted}*`, { sessionid: a.sid }), "err"), "0");
    assert.equal(await mainAsp({ action: "getrobotmap", sessionid: a.sid, robotid: a.robotid }), `${painted}*`);
    assert.equal(prop(await map("****", { sessionid: b.sid }), "err"), "-1", "another member's session");
    // The garage's unused Spara (setrobotmapNew) takes the same.
    assert.equal(prop(await mainAsp({ action: "setrobotmapNew", sessionID: a.sid, robotid: a.robotid, robotname: a.robotname, map: painted }), "err"), "0");
  });

  // ---------------------------------------------------------------- lobby identity
  await step("lobby identity: a nick with its owner's session is taken, another member's session is refused, an empty PASS is taken", async () => {
    const own = await Irc.connect("10.3.3.1");
    await own.login("_R0Crusher0000", a.sid);
    own.ws.close();
    const other = await Irc.connect("10.3.3.2");
    other.send(`PASS ${b.sid}`);
    other.send("NICK _R0Crusher0000");
    await waitFor(() => other.closed, "a session that doesn't own the robot refused");
    assert.ok(other.lines.some((l) => /^ERROR .*Not your robot/.test(l)), other.lines.join("\n"));
    const unknown = await Irc.connect("10.3.3.3");
    unknown.send(`PASS ${b.sid}`);
    unknown.send("NICK _R0Nobody_20Here0000");
    await waitFor(() => unknown.closed, "a session naming a robot that doesn't exist refused");
    // The original's empty PASS, and "nopwd", aren't sessions: taken without IRC_REQUIRE_SESSION.
    const old = await Irc.connect("10.3.3.4");
    await old.login("_R0Smasher0000");
    old.ws.close();
    const nopwd = await Irc.connect("10.3.3.5");
    await nopwd.login("_R0Oldclient0000", "nopwd");
    nopwd.ws.close();
  });

  // ---------------------------------------------------------------- moderation
  const admin = (fields) => mainAsp({ token: ADMIN_TOKEN, ...fields });
  const moderate = (args, env = { ADMIN_TOKEN }) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [join(ROOT, "scripts/moderate.mjs"), ...args], { env: { ...process.env, ...env } });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("close", (code) => resolve({ code, out }));
    });
  const rowdy = { email: "rowdy@test", robotname: "Rowdy Bot", nick: "_R0Rowdy_20Bot4F2A", addr: "10.7.7.7" };

  await step("moderation: a kick ends the player's sessions and closes its lobby and match sockets", async () => {
    rowdy.sid = prop(await mainAsp({ action: "createmember", membername: rowdy.email, password: "pw" }), "sid");
    assert.equal(prop(await mainAsp({ action: "createrobot", sessionid: rowdy.sid, robotname: rowdy.robotname }), "err"), "0");
    const irc = await Irc.connect(rowdy.addr);
    await irc.login(rowdy.nick);
    const host = await Peer.listen(rowdy.addr, rowdy.robotname);
    assert.equal(prop(await mainAsp({ action: "adminkick", who: rowdy.email }), "err"), "-1", "no token, no kick");
    const kicked = await admin({ action: "adminkick", who: rowdy.robotname });
    assert.equal(prop(kicked, "err"), "0");
    assert.equal(prop(kicked, "sockets"), "2");
    assert.equal(prop(kicked, "sessions"), "1");
    await waitFor(() => irc.closed && host.closed, "the kicked player's sockets closing");
    assert.ok(irc.lines.some((l) => l.startsWith("ERROR")), "the lobby says why");
    assert.equal(prop(await mainAsp({ action: "getmyrobots", sessionid: rowdy.sid }), "err"), "18", "logged out");
  });

  await step("moderation: a banned account can't log in, join the lobby or listen for a match; unbanned, it can", async () => {
    const sid = prop(await mainAsp({ action: "loginmember", membername: rowdy.email, password: "pw" }), "sid");
    const banned = await moderate(["ban", rowdy.email, "--days", "2", "--reason", "spamming the lobby", "--url", HTTP]);
    assert.equal(banned.code, 0, banned.out);
    assert.equal(prop(await mainAsp({ action: "loginmember", membername: rowdy.email, password: "pw" }), "err"), "-1");
    assert.equal(prop(await mainAsp({ action: "getmyrobots", sessionid: sid }), "err"), "18", "its session ended");
    const irc = await Irc.connect(rowdy.addr);
    irc.send(`NICK ${rowdy.nick}`);
    await waitFor(() => irc.closed, "the banned nick refused");
    const host = await Peer.listen(rowdy.addr, rowdy.robotname);
    await waitFor(() => host.closed, "the banned robot's listener closed");
    const list = await moderate(["list", "--url", HTTP]);
    assert.match(list.out, /account rowdy@test .*until .*spamming the lobby/);
    assert.notEqual((await moderate(["list", "--url", HTTP], { ADMIN_TOKEN: "" })).code, 0, "no token, no list");
    const unbanned = await moderate(["unban", rowdy.robotname, "--url", HTTP]);
    assert.equal(unbanned.code, 0, unbanned.out);
    assert.equal(prop(await mainAsp({ action: "loginmember", membername: rowdy.email, password: "pw" }), "err"), "0");
    const again = await Irc.connect(rowdy.addr);
    await again.login(rowdy.nick);
    again.ws.close();
  });

  await step("moderation: the tool offline, on a data file", async () => {
    const file = join(dataDir, "moderate-test.json");
    writeFileSync(file, JSON.stringify({
      nextId: 50,
      members: { "pest@test": { id: 7, name: "pest@test" } },
      robots: { 8: { robotid: 8, memberId: 7, robotname: "Pest" } },
      sessions: { s1: { memberId: 7, name: "pest@test", created: Date.now() }, s2: { memberId: 9, name: "other@test", created: Date.now() } },
    }));
    const ban = await moderate(["ban", "Pest", "--reason", "cheating", "--data", file]);
    assert.equal(ban.code, 0, ban.out);
    await sleep(400);
    let db = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(db.bans.map((x) => [x.account, x.reason, x.expires]), [["pest@test", "cheating", undefined]]);
    assert.deepEqual(Object.keys(db.sessions), ["s2"]);
    assert.equal((await moderate(["ban", "ip:192.0.2.7", "--days", "1", "--data", file])).code, 0);
    assert.match((await moderate(["list", "--data", file])).out, /account pest@test .*for good.*\n.*address 192\.0\.2\.7 .*until/);
    const id = JSON.parse(readFileSync(file, "utf8")).bans[0].id;
    assert.equal((await moderate(["unban", "--id", String(id), "--data", file])).code, 0);
    await sleep(400);
    db = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(db.bans.map((x) => x.address), ["192.0.2.7"]);
    assert.notEqual((await moderate(["kick", "nobody@test", "--data", file])).code, 0);
  });

  await step("logs: no passwords or session ids", async () => {
    await mainAsp({ action: "getrobotmap", sessionid: a.sid, robotid: a.robotid });
    await sleep(50);
    const logged = server.output();
    assert.ok(!/"pw"|password: "?pw|=pw\b/.test(logged), "no password in the log");
    for (const who of [a, b]) assert.ok(!logged.includes(who.sid), "no session id in the log");
    assert.match(logged, /main\.asp loginmember \(127\.0\.0\.1\) -> \[#err: 0, #id: \d+, #sid: "<redacted>"\]/);
    // Short replies: a paint map as its length, a robot's data cut before #propertyList.
    assert.match(logged, /main\.asp getrobotmap \(127\.0\.0\.1\) -> <\d+ chars>/);
    assert.match(logged, /main\.asp getrobot \(127\.0\.0\.1\) -> \[#err: 0, #robotid: \d+, [^\n]*, \.\.\.\] \(\d+ chars\)\n/);
  });

  await step("client errors: logged the first time and at the 10th report, redacted, limited", async () => {
    const report = (errors) => fetch(`${HTTP}/api/clienterror`, { method: "POST", body: JSON.stringify({ errors }) });
    const error = { where: "mouseUp", message: "Error: index 3 out of range", stack: "at a (/app/game-x.js:1:2)", movie: "lobby060_", frame: 12, label: "room" };
    assert.equal((await report([error])).status, 204);
    for (let i = 0; i < 9; i++) await report([error]);
    await report([{ ...error, message: "Error: sessionid=s3cr3t for me@example.org", stack: "" }]);
    assert.equal((await report("nope")).status, 204);
    assert.equal((await fetch(`${HTTP}/api/clienterror`, { method: "POST", body: "{" })).status, 400);
    assert.equal((await fetch(`${HTTP}/api/clienterror`)).status, 405);
    assert.equal((await fetch(`${HTTP}/api/clienterror`, { method: "POST", body: "x".repeat(40_000) })).status, 413);
    await sleep(100);
    const lines = server.output().split("\n").filter((l) => l.includes("client error"));
    assert.deepEqual(lines.map((l) => l.replace(/^\S+ /, "")), [
      'client error (127.0.0.1) lobby060_ frame 12 "room", mouseUp: Error: index 3 out of range; stack: at a (/app/game-x.js:1:2)',
      'client error (127.0.0.1) lobby060_ frame 12 "room", mouseUp: Error: index 3 out of range (10 reports)',
      'client error (127.0.0.1) lobby060_ frame 12 "room", mouseUp: Error: sessionid=<redacted> for <email>',
    ]);
    // 30 errors a minute per address: 11 so far, so 19 more are logged and the rest dropped.
    await report(Array.from({ length: 20 }, (_, i) => ({ ...error, message: `Error: ${i}` })));
    await report([{ ...error, message: "Error: over the limit" }]);
    await sleep(100);
    const after = server.output().split("\n").filter((l) => l.includes("client error"));
    assert.equal(after.length, 3 + 19);
    assert.ok(!after.some((l) => l.includes("over the limit")));
  });

  ircB.ws.close();
  hostA.ws.close();

  // ---------------------------------------------------------------- limits
  // A second server behind a pretend proxy (TRUST_PROXY=xff: each test claims its own
  // address), with every limit set low.
  const PORT2 = PORT + 1000;
  const HTTP2 = `http://127.0.0.1:${PORT2}`;
  const WS2 = `ws://127.0.0.1:${PORT2}`;
  const dataDir2 = join(dataDir, "limits");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dataDir2);
  const now = Date.now();
  writeFileSync(join(dataDir2, "db.json"), JSON.stringify({
    nextId: 5000, members: {}, robots: {},
    sessions: { stale: { memberId: 1, name: "gone@test", created: 0 }, fresh: { memberId: 1, name: "gone@test", created: now } },
    matches: { 1: { id: "1", last: now - 30 * 24 * 3600e3, closed: true }, 2: { id: "2", last: now } },
    bans: [{ id: 1, address: "192.0.2.1", created: 0, expires: 1 }],
  }));
  server2 = startServer(dataDir2, PORT2, {
    TRUST_PROXY: "xff",
    LOGIN_FAILS_PER_ACCOUNT: "3", LOGIN_FAILS_PER_ADDRESS: "5", LOGIN_LOCK_MIN: "0.02",
    ACCOUNTS_PER_DAY: "2", API_PER_MIN: "40",
    WS_PER_ADDRESS: "3", WS_NEW_PER_MIN: "6", WS_MAX_PAYLOAD_KB: "8", WS_PING_SEC: "0.5",
    IRC_LINES_PER_10S: "30", IRC_CHAT_PER_10S: "3", IRC_MAX_LINE: "300", IRC_REGISTER_SEC: "1",
    RELAY_MSGS_PER_SEC: "20", RELAY_PEERS_PER_HOST: "2",
    SESSION_DAYS: String(2.5 / 86400), // 2.5 s
  });
  await server2.ready;
  const asp = async (fields, from) => {
    const headers = from ? { "X-Forwarded-For": `198.51.100.1, ${from}` } : {};
    const res = await fetch(`${HTTP2}/api/main.asp`, { method: "POST", body: new URLSearchParams(fields), headers });
    const text = await res.text();
    return { status: res.status, text, err: res.status === 200 ? prop(text, "err") : undefined };
  };
  const ws2 = (path, from, options = {}) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS2}${path}`, { headers: { "X-Forwarded-For": from }, ...options });
      ws.closed = false;
      ws.lines = [];
      ws.on("message", (data) => ws.lines.push(...String(data).split(/\r?\n/).filter(Boolean)));
      ws.on("close", (code) => Object.assign(ws, { closed: true, code }));
      ws.once("open", () => resolve(ws));
      ws.once("unexpected-response", (req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once("error", reject);
    });
  const ircLogin = async (ws, nick) => {
    for (const line of ["PASS ", `NICK ${nick}`, `USER Shockplay 0 * ${nick}`]) ws.send(`${line}\n\r`);
    await waitFor(() => ws.lines.some((l) => l.split(" ")[1] === "376"), "376");
  };

  await step("startup prunes expired sessions and bans and long-finished matches", async () => {
    await sleep(400);
    const db = JSON.parse(readFileSync(join(dataDir2, "db.json"), "utf8"));
    assert.deepEqual(Object.keys(db.sessions), ["fresh"]);
    assert.deepEqual(Object.keys(db.matches), ["2"]);
    assert.deepEqual(db.bans, []);
  });

  await step("sessions expire when unused and each use refreshes them", async () => {
    const { text } = await asp({ action: "createmember", membername: "idle@test", password: "pw" }, "10.0.0.1");
    const sid = prop(text, "sid");
    for (let i = 0; i < 7; i++) {
      assert.equal((await asp({ action: "getmyrobots", sessionid: sid }, "10.0.0.1")).err, "0", `use ${i}`);
      await sleep(500);
    }
    await sleep(3000);
    assert.equal((await asp({ action: "getmyrobots", sessionid: sid }, "10.0.0.1")).err, "18");
  });

  await step("limits: failed logins lock the account name, growing; the right password works after", async () => {
    assert.equal((await asp({ action: "createmember", membername: "lock@test", password: "right" }, "10.0.1.1")).err, "0");
    for (let i = 2; i <= 4; i++) assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "wrong" }, `10.0.1.${i}`)).err, "-1");
    const locked = await asp({ action: "loginmember", membername: "LOCK@test", password: "right" }, "10.0.1.5");
    assert.equal(locked.status, 429, "locked, from any address and in any case");
    await sleep(1300);
    // Unlocked after 1.2 s; three more failures lock it for twice as long.
    for (let i = 2; i <= 4; i++) assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "wrong" }, `10.0.1.${i}`)).err, "-1");
    await sleep(1300);
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.1.5")).status, 429, "the second lockout is longer");
    await sleep(1300);
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.1.5")).err, "0");
    // Locked again by a stranger: its owner still gets in from where it logged in before.
    for (let i = 2; i <= 4; i++) assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "wrong" }, `10.0.1.${i}`)).err, "-1");
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.1.6")).status, 429);
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.1.5")).err, "0");
  });

  await step("limits: failed logins lock the address", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await asp({ action: "loginmember", membername: `nobody${i}@test`, password: "x" }, "10.0.2.1")).err, "-1");
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.2.1")).status, 429);
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.2.2")).err, "0", "other addresses aren't");
  });

  await step("limits: accounts per address per day", async () => {
    assert.equal((await asp({ action: "createmember", membername: "n1@test", password: "pw" }, "10.0.3.1")).err, "0");
    assert.equal((await asp({ action: "createmember", membername: "n2@test", password: "pw" }, "10.0.3.1")).err, "0");
    assert.equal((await asp({ action: "createmember", membername: "n1@test", password: "pw" }, "10.0.3.1")).err, "-103", "a taken name still says so");
    assert.equal((await asp({ action: "createmember", membername: "n3@test", password: "pw" }, "10.0.3.1")).status, 429);
    assert.equal((await asp({ action: "createmember", membername: "n3@test", password: "pw" }, "10.0.3.2")).err, "0");
  });

  await step("limits: main.asp requests per address per minute", async () => {
    for (let i = 0; i < 40; i++) assert.equal((await asp({ action: "PingPayMember" }, "10.0.4.1")).status, 200, `request ${i}`);
    assert.equal((await asp({ action: "PingPayMember" }, "10.0.4.1")).status, 429);
    assert.equal((await asp({ action: "PingPayMember" }, "10.0.4.2")).status, 200);
  });

  await step("limits: a session-less paint map save from another address than the owner's is refused", async () => {
    const sid = prop((await asp({ action: "createmember", membername: "painter@test", password: "pw" }, "10.0.5.1")).text, "sid");
    const robotid = prop((await asp({ action: "createrobot", sessionid: sid, robotname: "Painter" }, "10.0.5.1")).text, "robotid");
    const map = { action: "setrobotmap", robotid, robotname: "Painter", map: "****" };
    assert.equal((await asp(map, "10.0.5.2")).err, "-1");
    assert.equal((await asp(map, "10.0.5.1")).err, "0");
  });

  await step("bans by address: no login and no sockets from it", async () => {
    const ban = await asp({ action: "adminban", who: "ip:10.0.6.1", reason: "test", token: ADMIN_TOKEN });
    assert.equal(ban.err, "0", ban.text);
    assert.equal((await asp({ action: "adminban", who: "ip:10.0.6.9", token: ADMIN_TOKEN }, "10.0.6.9")).err, "-1", "admin only unproxied");
    assert.equal((await asp({ action: "loginmember", membername: "lock@test", password: "right" }, "10.0.6.1")).err, "-1");
    await assert.rejects(ws2("/ws/irc?addr=1.1.1.1", "10.0.6.1"), /403/);
    (await ws2("/ws/irc?addr=1.1.1.1", "10.0.6.2")).close();
    assert.match((await asp({ action: "adminbans", token: ADMIN_TOKEN })).text, /#address: "10\.0\.6\.1", #reason: "test"/);
  });

  await step("limits: WebSocket connections per address, new ones per minute", async () => {
    const open3 = [];
    for (let i = 0; i < 3; i++) open3.push(await ws2("/ws/irc?addr=1.1.1.1", "10.0.7.1"));
    await assert.rejects(ws2("/ws/irc?addr=1.1.1.1", "10.0.7.1"), /429/);
    (await ws2("/ws/irc?addr=1.1.1.1", "10.0.7.2")).close();
    for (const ws of open3) ws.close();
    for (let i = 0; i < 6; i++) {
      const ws = await ws2("/ws/irc?addr=1.1.1.1", "10.0.8.1");
      ws.close();
      await waitFor(() => ws.closed, "closed");
    }
    await assert.rejects(ws2("/ws/irc?addr=1.1.1.1", "10.0.8.1"), /429/);
  });

  await step("limits: message size, the heartbeat, and the lobby's registration timeout", async () => {
    const big = await ws2("/ws/irc?addr=1.1.1.1", "10.0.9.1");
    big.send("x".repeat(9 * 1024));
    await waitFor(() => big.closed, "an oversized message closing the socket");
    assert.equal(big.code, 1009);
    const dead = await ws2("/ws/irc?addr=1.1.1.1", "10.0.9.2", { autoPong: false });
    const alive = await ws2("/ws/irc?addr=1.1.1.1", "10.0.9.3");
    await ircLogin(alive, "_R0Alive4F2A");
    await waitFor(() => dead.closed, "a socket that doesn't answer pings closing", 3000);
    const silent = await ws2("/ws/irc?addr=1.1.1.1", "10.0.9.4");
    await waitFor(() => silent.closed, "an unregistered lobby connection closing", 3000);
    assert.ok(!alive.closed, "a live, registered connection stays");
    alive.close();
  });

  await step("limits: lobby line length, flood and chat", async () => {
    const long = await ws2("/ws/irc?addr=1.1.1.1", "10.0.10.1");
    long.send(`PRIVMSG #room :${"x".repeat(400)}\n\r`);
    await waitFor(() => long.closed, "a too-long line closing the connection");
    assert.ok(long.lines.some((l) => /^ERROR .*Line too long/.test(l)));
    const flood = await ws2("/ws/irc?addr=1.1.1.1", "10.0.10.2");
    await ircLogin(flood, "_R0Flood4F2A");
    flood.send("PING x\n\r".repeat(40));
    await waitFor(() => flood.closed, "a flood closing the connection");
    assert.ok(flood.lines.some((l) => /^ERROR .*Excess Flood/.test(l)));
    const talker = await ws2("/ws/irc?addr=1.1.1.1", "10.0.10.3");
    const listener = await ws2("/ws/irc?addr=1.1.1.1", "10.0.10.4");
    await ircLogin(talker, "_R0Talker4F2A");
    await ircLogin(listener, "_R0Listener4F2A");
    for (const ws of [talker, listener]) ws.send("JOIN #rw1e\n\r");
    await waitFor(() => talker.lines.some((l) => l.includes(" JOIN ") && l.includes("Listener")), "both in the room");
    for (let i = 0; i < 8; i++) talker.send(`PRIVMSG #rw1e :hello ${i}\n\r`);
    talker.send("PRIVMSG _R0Listener4F2A :SMUS_SendIP  \n\r");
    await waitFor(() => listener.lines.some((l) => l.includes("SMUS_SendIP")), "the private message after the chat");
    assert.equal(listener.lines.filter((l) => l.includes("PRIVMSG #rw1e")).length, 3, "chat beyond the limit is dropped");
    assert.ok(!talker.closed, "but the talker stays");
    talker.close();
    listener.close();
  });

  await step("limits: relay frame size, message rate and peers per host", async () => {
    const frame = (sender, subject, content = "") => buildMessage({ subject, sender, recipients: ["Host"], contentString: content });
    const host = await ws2("/ws/p2p/listen?addr=10.9.0.1&user=Host", "10.0.11.1");
    const guest = async (name, from) => {
      const ws = await ws2("/ws/p2p/connect?addr=10.9.0.1", from);
      ws.send(frame(name, "Logon", "x"));
      return ws;
    };
    // A frame claiming 4 GB.
    const liar = await guest("Liar", "10.0.11.2");
    liar.send(Buffer.from([0x72, 0x00, 0xff, 0xff, 0xff, 0xff, 0, 0]));
    await waitFor(() => liar.closed, "an oversized frame closing the socket");
    assert.equal(liar.code, 1008);
    // A match's traffic passes; a flood doesn't.
    const fast = await guest("Fast", "10.0.11.3");
    for (let i = 0; i < 30; i++) fast.send(frame("Fast", "pos", "1,2,3"));
    await sleep(200);
    assert.ok(!fast.closed, "30 messages at once pass (the burst is 2 s of the rate)");
    for (let i = 0; i < 30; i++) fast.send(frame("Fast", "pos", "1,2,3"));
    await waitFor(() => fast.closed, "a flood closing the socket");
    // Two peers per host here; a third is turned away.
    const p1 = await guest("One", "10.0.11.4");
    const p2 = await guest("Two", "10.0.11.5");
    const p3 = await guest("Three", "10.0.11.6");
    await waitFor(() => p3.closed, "a third peer turned away");
    assert.ok(!p1.closed && !p2.closed);
    for (const ws of [host, p1, p2]) ws.close();
  });

  // ---------------------------------------------------------------- hosted
  // A third server as docker-compose.yml runs it: the lobby and paint map saves need a session.
  const PORT3 = PORT + 2000;
  const HTTP3 = `http://127.0.0.1:${PORT3}`;
  const dataDir3 = join(dataDir, "hosted");
  mkdirSync(dataDir3);
  server3 = startServer(dataDir3, PORT3, { IRC_REQUIRE_SESSION: "1", MAP_REQUIRE_SESSION: "1" });
  await server3.ready;
  const host = { email: "host@test", robotname: "Hosted" };
  host.sid = prop(await mainAsp({ action: "createmember", membername: host.email, password: "pw" }, HTTP3), "sid");
  host.robotid = prop(await mainAsp({ action: "createrobot", sessionid: host.sid, robotname: host.robotname }, HTTP3), "robotid");
  const stranger = prop(await mainAsp({ action: "createmember", membername: "stranger@test", password: "pw" }, HTTP3), "sid");

  await step("IRC_REQUIRE_SESSION: a nick with its owner's session is taken; an empty PASS, nopwd or another's session is refused", async () => {
    const WS3 = `ws://127.0.0.1:${PORT3}`;
    const own = await Irc.connect("10.4.4.1", WS3);
    await own.login("_R0Hosted0000", host.sid);
    own.ws.close();
    for (const [pass, why] of [["", /Session required/], ["nopwd", /Session required/], ["0123456789abcdef01234567", /Session required/], [stranger, /Not your robot/]]) {
      const irc = await Irc.connect("10.4.4.2", WS3);
      irc.send(`PASS ${pass}`);
      irc.send("NICK _R0Hosted0000");
      irc.send("USER Shockplay 0 * _R0Hosted0000");
      await waitFor(() => irc.closed, `PASS ${JSON.stringify(pass)} refused`);
      assert.ok(irc.lines.some((l) => why.test(l)) && !irc.lines.some((l) => l.split(" ")[1] === "001"), `PASS ${JSON.stringify(pass)}: ${irc.lines.join(" | ")}`);
    }
  });

  await step("MAP_REQUIRE_SESSION: paint map saves need the owner's session, even from its address", async () => {
    const map = (extra = {}) => mainAsp({ action: "setrobotmap", robotid: host.robotid, robotname: host.robotname, map: "(*\u00ff*", ...extra }, HTTP3);
    // The owner's session was just used from this address, which would do without the setting.
    assert.equal(prop(await mainAsp({ action: "getmyrobots", sessionid: host.sid }, HTTP3), "err"), "0");
    assert.equal(prop(await map(), "err"), "-1", "no session");
    assert.equal(prop(await map({ sessionid: stranger }), "err"), "-1", "another member's session");
    assert.equal(prop(await map({ sessionid: host.sid }), "err"), "0", "its owner's session");
    assert.equal(await mainAsp({ action: "getrobotmap", sessionid: host.sid, robotid: host.robotid }, HTTP3), "(*\u00ff*");
  });

  console.log(`\n${results.length} checks passed`);
} catch (err) {
  console.error(`\nFAILED after ${results.length} checks:`, err);
  process.exitCode = 1;
} finally {
  server.child.kill();
  server2?.child.kill();
  server3?.child.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
