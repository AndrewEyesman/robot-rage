// Replacement for the game's Shockplay backend (`main.asp`). Every request
// is a form POST with an `action` field; every reply is a Lingo property
// list such as `[#err: 0, #sid: "..."]`.
//
// Error codes the client understands (from its login/garage screens):
//   0 ok, -1 bad login, -103 name taken, -104 robot name taken,
//   -105 robot limit reached, 18 logged out.
// The garage (robotwars RobotWarsReceive) shows any other code as a message and
// stops; the login screen shows "Unable proceed <code>". -2 makes the login screen
// wait forever, so it's never sent.
//
// The server doesn't trust the client with results or money: ranked results
// count only when both players report the same (results.mjs), and saves are
// checked against the robot's ledger (economy.mjs) after their shape
// (robotdata.mjs).
//
// Limits (limits.mjs), per client address: main.asp requests per minute, new
// accounts per day, and failed logins per address and per account name (a growing
// lockout). Over a limit the reply is HTTP 429, which the game's clients take as a
// failed connection (net error 4156: the login screen says "Unable proceed 4156",
// the garage "Kunde inte ansluta till servern"), never a code it can't handle.
//
// Moderation: a banned account can't log in (-1) and its sessions end (18, which logs
// the client out); a banned address can't log in, create accounts or use a session.
// The admin actions (adminkick, adminban, adminunban, adminbans; scripts/moderate.mjs)
// answer only with ADMIN_TOKEN, from this machine.

import { createHash } from "node:crypto";
import { toLingo, raw, parseLingo, LingoPropList } from "./lingo.mjs";
import { checkSave, ledgerOf, payCredits, queueCredit } from "./economy.mjs";
import { createResults } from "./results.mjs";
import { LIMITS, Lockout, Window } from "./limits.mjs";
import { mapProblem, memberProblem, robotDataProblem, robotNameProblem } from "./robotdata.mjs";
import { redact, redactReply } from "./logs.mjs";

const MAX_ROBOTS = 5;
const MAP_SAVE_WINDOW_MS = 30 * 60_000; // a session-less paint map save must follow its owner's own request this closely
const PRUNE_EVERY_MS = 60 * 60_000;
const KNOWN_ADDRESS_MS = 30 * 24 * 60 * 60_000; // how long a login's address stays known to its account
const DEFAULT_SCORE = 0;
const SCORE_STEP = 10;

// Mirrors the client's check in its "load robot" behavior:
// md5(StringToCapital(cleanSpace(props & friends & stats) & salt)).
const CHECKSUM_SALT = "md5istheshitlkasdfkhj";

export function robotChecksum(propertyList, friendslist, gameStats) {
  const text = (propertyList + friendslist + gameStats).replaceAll(" ", "") + CHECKSUM_SALT;
  const capital = text.replace(/[a-z]/g, (c) => c.toUpperCase());
  return createHash("md5").update(Buffer.from(capital, "latin1")).digest("hex");
}

/**
 * `adminToken`: enables the admin actions for requests carrying it, and only from
 * this machine (handleMainAsp's `trusted`); unset (the default), there are none.
 * `kick({ names, address })`: closes the lobby and relay sockets of these robots
 * (lowercased names) or from this address (index.mjs); returns how many.
 */
