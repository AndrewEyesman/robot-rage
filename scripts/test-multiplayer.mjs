// End-to-end check of the lobby (IRC) and match relay, driving two players
// the way the game does: registration, room list, opponent lookup, challenge,
// P2P handshake, arena traffic, disconnects and the score report.
//
//   node scripts/test-multiplayer.mjs
//
// Starts its own server on a free port with a throwaway DATA_DIR.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
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
    Object.assign(peer, { ws, user, messages: [], closed: false });
    ws.on("message", (data) => peer.messages.push(parseEnvelope(Buffer.from(data))));
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

  await step("match start is logged with setrwgames (no session)", async () => {
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

  await step("setrobotscore from the winner updates both robots", async () => {
    const report = await mainAsp({
      action: "setrobotscore", sessionid: b.sid, robotid: b.robotid, robotname: b.robotname,
      user1id: b.robotid, user2id: a.robotid, winner: b.robotid, checksum: 7,
    });
    assert.equal(prop(report, "err"), "0");
    const winner = await mainAsp({ action: "getrobotall", robotid: b.robotid });
    const loser = await mainAsp({ action: "getrobotall", robotid: a.robotid });
    assert.equal(prop(winner, "score"), "10");
    assert.match(winner, /#Win: 1, #lose: 0/);
    assert.equal(prop(loser, "score"), "0");
    assert.match(loser, /#Win: 0, #lose: 1/);
    const forged = await mainAsp({
      action: "setrobotscore", sessionid: a.sid, robotid: a.robotid,
      user1id: b.robotid, user2id: a.robotid, winner: b.robotid,
    });
    assert.equal(prop(forged, "err"), "-1");
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
