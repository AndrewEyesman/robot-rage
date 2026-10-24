// The server's side of the game's economy: what a robot owns and how much money
// it may have. The client keeps money and parts in its property list and saves
// the whole list (setrobot); the server keeps its own record of the last
// accepted state (the robot's "ledger": money and the parts it owns, installed or
// in the inventory) and accepts a new save only as far as legal transactions
// since then explain it:
//
//   - buying a part costs its price (`pris`, robotwars script 49, mirrored below);
//     a Super Pack's seven parts bought together cost 2100 (the port's credits
//     for super weapons, factory0604/enhancements.ts);
//   - selling a part gives 90% of its price, truncated (RegisterSale, robotwars 17);
//   - installing and removing parts is free (the parts stay the robot's);
//   - prizes and admin grants come from the server only (`credits`, below).
//
// A save whose parts can't be paid for, or whose installed parts break the
// workshop's rules, is refused. A save claiming more money than the legal
// maximum keeps the legal maximum instead. Less money than the maximum is the
// player's own loss (an info1 mismatch zeroes it; parts bought one by one cost
// more than a pack) and is kept as sent.

import { LingoPropList, LingoSymbol, parseLingo } from "./lingo.mjs";

// robotwars script 49: each part's type, price and (for tower weapons) mount.
const P = (typ, pris, tower = false) => ({ typ, pris, tower });
export const PARTS = {
  r1: P("ram", 150), r2: P("ram", 200), r3: P("ram", 400),
  t1: P("torn", 100), t2: P("torn", 130), t3: P("torn", 250),
  ma1: P("motor", 100), mb1: P("motor", 400), ma2: P("motor", 150), mb2: P("motor", 500), ma3: P("motor", 300), mb3: P("motor", 700),
  b1: P("batteri", 50), b2: P("batteri", 100), b3: P("batteri", 300),
  v13: P("vapen", 75), v2: P("vapen", 350, true), v15: P("vapen", 71), v6: P("vapen", 25), v7: P("vapen", 10), v8: P("vapen", 50),
  v14: P("vapen", 80), v10: P("vapen", 70), v11: P("vapen", 70), v12: P("vapen", 110), v21: P("vapen", 500), v22: P("vapen", 750, true),
  v23: P("vapen", 100), v24: P("vapen", 150), v25: P("vapen", 150), v26: P("vapen", 200),
  v1: P("vapen", 320), v9: P("vapen", 320), v4: P("vapen", 320, true), v16: P("vapen", 320, true), v17: P("vapen", 320, true), v3: P("vapen", 320, true),
  p1: P("paket", 500),
  v31: P("vapen", 320), v32: P("vapen", 320), v33: P("vapen", 320, true), v34: P("vapen", 320, true), v35: P("vapen", 320), v36: P("vapen", 320), v37: P("vapen", 320),
  p2: P("paket", 500),
  h1: P("hjul", 50), h2: P("hjul", 75), h3: P("hjul", 100), h4: P("hjul", 125), h5: P("hjul", 150),
};

// factory0604/enhancements.ts: what each Super Pack holds, and its credit price.
export const SUPER_PACKS = {
  p1: { contents: ["v1", "v9", "v4", "v16", "v17", "v3", "b3"], price: 2100 },
  p2: { contents: ["v31", "v32", "v33", "v34", "v35", "v36", "v37"], price: 2100 },
};

/** RegisterSale: integer(float(pris) * 0.9), and Lingo's integer() of a float truncates. */
export const saleValue = (part) => Math.trunc(PARTS[part].pris * 0.9);

/** robotwars clearRobotProplist: what a never-saved robot starts as (the client fills it in). */
export const EMPTY_ROBOT = { money: 50, parts: ["r1", "h2", "ma1", "b1"] };

/** The robotDescription slots that hold parts, and the part type each takes. */
const SLOTS = { ram: "ram", torn: "torn", hjul: "hjul", motor: "motor", batteri: "batteri", vapen: "vapen" };
/** Slots the client keeps but never fills; any part found there still counts as owned. */
const OTHER_SLOTS = ["special", "ammunition"];

const symName = (v) => (v instanceof LingoSymbol ? v.name.toLowerCase() : undefined);

export class RobotDataError extends Error {}

/**
 * A robot property list (setrobot's proplist): its money, armour, installed parts
 * by slot, inventory, and where money, info1 and pansar sit in the text.
 */
