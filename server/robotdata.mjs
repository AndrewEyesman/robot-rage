// The shape of what players store and the server hands to other players: a robot's
// property list (setrobot; the lobby and the arena read it back with getrobotall),
// its paint map (setrobotmap) and its name (createrobot). The economy's checks
// (economy.mjs) come after these: here only size, syntax and the expected
// properties and types.

import { LingoPropList, LingoSymbol, parseLingo } from "./lingo.mjs";

export const MAX_ROBOT_BYTES = 16 * 1024; // a full robot is well under 1 KB
export const MAX_MAP_BYTES = 256 * 1024; // two 8-bit paint maps, run-length coded
export const MAX_LIST = 64; // parts in one slot
export const MAX_INVENTORY = 256;
export const MAX_ROBOT_NAME = 24;
export const MAX_MEMBER_NAME = 100;
export const MAX_PASSWORD = 200;

const isSymbol = (v) => v instanceof LingoSymbol && v.name.length <= 16;
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const symbolList = (max) => (v) => Array.isArray(v) && v.length <= max && v.every(isSymbol);

// The robot's properties, as the garage (robotwars clearRobotProplist, s042 load
// robot, factory0604), the arena (s002: #hacker, #speedgear) and MrDoktor (#hacker)
// write them; #nogood is the original server's mark the arena reads.
const ROBOT = {
  robotDescription: (v) => v instanceof LingoPropList && fields(v, DESCRIPTION) === undefined,
  inventory: symbolList(MAX_INVENTORY),
  money: Number.isInteger,
  info1: Number.isInteger,
  space: isNumber,
  spaceleft: isNumber,
  maxSpeed: isNumber,
  pansar: isNumber,
  saveMap: isNumber,
  soldweapons: symbolList(MAX_INVENTORY),
  hacker: isNumber,
  speedgear: isNumber,
  nogood: isNumber,
};
const DESCRIPTION = Object.fromEntries(
  ["ram", "torn", "hjul", "motor", "batteri", "vapen", "wpnPos", "special", "ammunition"].map((k) => [k, symbolList(MAX_LIST)]),
);

/** What's wrong with a property list's entries against `spec` (symbol keys, once each), or undefined. */
function fields(pl, spec) {
  const seen = new Set();
  for (const [key, value] of pl.entries) {
    if (!(key instanceof LingoSymbol)) return `a non-symbol key`;
    const name = Object.keys(spec).find((k) => k.toLowerCase() === key.name.toLowerCase());
    if (!name) return `unexpected #${key.name}`;
    if (seen.has(name)) return `#${name} twice`;
    seen.add(name);
    if (!spec[name](value)) return `bad #${name}`;
  }
  return undefined;
}

/** What's wrong with robot data from a save, or undefined. */
export function robotDataProblem(text) {
  text = String(text ?? "");
  if (text.length > MAX_ROBOT_BYTES) return `robot data too large (${text.length})`;
  let pl;
  try {
    pl = parseLingo(text);
  } catch (e) {
    return e instanceof RangeError ? "robot data nested too deep" : e.message;
  }
  if (!(pl instanceof LingoPropList)) return "robot data is not a property list";
  if (!(pl.get("robotDescription") instanceof LingoPropList)) return "no #robotDescription";
  const problem = fields(pl, ROBOT);
  if (problem) return problem;
  const rd = pl.get("robotDescription");
  const bad = fields(rd, DESCRIPTION);
  return bad ? `#robotDescription: ${bad}` : undefined;
}

/**
 * What's wrong with a paint map, or undefined. The garage's image2text (robotwars s007)
 * writes palette indices + 42 (at most 255), runs as "(" + colour + count + 40, and a
 * TAB between the chassis's map and the tower's.
 */
export function mapProblem(text) {
  text = String(text ?? "");
  if (text.length > MAX_MAP_BYTES) return `paint map too large (${text.length})`;
  if (text.split("\t").length > 2) return "more than two paint maps";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 9 && c !== 40 && (c < 42 || c > 255)) return `paint map character ${c}`;
  }
  return undefined;
}

/**
 * What's wrong with a new robot's name, or undefined: printable, no brackets (the
 * client's own rule, robot list "CreateRobot"), no quotes (Lingo strings can't hold
 * them), at most MAX_ROBOT_NAME characters.
 */
export function robotNameProblem(name) {
  if (!name) return "empty";
  if (name.length > MAX_ROBOT_NAME) return "too long";
  if (/[\x00-\x1f\x7f"[\]]/.test(name)) return "bad characters";
  return undefined;
}

/** What's wrong with a new account's login (an email address) and password, or undefined. */
export function memberProblem(name, password) {
  if (!name || !password) return "empty";
  if (name.length > MAX_MEMBER_NAME || password.length > MAX_PASSWORD) return "too long";
  if (/[\x00-\x1f\x7f"]/.test(name) || name.toLowerCase() === "__proto__") return "bad characters";
  return undefined;
}