export function createApi(store, log, { adminToken = "", limits = LIMITS, kick = () => 0 } = {}) {
  const apiPerMinute = new Window(limits.apiPerMinute, 60_000);
  const accountsPerDay = new Window(limits.accountsPerDay, 24 * 60 * 60_000);
  const lockout = (fails) => new Lockout({ fails, lockMs: limits.loginLockMs, maxMs: limits.loginLockMaxMs, forgetMs: limits.loginForgetMs });
  const loginByAccount = lockout(limits.loginFailsPerAccount);
  const loginByAddress = lockout(limits.loginFailsPerAddress);
  // Each member's last request with a session: its address and time (memory only).
  const lastSeen = new Map();
  // The addresses each account name logged in from: login name -> address -> time (memory only).
  const loggedInFrom = new Map();

  const results = createResults(store, log, {
    onRound(winner, own, opponent) {
      if (winner === own.robotid) recordWin(own, opponent);
      else if (winner === opponent.robotid) recordWin(opponent, own);
      else {
        statsOf(own).draw++;
        statsOf(opponent).draw++;
      }
    },
  });

  // Robots saved before the ledger existed: their saved state is where they start.
  let migrated = 0;
  for (const robot of store.allRobots()) {
    if (!robot.ledger) {
      ledgerOf(robot);
      migrated++;
    }
  }
  if (migrated) {
    log(`economy: ledger made for ${migrated} robot(s) from their saved data`);
    store.save();
  }

  // Expired sessions and bans, long-finished matches, and the limits' old counters.
  function prune() {
    const { sessions, bans } = store.prune();
    const matches = results.prune();
    if (sessions || bans || matches) log(`store: pruned ${sessions} expired session(s), ${bans} expired ban(s), ${matches} old match(es)`);
    for (const l of [apiPerMinute, accountsPerDay, loginByAccount, loginByAddress]) l.sweep();
    const now = Date.now();
    for (const [id, seen] of lastSeen) if (now - seen.at > MAP_SAVE_WINDOW_MS) lastSeen.delete(id);
    for (const [name, from] of loggedInFrom) {
      for (const [address, at] of from) if (now - at > KNOWN_ADDRESS_MS) from.delete(address);
      if (!from.size) loggedInFrom.delete(name);
    }
  }
  prune();
  setInterval(prune, PRUNE_EVERY_MS).unref();

  /** Pay a robot's prizes for settled matches and its queued credits into its saved data. */
  function settleAndPay(robot) {
    for (const prize of results.settle(robot.robotid)) queueCredit(robot, prize.amount, prize.reason);
    const paid = payCredits(robot);
    if (paid) log(`economy: ${robot.robotname} credited ${paid}`);
    return paid;
  }

  const actions = {
    createmember(p, member, { address }) {
      const name = (p.membername || "").trim();
      const password = p.password || "";
      if (memberProblem(name, password)) return { err: -1 };
      if (store.findMember(name)) return { err: -103 };
      if (!accountsPerDay.allows(address)) {
        log(`limit: account creation from ${address}`);
        return TOO_MANY;
      }
      accountsPerDay.hit(address);
      const created = store.createMember(name, password);
      log(`account created: ${created.id} from ${address}`);
      return { err: 0, id: created.id, sid: store.createSession(created) };
    },

    loginmember(p, member, { address }) {
      const name = (p.membername || "").trim().toLowerCase();
      const accountLocked = loginByAccount.locked(name) && !loggedInFrom.get(name)?.has(address);
      if (accountLocked || loginByAddress.locked(address)) {
        log(`limit: login locked for ${accountLocked ? "that account" : address}`);
        return TOO_MANY;
      }
      const found = name && store.findMember(name);
      if (!found || !store.checkPassword(found, p.password || "")) {
        if (name) loginByAccount.fail(name);
        loginByAddress.fail(address);
        return { err: -1 };
      }
      loginByAccount.succeed(name);
      if (!loggedInFrom.has(name)) loggedInFrom.set(name, new Map());
      loggedInFrom.get(name).set(address, Date.now());
      const ban = store.banFor({ account: found.name });
      if (ban) {
        log(`login refused: ${found.id} is banned (${ban.reason || "no reason given"})`);
        return { err: -1 };
      }
      return { err: 0, id: found.id, sid: store.createSession(found) };
    },

    logoutmember(p) {
      store.endSession(p.sessionid);
      return { err: 0 };
    },

    getmyrobots(p, member) {
      // The garage screen places each robot in row `entry.count`, which an
      // explicit #count property answers before the built-in list length.
      const robotlist = store.robotsOf(member.id).map((r, i) => ({
        count: i + 1,
        robotid: r.robotid,
        robotname: r.robotname,
      }));
      return { err: 0, robotlist };
    },

    createrobot(p, member) {
      const robotname = (p.robotname || "").trim();
      if (robotNameProblem(robotname)) return { err: -1 };
      if (store.robotByName(robotname)) return { err: -104 };
      if (store.robotsOf(member.id).length >= MAX_ROBOTS) return { err: -105 };
      const robot = store.createRobot(member.id, robotname);
      ledgerOf(robot);
      return { err: 0, robotid: robot.robotid };
    },

    deleterobot(p, member) {
      const robot = store.robot(p.robotid);
      if (robot && robot.memberId === member.id) store.deleteRobot(robot.robotid);
      return { err: 0 };
    },

    PingPayMember() {
      return { err: 0 };
    },

    PING() {
      return { err: 0 };
    },

    // The garage verifies this reply with a checksum over the robot data, so
    // the data goes back exactly as the client last saved it (but for the money
    // of prizes and grants paid since, which the client takes as it loads).
    getrobot(p, member) {
      const robot = ownRobot(p, member);
      if (!robot) return { err: -1 };
      if (settleAndPay(robot)) store.save();
      const propertyList = robot.propertyList || "[]";
      const friendslist = robot.friendslist || "[]";
      const gameStats = gameStatsOf(robot);
      return {
        err: 0,
        ...robotCard(robot),
        propertyList: raw(propertyList),
        friendslist: raw(friendslist),
        GameStats: raw(gameStats),
        checksum: robotChecksum(propertyList, friendslist, gameStats),
      };
    },

    // Any robot by id, without a session: the lobby shows the opponent's robot
    // (stats, 3D model and paint map) before a challenge.
    getrobotall(p) {
      const robot = store.robot(p.robotid);
      if (!robot) return { err: -1 };
      return {
        err: 0,
        ...robotCard(robot),
        propertyList: raw(robot.propertyList || "[]"),
        GameStats: raw(gameStatsOf(robot)),
        map: robot.map ?? "",
      };
    },

    // Plain text, not a property list: the client splits it on TAB.
    getrobotmap(p, member) {
      return ownRobot(p, member)?.map ?? "";
    },

    // Checked against the ledger (economy.mjs): parts that can't be paid for, or
    // installed against the workshop's rules, refuse the save; money beyond what
    // legal buying and selling allow is cut to that. A client sending economy=1
    // (the port's, gameFixes.economy) takes the reply's #money back, so prizes
    // and grants are paid in then too.
    setrobot(p, member) {
      const robot = ownRobot(p, member);
      if (!robot || !p.proplist) return { err: -1 };
      if (p.proplist.length > 64 * 1024) return { err: -1 };
      if (isEmptyList(p.proplist)) {
        // A never-saved robot ([], the regression fixture resets one): the client
        // fills in the empty robot, checked against the same ledger on its next save.
        robot.propertyList = "[]";
        store.save();
        return { err: 0 };
      }
      const shape = robotDataProblem(p.proplist);
      if (shape) {
        log(`save of ${robot.robotname} refused: ${shape}`);
        return { err: -1 };
      }
      const check = checkSave(ledgerOf(robot), p.proplist, robot.propertyList);
      if (!check.ok) {
        log(`economy: save of ${robot.robotname} refused: ${check.reason}`);
        return { err: -1 };
      }
      if (check.notes.length) log(`economy: save of ${robot.robotname} corrected: ${check.notes.join(", ")}`);
      robot.propertyList = check.text;
      robot.ledger = check.ledger;
      if (p.economy === "1") settleAndPay(robot);
      store.save();
      return { err: 0, money: robot.ledger.money };
    },

    // The garage sends the paint map without a session, only the robot's id and name
    // (robotwars "save robot" and "Spara"), so the original server must have keyed it on
    // those; a session, when given, must own the robot (the port's client sends it,
    // gameFixes.mapSession). Without one, the save must come from the address the robot's
    // owner last used a session from, within MAP_SAVE_WINDOW_MS (the garage saves the
    // robot, with its session, just before), and MAP_REQUIRE_SESSION refuses it.
    setrobotmap(p, member, { address }) {
      const robot = member ? ownRobot(p, member) : store.robot(p.robotid);
      if (!robot || (!member && String(p.robotname ?? "").toLowerCase() !== robot.robotname.toLowerCase())) return { err: -1 };
      if (!member && limits.mapRequireSession) {
        log(`paint map of ${robot.robotname} refused: no session`);
        return { err: -1 };
      }
      if (!member) {
        const seen = lastSeen.get(robot.memberId);
        if (!seen || seen.address !== address || Date.now() - seen.at > MAP_SAVE_WINDOW_MS) {
          log(`paint map of ${robot.robotname} refused: not from its owner's address`);
          return { err: -1 };
        }
      }
      const problem = mapProblem(p.map);
      if (problem) {
        log(`paint map of ${robot.robotname} refused: ${problem}`);
        return { err: -1 };
      }
      robot.map = p.map || "";
      store.save();
      return { err: 0 };
    },

    // The garage's save button uses this name; same payload.
    setrobotmapNew(p, member, context) {
      return actions.setrobotmap(p, member, context);
    },

    // The challenge host reports each match it starts, naming both robots
    // (#server, #client). The original sends no session; the port's lobby adds
    // it (gameFixes.matchSession), which lets a start replace a match in progress.
    setrwgames(p, member) {
      let description;
      try {
        description = parseLingo(String(p.gamegescription ?? ""));
      } catch {
        description = undefined;
      }
      if (!(description instanceof LingoPropList)) return { err: 0 };
      const host = store.robot(description.get("server"));
      const guest = store.robot(description.get("client"));
      results.start(host, guest, !!member && host?.memberId === member.id);
      return { err: 0 };
    },

    // After each ranked round: user1id is the sender's robot, user2id its
    // opponent, winner a robot id or 0 for a tie. The original sends only the
    // winner's report (the host's for a tie); the port's arena has both players
    // report (arenaFixes.bothReport). A round counts once both agree (results.mjs).
    setrobotscore(p, member) {
      const own = ownRobot(p, member);
      const opponent = store.robot(p.user2id);
      if (!own || Number(p.user1id) !== own.robotid || !opponent || opponent === own) return { err: -1 };
      const winner = Number(p.winner) || 0;
      if (winner && winner !== own.robotid && winner !== opponent.robotid) return { err: -1 };
      results.report(own, opponent, winner);
      return { err: 0, score: own.score ?? DEFAULT_SCORE };
    },

    // Testing only, off unless ADMIN_TOKEN is set (see handleMainAsp): queue
    // credits for a robot (by id or name), paid when it's next loaded or saved.
    admingrant(p) {
      const robot = store.robot(p.robot) ?? store.robotByName(String(p.robot ?? ""));
      const amount = Number(p.amount);
      if (!robot || !Number.isInteger(amount)) return { err: -1 };
      const value = queueCredit(robot, amount, "admin grant", { set: p.set === "1" });
      store.save();
      log(`economy: admin grant of ${value} to ${robot.robotname}`);
      return { err: 0, robotid: robot.robotid, amount: value };
    },

    // Moderation (scripts/moderate.mjs), only with ADMIN_TOKEN from this machine.
    // `who`: a login, a robot's name or id, or "ip:<address>".
    adminkick(p) {
      const target = targetOf(p.who);
      if (!target) return { err: -1 };
      return { err: 0, ...kickTarget(target, p.withip === "1"), ...describe(target) };
    },

    // `days`: how long (none: for good); `withip`: also ban the address the account
    // last used (known only while the server runs).
    adminban(p) {
      const target = targetOf(p.who);
      const days = Number(p.days || 0);
      if (!target || !Number.isFinite(days) || days < 0) return { err: -1 };
      const expires = days ? Date.now() + days * 24 * 60 * 60_000 : undefined;
      const reason = String(p.reason ?? "").slice(0, 200);
      const address = target.address ?? (p.withip === "1" && target.member ? lastSeen.get(target.member.id)?.address : undefined);
      const bans = [];
      if (target.member) bans.push(store.addBan({ account: target.member.name, reason, expires }));
      if (address) bans.push(store.addBan({ address, reason, expires }));
      const kicked = kickTarget({ ...target, address });
      log(`moderation: banned ${bans.map((b) => b.account ?? b.address).join(" and ")}${days ? ` for ${days} day(s)` : ""} (${reason || "no reason given"})`);
      return { err: 0, bans: bans.map((b) => b.id), ...kicked, ...describe(target) };
    },

    // `who` as above, or `id`: a ban's id.
    adminunban(p) {
      const who = String(p.who ?? "").trim();
      if (!p.id && !who) return { err: -1 };
      // An account's ban outlives the account, so a login that's no member any more still matches.
      const target = p.id ? {} : (targetOf(who) ?? { account: who });
      const lifted = store.removeBans({ id: p.id || undefined, account: target.member?.name ?? target.account, address: target.address });
      log(`moderation: lifted ${lifted.length} ban(s)`);
      return { err: 0, lifted: lifted.length };
    },

    adminbans() {
      const bans = store.activeBans().map((b) => ({
        id: b.id,
        account: b.account ?? "",
        address: b.address ?? "",
        reason: b.reason ?? "",
        created: new Date(b.created).toISOString(),
        expires: b.expires ? new Date(b.expires).toISOString() : "",
      }));
      return { err: 0, bans };
    },

    gethiscore() {
      const hiscore = store
        .allRobots()
        .sort((a, b) => (b.score ?? DEFAULT_SCORE) - (a.score ?? DEFAULT_SCORE))
        .slice(0, 20)
        .map((r) => ({ robotname: r.robotname, score: r.score ?? DEFAULT_SCORE }));
      return { err: 0, hiscore };
    },

    reportabuse(p, member, { address }) {
      log("abuse report", address, redact(p));
      return { err: 0 };
    },
  };

  /** A moderation target: a member (by login, robot name or robot id) or an address ("ip:..."). */
  function targetOf(who) {
    who = String(who ?? "").trim();
    if (!who) return undefined;
    if (who.toLowerCase().startsWith("ip:")) return { address: who.slice(3).trim() };
    const robot = store.robot(who) ?? store.robotByName(who);
    const member = store.findMember(who) ?? (robot && store.memberById(robot.memberId));
    return member ? { member } : undefined;
  }

  function describe({ member, address }) {
    return member ? { account: member.name, robots: store.robotsOf(member.id).map((r) => r.robotname) } : { address };
  }

  /** Ends a member's sessions and closes its (or an address's) lobby and relay sockets. */
  function kickTarget({ member, address }, withip = false) {
    const names = new Set(member ? store.robotsOf(member.id).map((r) => r.robotname.toLowerCase()) : []);
    const seen = member && lastSeen.get(member.id)?.address;
    const sessions = member ? store.endSessionsOf(member.name) : 0;
    const sockets = kick({ names, address: address ?? (withip ? seen : undefined) });
    if (member) lastSeen.delete(member.id);
    log(`moderation: kicked ${member ? member.id : address}: ${sessions} session(s), ${sockets} socket(s)`);
    return { sessions, sockets, lastaddress: seen || "" };
  }

  /** Whether a robot (by name, as the lobby and the relay know it) belongs to a banned account. */
  function robotBan(name) {
    const robot = store.robotByName(String(name ?? "").trim());
    const member = robot && store.memberById(robot.memberId);
    return member ? store.banFor({ account: member.name }) : undefined;
  }

  function robotCard(robot) {
    return {
      robotid: robot.robotid,
      robotname: robot.robotname,
      // Logins are email addresses; other players only see the local part.
      UserLibName: (store.memberById(robot.memberId)?.name ?? "").split("@")[0],
      score: robot.score ?? DEFAULT_SCORE,
    };
  }

  function statsOf(robot) {
    return (robot.stats ||= { Win: 0, lose: 0, draw: 0 });
  }

  // Beating a stronger robot, or losing to a weaker one, moves the score by a
  // quarter of the gap on top of the base step.
  function recordWin(winner, loser) {
    const winnerScore = winner.score ?? DEFAULT_SCORE;
    const loserScore = loser.score ?? DEFAULT_SCORE;
    const upset = loserScore > winnerScore ? Math.round(0.25 * (loserScore - winnerScore)) : 0;
    statsOf(winner).Win++;
    statsOf(loser).lose++;
    winner.score = winnerScore + SCORE_STEP + upset;
    loser.score = Math.max(0, loserScore - SCORE_STEP - upset);
  }

  function gameStatsOf(robot) {
    const stats = robot.stats || { Win: 0, lose: 0, draw: 0 };
    return `[#Win: ${stats.Win}, #lose: ${stats.lose}, #draw: ${stats.draw}]`;
  }

  function isEmptyList(text) {
    try {
      const v = parseLingo(String(text));
      return (Array.isArray(v) && !v.length) || (v instanceof LingoPropList && !v.entries.length);
    } catch {
      return false;
    }
  }

  function ownRobot(p, member) {
    const robot = store.robot(p.robotid);
    return robot && robot.memberId === member.id ? robot : undefined;
  }

  // Actions that can be called without a session.
  const PUBLIC = new Set(["createmember", "loginmember", "PingPayMember", "getrobotall", "setrwgames", "setrobotmap", "setrobotmapNew", ...ADMIN]);

  /** A session's member, unless the session has expired or its account is banned (then it ends). */
  function sessionMember(sid) {
    const member = store.memberForSession(sid);
    if (member && store.banFor({ account: member.name })) {
      store.endSessionsOf(member.name);
      return undefined;
    }
    return member;
  }

  /**
   * `trusted`: the request came from this machine, not through a proxy; `address`:
   * the client's address (index.mjs). Returns the reply's text, or { status, body }
   * for one that isn't a 200.
   */
  function handleMainAsp(rawParams, { trusted = false, address = "" } = {}) {
    // Field names vary in case between screens ("sessionid" / "sessionID").
    const params = {};
    for (const [key, value] of Object.entries(rawParams)) params[key.toLowerCase()] = String(value);
    const action = params.action || "";
    const adminOk = adminToken && trusted && params.token === adminToken;
    if (ADMIN.has(action) && !adminOk) {
      log(`main.asp: ${action} refused (${address})`);
      return toLingo({ err: -1 });
    }
    if (!adminOk && !apiPerMinute.hit(address)) {
      log(`limit: main.asp requests from ${address}`);
      return TOO_MANY;
    }
    const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;
    if (!handler) {
      log(`main.asp: unhandled action ${JSON.stringify(action)} (${address})`, redact(params));
      return toLingo({ err: 0 });
    }
    if (!adminOk && store.banFor({ address })) {
      log(`main.asp ${action} refused: ${address} is banned`);
      return toLingo({ err: PUBLIC.has(action) ? -1 : 18 });
    }
    let member;
    if (!PUBLIC.has(action)) {
      member = sessionMember(params.sessionid);
      if (!member) return toLingo({ err: 18 });
    } else if (params.sessionid) {
      member = sessionMember(params.sessionid);
    }
    if (member) lastSeen.set(member.id, { address, at: Date.now() });
    const reply = handler(params, member, { address });
    if (reply === TOO_MANY) return reply;
    const text = typeof reply === "string" ? reply : toLingo(reply);
    log(`main.asp ${action} (${address}) -> ${redactReply(text)}`);
    return text;
  }

  /**
   * For the lobby: a reason to refuse a nick (by its robot's name) with this PASS, or
   * undefined. A PASS that is a live session (the port's lobby, gameFixes.ircAuth) must
   * be the robot's owner's; any other (the original sends an empty PASS, so do old clients
   * and tools) passes unless IRC_REQUIRE_SESSION.
   */
  function ircRefused(name, pass) {
    if (robotBan(name)) return "banned";
    const member = pass ? sessionMember(String(pass)) : undefined;
    if (!member) return limits.ircRequireSession ? "Session required" : undefined;
    const robot = store.robotByName(String(name ?? "").trim());
    return robot && robot.memberId === member.id ? undefined : "Not your robot";
  }

  return Object.assign(handleMainAsp, {
    /** For the relay: a reason to refuse this robot (a banned account's), or undefined. */
    robotRefused: (name) => (robotBan(name) ? "banned" : undefined),
    ircRefused,
  });
}

const ADMIN = new Set(["admingrant", "adminkick", "adminban", "adminunban", "adminbans"]);
const TOO_MANY = Object.freeze({ status: 429, body: "Too many requests; try again later.\n" });
