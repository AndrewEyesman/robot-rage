// Errors from players' browsers (POST /api/clienterror, from the port's
// src/error-report.ts): logged as "client error" lines. The original game makes some
// script errors as part of play (Director's alertHook swallowed them, and the port keeps
// them), so each distinct error is logged the first time it's reported and again at its
// 10th, 100th, 1000th... report, with the count: new errors stand out and the log stays
// quiet. Reports per address are limited (CLIENT_ERRORS_PER_MIN); over it they're dropped.
// Session ids, passwords and email addresses are taken out of the text before it's logged.

import { Window } from "./limits.mjs";

const MAX_KEYS = 1000;

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/\b(sessionid|sid|password|pass|token)=[^&\s"']*/gi, "$1=<redacted>")
    .replace(/[^\s"'<>@]+@[^\s"'<>@]+\.[a-z]{2,}/gi, "<email>")
    .slice(0, max);

const isPowerOf10 = (n) => n >= 10 && /^10*$/.test(String(n));

export function createClientErrors(log, { perMinute = 30 } = {}) {
  const limit = new Window(perMinute, 60_000);
  const counts = new Map(); // error -> reports since the server started

  /** Takes a report's body (JSON); returns the HTTP status for the reply. */
  return function clientErrors(body, address) {
    let report;
    try {
      report = JSON.parse(body);
    } catch {
      return 400;
    }
    const errors = Array.isArray(report?.errors) ? report.errors : [];
    for (const e of errors.slice(0, 20)) {
      if (!e || typeof e !== "object" || !limit.hit(address)) break;
      const movie = clean(e.movie, 40);
      const frame = Number.isInteger(e.frame) ? e.frame : "?";
      const label = clean(e.label, 40);
      const where = clean(e.where, 60);
      const message = clean(e.message, 300);
      const key = `${movie}|${where}|${message}`;
      if (!counts.has(key) && counts.size >= MAX_KEYS) counts.clear();
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (n !== 1 && !isPowerOf10(n)) continue;
      const at = `${movie || "?"} frame ${frame}${label ? ` "${label}"` : ""}, ${where || "?"}`;
      const stack = n === 1 && e.stack ? `; stack: ${clean(e.stack, 600)}` : "";
      log(`client error (${address}) ${at}: ${message}${n > 1 ? ` (${n} reports)` : stack}`);
    }
    return 204;
  };
}