export function parseRobot(text) {
  let pl;
  try {
    pl = parseLingo(String(text ?? ""));
  } catch (e) {
    throw new RobotDataError(e.message);
  }
  if (!(pl instanceof LingoPropList)) throw new RobotDataError("not a property list");
  const rd = pl.get("robotDescription");
  if (!(rd instanceof LingoPropList)) throw new RobotDataError("no robotDescription");
  const partList = (v, where) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new RobotDataError(`${where} is not a list`);
    return v.map((x) => {
      const id = symName(x);
      if (!id || !PARTS[id]) throw new RobotDataError(`${where}: unknown part ${String(x?.name ?? x)}`);
      return id;
    });
  };
  const slots = {};
  for (const slot of Object.keys(SLOTS)) slots[slot] = partList(rd.get(slot), slot);
  const other = OTHER_SLOTS.flatMap((slot) => partList(rd.get(slot), slot));
  const inventory = partList(pl.get("inventory"), "inventory");
  const money = pl.get("money");
  if (!Number.isInteger(money)) throw new RobotDataError("money is not an integer");
  const pansar = pl.get("pansar");
  if (pansar !== undefined && typeof pansar !== "number") throw new RobotDataError("pansar is not a number");
  return {
    money,
    info1: pl.get("info1"),
    pansar,
    slots,
    inventory,
    owned: [...Object.values(slots).flat(), ...other, ...inventory],
    spans: { money: pl.entry("money"), info1: pl.entry("info1"), pansar: pl.entry("pansar") },
  };
}

