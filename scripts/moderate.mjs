// Kick and ban players, without a UI (the maintainer).
//
//   node scripts/moderate.mjs list                             the bans in force
//   node scripts/moderate.mjs kick <who> [--ip]                end their sessions, close their
//                                                              lobby and match sockets (online only)
//   node scripts/moderate.mjs ban <who> [--days N] [--reason "text"] [--ip]
//   node scripts/moderate.mjs unban <who> | --id <ban id>
//   node scripts/moderate.mjs record <who>                     the account's ranked rounds, the
//                                                              voided ones counted against it, and
//                                                              its recent matches (with their voids)
//   node scripts/moderate.mjs reports [--limit N]              the latest abuse reports (default
//                                                              20), each with its match and chat
//
// <who>: a login (email), a robot's name or id (meaning its owner's account), or
// ip:<address>. --ip with an account also kicks/bans the address it last used a
// session from (the server keeps that in memory only, so online only). A banned
// account can't log in or join the lobby; a banned address can't log in, make
// accounts, use a session or open the lobby and match sockets. --days 0 or none:
// for good.
//
// Voids (server/results.mjs): "disagreed" counts against both players, "unanswered"
// against the one who never reported. Lag voids rounds too (an arena with a high ping
// doesn't report), so a few mean nothing; look for an account that voids far more of its
// rounds than others do, against several opponents, before acting.
//
// Offline (the default) edits the data file: stop the server first (it rewrites the
// file from memory). --data picks the file (default $DATA_DIR/db.json or data/db.json).
// Online, --url http://127.0.0.1:<port> asks the running server, which must have
// been started with ADMIN_TOKEN (this reads it from the environment) and answers
// only requests from its own machine.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../server/store.mjs";
import { parseLingo, LingoPropList } from "../server/lingo.mjs";
import { abuseReports, accountRecord } from "../server/moderation.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const toggle = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const url = flag("--url");
const dataFile = flag("--data") ?? join(process.env.DATA_DIR || join(ROOT, "data"), "db.json");
const days = Number(flag("--days") ?? 0);
const reason = flag("--reason") ?? "";
const banId = flag("--id");
const withIp = toggle("--ip");
const limit = Number(flag("--limit") ?? 20);
const [command, who] = args;

const usage = () => {
  console.error("usage: node scripts/moderate.mjs list | kick <who> [--ip] | ban <who> [--days N] [--reason text] [--ip] | unban <who> | unban --id <n> | record <who> | reports [--limit N]  [--data file | --url server]");
  process.exit(2);
};
if (!["list", "kick", "ban", "unban", "record", "reports"].includes(command) || !Number.isFinite(days) || days < 0 || !(limit >= 1)) usage();
if ((command === "kick" || command === "ban" || command === "record") && !who) usage();
if (command === "unban" && !who && !banId) usage();

/** A property list reply as a plain object (lists of property lists included). */
const plain = (v) =>
  v instanceof LingoPropList
    ? Object.fromEntries(v.entries.map(([k, x]) => [k.name ?? String(k), plain(x)]))
    : Array.isArray(v)
      ? v.map(plain)
      : v;

const showRecord = ({ account, robots, record, matches }) => {
  const voids = record.disagreed + record.unanswered;
  const share = record.rounds + voids ? ` (${Math.round((100 * voids) / (record.rounds + voids))}% of its rounds)` : "";
  console.log(`${account}: robots ${robots.join(", ") || "none"}`);
  console.log(`  ${record.rounds} confirmed round(s); voids against it: ${record.disagreed} disagreed, ${record.unanswered} unanswered${share}`);
  if (!matches.length) console.log("  no matches on record (they're kept a week)");
  for (const m of matches) showMatch(m, "  ");
};

const showMatch = (m, indent = "") => {
  console.log(`${indent}match ${m.id}  ${m.started}  ${m.score}  (${m.state})`);
  for (const l of m.left) console.log(`${indent}  left: ${l}`);
  for (const v of m.voids) console.log(`${indent}  void ${v.at}  ${v.kind}  ${v.reports.join("; ")}  against: ${v.against.join(", ") || "nobody"}`);
};

