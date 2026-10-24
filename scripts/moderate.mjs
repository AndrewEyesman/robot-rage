// Kick and ban players, without a UI (the maintainer).
//
//   node scripts/moderate.mjs list                             the bans in force
//   node scripts/moderate.mjs kick <who> [--ip]                end their sessions, close their
//                                                              lobby and match sockets (online only)
//   node scripts/moderate.mjs ban <who> [--days N] [--reason "text"] [--ip]
//   node scripts/moderate.mjs unban <who> | --id <ban id>
//
// <who>: a login (email), a robot's name or id (meaning its owner's account), or
// ip:<address>. --ip with an account also kicks/bans the address it last used a
// session from (the server keeps that in memory only, so online only). A banned
// account can't log in or join the lobby; a banned address can't log in, make
// accounts, use a session or open the lobby and match sockets. --days 0 or none:
// for good.
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
const [command, who] = args;

const usage = () => {
  console.error("usage: node scripts/moderate.mjs list | kick <who> [--ip] | ban <who> [--days N] [--reason text] [--ip] | unban <who> | unban --id <n>  [--data file | --url server]");
  process.exit(2);
};
if (!["list", "kick", "ban", "unban"].includes(command) || !Number.isFinite(days) || days < 0) usage();
if ((command === "kick" || command === "ban") && !who) usage();
if (command === "unban" && !who && !banId) usage();

/** A property list reply as a plain object (lists of property lists included). */
const plain = (v) =>
  v instanceof LingoPropList
    ? Object.fromEntries(v.entries.map(([k, x]) => [k.name ?? String(k), plain(x)]))
    : Array.isArray(v)
      ? v.map(plain)
      : v;

const showBans = (bans) => {
  if (!bans.length) return console.log("no bans");
  for (const b of bans) {
    const what = b.account ? `account ${b.account}` : `address ${b.address}`;
    console.log(`#${b.id}  ${what}  since ${b.created}  ${b.expires ? `until ${b.expires}` : "for good"}${b.reason ? `  (${b.reason})` : ""}`);
  }
};

if (url) {
  const action = { list: "adminbans", kick: "adminkick", ban: "adminban", unban: "adminunban" }[command];
  const fields = { action, token: process.env.ADMIN_TOKEN ?? "", who: who ?? "", days: String(days), reason, withip: withIp ? "1" : "0", ...(banId ? { id: banId } : {}) };
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
  if (command === "list") showBans(reply.bans ?? []);
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
