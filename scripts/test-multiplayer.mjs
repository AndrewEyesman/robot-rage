// End-to-end check of the lobby (IRC) and match relay, driving two players
// the way the game does: registration, room list, opponent lookup, challenge,
// P2P handshake, arena traffic, disconnects and the score report.
//
//   node scripts/test-multiplayer.mjs
//
// Starts its own server on a free port with a throwaway DATA_DIR.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { buildMessage, parseEnvelope } from "../server/relay.mjs";

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

function startServer(dataDir) {
  const child = spawn(process.execPath, [join(ROOT, "server/index.mjs")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ICE_SERVERS: "stun:stun.test.invalid:3478, stun:other.test.invalid", ADMIN_TOKEN },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (process.env.VERBOSE) process.stdout.write(chunk);
  });
  return { child, ready: waitFor(() => output.includes("Robot Rage server on"), "server start", 5000) };
}

async function mainAsp(fields) {
  const res = await fetch(`${HTTP}/api/main.asp`, { method: "POST", body: new URLSearchParams(fields) });
  return res.text();
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
  static async connect(addr) {
    const irc = new Irc();
    irc.ws = await open(`${WS}/ws/irc?addr=${addr}`);
    irc.lines = [];
    irc.closed = false;
    irc.ws.on("message", (data) => irc.lines.push(...String(data).split(/\r?\n/).filter(Boolean)));
    irc.ws.on("close", () => (irc.closed = true));
    return irc;
  }

  send(line) {
    this.ws.send(`${line}\n\r`);
  }

  async login(nick) {
    this.send("PASS ");
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

  ircB.ws.close();
  hostA.ws.close();
  console.log(`\n${results.length} checks passed`);
} catch (err) {
  console.error(`\nFAILED after ${results.length} checks:`, err);
  process.exitCode = 1;
} finally {
  server.child.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