/** Whether a property list is a saved robot (a never-saved one is stored as []). */
export function isRobotData(text) {
  try {
    parseRobot(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The workshop's rules for installed parts (factory0604 "use framescript" UsePart):
 * one chassis, engine, tower and set of wheels, two batteries, nothing without a
 * chassis, each weapon once, one tower weapon and only with a tower, no tower with
 * the Power Axe. Returns what's broken, or undefined.
 */
export function structureProblem(slots) {
  for (const [slot, typ] of Object.entries(SLOTS)) {
    for (const part of slots[slot]) if (PARTS[part].typ !== typ) return `${part} in ${slot}`;
  }
  for (const slot of ["ram", "motor", "torn", "hjul"]) if (slots[slot].length > 1) return `more than one ${slot}`;
  if (slots.batteri.length > 2) return "more than two batteries";
  if (!slots.ram.length && Object.values(slots).some((l) => l.length)) return "parts without a chassis";
  if (new Set(slots.vapen).size !== slots.vapen.length) return "the same weapon twice";
  const towerWeapons = slots.vapen.filter((v) => PARTS[v].tower);
  if (towerWeapons.length > 1) return "more than one tower weapon";
  if (towerWeapons.length && !slots.torn.length) return "a tower weapon without a tower";
  if (slots.vapen.includes("v8") && slots.torn.length) return "a tower with the Power Axe";
  return undefined;
}

/** The armour limit for a chassis and tower (factory0604 addcounter button's getmax). */
export function maxArmour(slots) {
  const tower = slots.torn[0];
  const table = { r1: [83, 126, 146, 166], r2: [125, 167, 187, 208], r3: [166, 209, 229, 249] }[slots.ram[0]];
  if (!table) return 0;
  return table[{ t1: 1, t2: 2, t3: 3 }[tower] ?? 0];
}

const count = (list) => {
  const m = {};
  for (const x of list) m[x] = (m[x] || 0) + 1;
  return m;
};

/** The cheapest way to have bought these parts: their prices, less the packs' discount where a whole pack is there. */
export function cheapestCost(added) {
  const n = count(added);
  let cost = added.reduce((sum, part) => sum + PARTS[part].pris, 0);
  for (const pack of Object.values(SUPER_PACKS)) {
    const k = Math.min(...pack.contents.map((part) => n[part] || 0));
    const single = pack.contents.reduce((sum, part) => sum + PARTS[part].pris, 0);
    if (k > 0 && single > pack.price) cost -= k * (single - pack.price);
  }
  return cost;
}

/** The ledger (money and owned parts, sorted) for stored robot data, or a never-saved robot's. */
export function ledgerFor(propertyList) {
  try {
    const r = parseRobot(propertyList);
    // The client zeroes money whose info1 doesn't match (load robot, robotwars 42).
    const money = r.info1 === undefined || r.info1 === 1112 - r.money ? r.money : 0;
    return { money: Math.max(0, money), parts: [...r.owned].sort() };
  } catch {
    return { money: EMPTY_ROBOT.money, parts: [...EMPTY_ROBOT.parts].sort() };
  }
}

/** Replace top-level values (from parseRobot's spans) in the text, keeping the rest byte for byte. */
export function rewrite(text, changes) {
  const edits = changes.filter(([entry]) => entry).map(([entry, v]) => [entry[2], entry[3], String(v)]);
  edits.sort((a, b) => b[0] - a[0]);
  for (const [start, end, v] of edits) text = text.slice(0, start) + v + text.slice(end);
  return text;
}

/** Text with its money (and info1, the client's check value) set. */
export function withMoney(text, money) {
  const r = parseRobot(text);
  return rewrite(text, [
    [r.spans.money, money],
    [r.spans.info1, 1112 - money],
  ]);
}

/**
 * Check a save against the ledger. Returns { ok: false, reason } for a save to
 * refuse, or { ok: true, text, money, ledger, notes } with the text to store
 * (money clamped to what the ledger allows, armour to its limit).
 */
export function checkSave(ledger, text, previousText) {
  let r;
  try {
    r = parseRobot(text);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  // Rules apply to changed installations: a robot saved before they existed keeps working.
  let previousSlots;
  try {
    previousSlots = parseRobot(previousText).slots;
  } catch {
    previousSlots = undefined;
  }
  const problem = structureProblem(r.slots);
  if (problem && JSON.stringify(previousSlots) !== JSON.stringify(r.slots)) return { ok: false, reason: problem };

  const before = count(ledger.parts);
  const after = count(r.owned);
  const added = [];
  const removed = [];
  for (const part of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[part] || 0) - (before[part] || 0);
    for (let i = 0; i < d; i++) added.push(part);
    for (let i = 0; i < -d; i++) removed.push(part);
  }
  const allowed = ledger.money + removed.reduce((sum, part) => sum + saleValue(part), 0) - cheapestCost(added);
  if (allowed < 0) return { ok: false, reason: `parts worth more than the robot's money (${added.join(" ")})` };

  const notes = [];
  const money = Math.min(Math.max(r.money, 0), allowed);
  if (money !== r.money) notes.push(`money ${r.money} -> ${money}`);
  const changes = [];
  if (money !== r.money || (r.info1 !== undefined && r.info1 !== 1112 - r.money)) {
    changes.push([r.spans.money, money], [r.spans.info1, 1112 - money]);
  }
  const armour = maxArmour(r.slots);
  if (typeof r.pansar === "number" && r.pansar > armour) {
    changes.push([r.spans.pansar, armour]);
    notes.push(`pansar ${r.pansar} -> ${armour}`);
  }
  return { ok: true, text: rewrite(text, changes), money, ledger: { money, parts: [...r.owned].sort() }, notes, added, removed };
}

// ---------------------------------------------------------------- stored robots

/** A stored robot's ledger, made from its saved data the first time (the migration of robots saved before the ledger). */
export function ledgerOf(robot) {
  return (robot.ledger ||= ledgerFor(robot.propertyList));
}

/**
 * Queue credits for a robot (a prize or an admin grant). They're paid into its
 * saved data when its owner next loads the robot (getrobot) or saves it with a
 * client that takes the server's money back (setrobot with economy=1): paying
 * them while a client holds an older copy would be undone by that client's next
 * save, which may always keep less money than the ledger allows.
 * `set`: make the robot's money exactly `amount` instead.
 */
export function queueCredit(robot, amount, reason, { set = false } = {}) {
  const ledger = ledgerOf(robot);
  const pending = (robot.credits ||= []);
  const queued = pending.reduce((sum, c) => sum + c.amount, 0);
  const value = set ? amount - (ledger.money + queued) : amount;
  pending.push({ amount: value, reason, at: Date.now() });
  return value;
}

/** Pay a robot's queued credits into its saved data. Returns the amount paid (0 when it has none or was never saved). */
export function payCredits(robot) {
  if (!robot.credits?.length || !isRobotData(robot.propertyList)) return 0;
  const ledger = ledgerOf(robot);
  const total = robot.credits.reduce((sum, c) => sum + c.amount, 0);
  const money = Math.max(0, ledger.money + total);
  robot.propertyList = withMoney(robot.propertyList, money);
  ledger.money = money;
  robot.credits = [];
  return total;
}
