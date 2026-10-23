// Tiny JSON-file store for accounts, sessions and robots. Writes are
// debounced; the whole database fits comfortably in memory.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export class Store {
  constructor(path) {
    this.path = path;
    this.db = { nextId: 1000, members: {}, robots: {}, sessions: {} };
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
    return this.db.members[name.toLowerCase()];
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

  createSession(member) {
    const sid = randomBytes(12).toString("hex");
    this.db.sessions[sid] = { memberId: member.id, name: member.name.toLowerCase(), created: Date.now() };
    this.save();
    return sid;
  }

  memberForSession(sid) {
    const session = sid && this.db.sessions[sid];
    return session ? this.db.members[session.name] : undefined;
  }

  endSession(sid) {
    delete this.db.sessions[sid];
    this.save();
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
    return this.db.robots[String(robotid)];
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
