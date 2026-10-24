// Tiny JSON-file store for accounts, sessions, robots, matches and bans. Writes
// are debounced; the whole database fits comfortably in memory.
//
// Sessions expire after `sessionTtlMs` unused (SESSION_DAYS, limits.mjs); each use
// refreshes one (written at most hourly). A member keeps at most MAX_SESSIONS, the
// oldest dropped. Bans are by account (the login, lowercased) or by address (exact,
// or a prefix ending in "*"), with an optional expiry and a reason.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { LIMITS, normalizeAddress } from "./limits.mjs";

const MAX_SESSIONS = 50;
const TOUCH_MS = 60 * 60_000; // how stale a session's last use may get before it's rewritten

export class Store {
  constructor(path, { sessionTtlMs = LIMITS.sessionTtlMs } = {}) {
    this.path = path;
    this.sessionTtlMs = sessionTtlMs;
    this.db = { nextId: 1000, members: {}, robots: {}, sessions: {}, matches: {}, bans: [] };
    if (existsSync(path)) this.db = { ...this.db, ...JSON.parse(readFileSync(path, "utf8")) };
    this.saveTimer = null;
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.db, null, 1));
      renameSync(`${this.path}.tmp`, this.path);
    }, 250);
  }

  nextId() {
    const id = this.db.nextId++;
    this.save();
    return id;
  }

  findMember(name) {
    const key = name.toLowerCase();
    return Object.hasOwn(this.db.members, key) ? this.db.members[key] : undefined;
  }

  createMember(name, password) {
    const salt = randomBytes(16).toString("hex");
    const member = {
      id: this.nextId(),
      name,
      salt,
      hash: scryptSync(password, salt, 32).toString("hex"),
    };
    this.db.members[name.toLowerCase()] = member;
    this.save();
    return member;
  }

  memberById(id) {
    return Object.values(this.db.members).find((member) => member.id === id);
  }

  checkPassword(member, password) {
    const hash = scryptSync(password, member.salt, 32);
    return timingSafeEqual(hash, Buffer.from(member.hash, "hex"));
  }

  createSession(member, now = Date.now()) {
    const sid = randomBytes(12).toString("hex");
    const name = member.name.toLowerCase();
    const own = Object.entries(this.db.sessions).filter(([, s]) => s.name === name);
    own.sort((a, b) => lastUse(a[1]) - lastUse(b[1]));
    for (const [old] of own.slice(0, Math.max(0, own.length - MAX_SESSIONS + 1))) delete this.db.sessions[old];
    this.db.sessions[sid] = { memberId: member.id, name, created: now, last: now };
    this.save();
    return sid;
  }

  /** The session's member, refreshing the session; undefined for an expired or unknown one. */
  memberForSession(sid, now = Date.now()) {
    const session = typeof sid === "string" && Object.hasOwn(this.db.sessions, sid) ? this.db.sessions[sid] : undefined;
    if (!session) return undefined;
    if (this.sessionTtlMs && now - lastUse(session) > this.sessionTtlMs) {
      delete this.db.sessions[sid];
      this.save();
      return undefined;
    }
    if (now - lastUse(session) > Math.min(TOUCH_MS, this.sessionTtlMs / 10 || TOUCH_MS)) {
      session.last = now;
      this.save();
    }
    return this.db.members[session.name];
  }

  endSession(sid) {
    delete this.db.sessions[sid];
    this.save();
  }

  /** Ends every session of an account (by login). Returns how many. */
  endSessionsOf(name) {
    const lower = name.toLowerCase();
    let n = 0;
    for (const [sid, s] of Object.entries(this.db.sessions)) {
      if (s.name === lower) {
        delete this.db.sessions[sid];
        n++;
      }
    }
    if (n) this.save();
    return n;
  }

  /** Drops expired sessions and bans. Returns how many of each. */
  prune(now = Date.now()) {
    let sessions = 0;
    if (this.sessionTtlMs) {
      for (const [sid, s] of Object.entries(this.db.sessions)) {
        if (now - lastUse(s) > this.sessionTtlMs) {
          delete this.db.sessions[sid];
          sessions++;
        }
      }
    }
    const before = this.db.bans.length;
    this.db.bans = this.db.bans.filter((b) => !b.expires || b.expires > now);
    const bans = before - this.db.bans.length;
    if (sessions || bans) this.save();
    return { sessions, bans };
  }

  // ---------------------------------------------------------------- bans

  /** Bans an account (`account`: its login) or an address; `expires` a time or undefined for good. */
  addBan({ account, address, reason = "", expires }, now = Date.now()) {
    const ban = { id: this.nextId(), created: now, reason };
    if (account) ban.account = account.toLowerCase();
    if (address) ban.address = normalizeAddress(address);
    if (expires) ban.expires = expires;
    this.db.bans.push(ban);
    this.save();
    return ban;
  }

  /** Lifts bans by id, account or address. Returns the bans lifted. */
  removeBans({ id, account, address }) {
    const lifted = this.db.bans.filter(
      (b) => (id !== undefined && b.id === Number(id)) || (account && b.account === account.toLowerCase()) || (address && b.address === normalizeAddress(address)),
    );
    this.db.bans = this.db.bans.filter((b) => !lifted.includes(b));
    if (lifted.length) this.save();
    return lifted;
  }

  activeBans(now = Date.now()) {
    return this.db.bans.filter((b) => !b.expires || b.expires > now);
  }

  /** The ban that applies to an account (login) or an address, if any. */
  banFor({ account, address }, now = Date.now()) {
    const name = account?.toLowerCase();
    const addr = address && normalizeAddress(address);
    return this.activeBans(now).find(
      (b) => (name && b.account === name) || (addr && b.address && (b.address.endsWith("*") ? addr.startsWith(b.address.slice(0, -1)) : b.address === addr)),
    );
  }

  robotsOf(memberId) {
    return Object.values(this.db.robots).filter((r) => r.memberId === memberId);
  }

  robotByName(name) {
    const lower = name.toLowerCase();
    return Object.values(this.db.robots).find((r) => r.robotname.toLowerCase() === lower);
  }

  allRobots() {
    return Object.values(this.db.robots);
  }

  robot(robotid) {
    const key = String(robotid);
    return Object.hasOwn(this.db.robots, key) ? this.db.robots[key] : undefined;
  }

  createRobot(memberId, robotname) {
    const robot = { robotid: this.nextId(), memberId, robotname, data: {}, created: Date.now() };
    this.db.robots[String(robot.robotid)] = robot;
    this.save();
    return robot;
  }

  deleteRobot(robotid) {
    delete this.db.robots[String(robotid)];
    this.save();
  }
}

const lastUse = (session) => session.last ?? session.created ?? 0;