const showReports = (reports) => {
  if (!reports.length) return console.log("no abuse reports");
  for (const r of reports) {
    console.log(`#${r.id}  ${r.at}  ${r.reporter} reported ${r.reported}`);
    if (r.match) showMatch(r.match, "  ");
    else console.log("  no match between them on record");
    if (r.chat) console.log(r.chat.replace(/\r\n?|\n/g, "\n").split("\n").map((line) => `  | ${line}`).join("\n"));
  }
};

const showBans = (bans) => {
  if (!bans.length) return console.log("no bans");
  for (const b of bans) {
    const what = b.account ? `account ${b.account}` : `address ${b.address}`;
    console.log(`#${b.id}  ${what}  since ${b.created}  ${b.expires ? `until ${b.expires}` : "for good"}${b.reason ? `  (${b.reason})` : ""}`);
  }
};

if (url) {
  const action = { list: "adminbans", kick: "adminkick", ban: "adminban", unban: "adminunban", record: "adminrecord", reports: "adminreports" }[command];
  const fields = { action, token: process.env.ADMIN_TOKEN ?? "", who: who ?? "", days: String(days), reason, withip: withIp ? "1" : "0", limit: String(limit), ...(banId ? { id: banId } : {}) };
  const res = await fetch(`${url.replace(/\/$/, "")}/api/main.asp`, { method: "POST", body: new URLSearchParams(fields) });
  const text = await res.text();
  let reply;
  try {
    reply = plain(parseLingo(text));
  } catch {
    reply = undefined;
  }
  if (!reply || reply.err !== 0) {
    console.error(`refused: ${text.trim()}${process.env.ADMIN_TOKEN ? "" : " (is ADMIN_TOKEN set, here and on the server?)"}`);
    process.exit(1);
  }
  const json = () => JSON.parse(Buffer.from(reply.json, "base64").toString("utf8"));
  if (command === "list") showBans(reply.bans ?? []);
  else if (command === "record") showRecord(json());
  else if (command === "reports") showReports(json());
  else console.log(Object.entries(reply).filter(([k]) => k !== "err").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n"));
  process.exit(0);
}

const store = new Store(dataFile);
const iso = (t) => (t ? new Date(t).toISOString() : "");

/** As the server's targetOf (server/api.mjs). */
function targetOf(text) {
  text = String(text ?? "").trim();
  if (text.toLowerCase().startsWith("ip:")) return { address: text.slice(3).trim() };
  const robot = store.robot(text) ?? store.robotByName(text);
  const member = store.findMember(text) ?? (robot && store.memberById(robot.memberId));
  return member ? { member } : undefined;
}

switch (command) {
  case "list":
    showBans(store.activeBans().map((b) => ({ ...b, created: iso(b.created), expires: iso(b.expires) })));
    break;
  case "kick": {
    const target = targetOf(who);
    if (!target) fail(`no account or robot ${who} in ${dataFile}`);
    if (!target.member) fail("kicking an address needs the running server (--url)");
    console.log(`${target.member.name}: ${store.endSessionsOf(target.member.name)} session(s) ended (nothing else to close: the server isn't running)`);
    break;
  }
  case "ban": {
    const target = targetOf(who);
    if (!target) fail(`no account or robot ${who} in ${dataFile}`);
    if (withIp) console.log("--ip: the account's last address is known only to the running server (--url); banning the account alone");
    const expires = days ? Date.now() + days * 24 * 60 * 60_000 : undefined;
    const ban = store.addBan({ account: target.member?.name, address: target.address, reason, expires });
    const ended = target.member ? store.endSessionsOf(target.member.name) : 0;
    console.log(`#${ban.id}: banned ${ban.account ? `account ${ban.account}` : `address ${ban.address}`} ${days ? `for ${days} day(s)` : "for good"}; ${ended} session(s) ended`);
    break;
  }
  case "record": {
    const target = targetOf(who);
    if (!target?.member) fail(`no account or robot ${who} in ${dataFile}`);
    showRecord(accountRecord(store, target.member));
    break;
  }
  case "reports":
    showReports(abuseReports(store, limit));
    break;
  case "unban": {
    const target = banId ? {} : (targetOf(who) ?? { account: who });
    const lifted = store.removeBans({ id: banId, account: target.member?.name ?? target.account, address: target.address });
    console.log(lifted.length ? `lifted ${lifted.map((b) => `#${b.id}`).join(", ")}` : "no such ban");
    if (!lifted.length) process.exitCode = 1;
    break;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
