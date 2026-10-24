// Grant credits to a robot, for testing (the maintainer). The credits are queued and
// paid into the robot's saved data (money and its check value #info1 together)
// when its owner next loads the robot, or saves it from the port's garage.
//
//   node scripts/grant-credits.mjs <robotname|robotid> <amount> [--set] [--data data/db.json]
//       edits the data file; stop the server first (it rewrites the file from memory)
//   node scripts/grant-credits.mjs <robot> <amount> [--set] --url http://127.0.0.1:8080
//       asks a running server, which must have been started with ADMIN_TOKEN (this
//       reads it from the environment) and only answers requests from its own machine
//
// --set makes the robot's money exactly <amount> instead of adding it. A negative
// amount takes credits away (never below 0).

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { queueCredit, ledgerOf } from "../server/economy.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const set = args.includes("--set");
if (set) args.splice(args.indexOf("--set"), 1);
const url = flag("--url");
const dataFile = flag("--data") ?? join(process.env.DATA_DIR || join(ROOT, "data"), "db.json");
const [robotArg, amountArg] = args;
const amount = Number(amountArg);
if (!robotArg || !Number.isInteger(amount)) {
  console.error("usage: node scripts/grant-credits.mjs <robotname|robotid> <amount> [--set] [--data file | --url server]");
  process.exit(2);
}

if (url) {
  const body = new URLSearchParams({ action: "admingrant", robot: robotArg, amount: String(amount), set: set ? "1" : "0", token: process.env.ADMIN_TOKEN ?? "" });
  const reply = await (await fetch(`${url.replace(/\/$/, "")}/api/main.asp`, { method: "POST", body })).text();
  console.log(reply);
  process.exit(/#err: 0/.test(reply) ? 0 : 1);
}

const db = JSON.parse(readFileSync(dataFile, "utf8"));
const robots = Object.values(db.robots ?? {});
const robot = robots.find((r) => String(r.robotid) === robotArg) ?? robots.find((r) => r.robotname.toLowerCase() === robotArg.toLowerCase());
if (!robot) {
  console.error(`no robot ${robotArg} in ${dataFile}`);
  process.exit(1);
}
const value = queueCredit(robot, amount, "admin grant", { set });
writeFileSync(`${dataFile}.tmp`, JSON.stringify(db, null, 1));
renameSync(`${dataFile}.tmp`, dataFile);
const pending = robot.credits.reduce((sum, c) => sum + c.amount, 0);
console.log(`${robot.robotname} (${robot.robotid}): ${value >= 0 ? "+" : ""}${value} queued; money ${ledgerOf(robot).money} now, ${Math.max(0, ledgerOf(robot).money + pending)} once paid (next load or save)`);
