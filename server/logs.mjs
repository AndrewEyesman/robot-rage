// The server's log: a line per event on stdout, and with LOG_DIR also in one file per
// day there, files older than LOG_DAYS (default 14) deleted. The log holds players'
// addresses (port/web/privacy.html says how long they're kept), never passwords or
// session ids: redact() takes those out of request parameters before they're logged.
//
// Without LOG_DIR, stdout's keeper decides how long lines live: under Docker, set the
// json-file driver's max-size and max-file (or journald's retention) to match.

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DAY = 24 * 60 * 60_000;

export function createLog({ dir = process.env.LOG_DIR || "", days = Number(process.env.LOG_DAYS || 14) } = {}) {
  let today = "";
  const prune = (now) => {
    for (const name of readdirSync(dir)) {
      const m = /^server-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
      if (m && now - Date.parse(m[1]) > days * DAY) unlinkSync(join(dir, name));
    }
  };
  if (dir) mkdirSync(dir, { recursive: true });
  return (...args) => {
    const now = new Date();
    console.log(now.toISOString(), ...args);
    if (!dir) return;
    try {
      const day = now.toISOString().slice(0, 10);
      if (day !== today) {
        today = day;
        prune(now.getTime());
      }
      const text = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack : JSON.stringify(a))).join(" ");
      appendFileSync(join(dir, `server-${day}.log`), `${now.toISOString()} ${text}\n`);
    } catch (err) {
      console.error("log file:", err.message);
    }
  };
}

const SECRET = new Set(["password", "sessionid", "token", "sid", "chksum", "checksum"]);
const BULKY = new Set(["proplist", "map", "gamegescription"]);

/** Request parameters fit for the log: secrets out, robot data and paint maps shortened. */
export function redact(params) {
  const out = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    const k = key.toLowerCase();
    if (SECRET.has(k)) out[key] = "<redacted>";
    else if (BULKY.has(k) || String(value).length > 200) out[key] = `<${String(value).length} chars>`;
    else out[key] = value;
  }
  return out;
}

/**
 * A main.asp reply fit for the log: the session id out, and short. A reply that isn't a
 * property list (a paint map) shows as its length; a robot's data (#propertyList,
 * #gameDescription) and whatever follows it as "..." with the reply's length.
 */
export function redactReply(text, max = 200) {
  if (!text.startsWith("[")) return `<${text.length} chars>`;
  let out = text.replace(/(#sid:\s*)"[^"]*"/gi, '$1"<redacted>"');
  const bulky = out.search(/,\s*#(propertyList|gameDescription)\b/i);
  if (bulky >= 0) out = `${out.slice(0, bulky)}, ...] (${text.length} chars)`;
  return out.length > max ? `${out.slice(0, max)}...` : out;
}
