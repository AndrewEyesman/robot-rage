// Replacement for the game's Shockplay backend (`main.asp`). Every request
// is a form POST with an `action` field; every reply is a Lingo property
// list such as `[#err: 0, #sid: "..."]`.
//
// Error codes the client understands (from its login/garage screens):
//   0 ok, -1 bad login, -103 name taken, -104 robot name taken,
//   -105 robot limit reached, 18 logged out.
//
// The server doesn't trust the client with results or money: ranked results
// count only when both players report the same (results.mjs), and saves are
// checked against the robot's ledger (economy.mjs).

import { createHash } from "node:crypto";
import { toLingo, raw, parseLingo, LingoPropList } from "./lingo.mjs";
import { checkSave, ledgerOf, payCredits, queueCredit } from "./economy.mjs";
import { createResults } from "./results.mjs";

const MAX_ROBOTS = 5;
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
 * `adminToken`: enables the admingrant action for requests carrying it, and only
 * from this machine (handleMainAsp's `trusted`); unset (the default), there is none.
 */
export function createApi(store, log, { adminToken = "" } = {}) {
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

  /** Pay a robot's prizes for settled matches and its queued credits into its saved data. */
  function settleAndPay(robot) {
    for (const prize of results.settle(robot.robotid)) queueCredit(robot, prize.amount, prize.reason);
    const paid = payCredits(robot);
    if (paid) log(`economy: ${robot.robotname} credited ${paid}`);
    return paid;
  }

  const actions = {
    createmember(p) {
      const name = (p.membername || "").trim();
      const password = p.password || "";
      if (!name || !password) return { err: -1 };
      if (store.findMember(name)) return { err: -103 };
      const member = store.createMember(name, password);
      return { err: 0, id: member.id, sid: store.createSession(member) };
    },

    loginmember(p) {
      const member = store.findMember((p.membername || "").trim());
      if (!member || !store.checkPassword(member, p.password || "")) return { err: -1 };
      return { err: 0, id: member.id, sid: store.createSession(member) };
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
      if (!robotname) return { err: -1 };
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
      if (isEmptyList(p.proplist)) {
        // A never-saved robot ([], the regression fixture resets one): the client
        // fills in the empty robot, checked against the same ledger on its next save.
        robot.propertyList = "[]";
        store.save();
        return { err: 0 };
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
    // those; a session, when given, must own the robot.
    setrobotmap(p, member) {
      const robot = member ? ownRobot(p, member) : store.robot(p.robotid);
      if (!robot || (!member && String(p.robotname ?? "").toLowerCase() !== robot.robotname.toLowerCase())) return { err: -1 };
      robot.map = p.map || "";
      store.save();
      return { err: 0 };
    },

    // The garage's save button uses this name; same payload.
    setrobotmapNew(p, member) {
      return actions.setrobotmap(p, member);
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

    gethiscore() {
      const hiscore = store
        .allRobots()
        .sort((a, b) => (b.score ?? DEFAULT_SCORE) - (a.score ?? DEFAULT_SCORE))
        .slice(0, 20)
        .map((r) => ({ robotname: r.robotname, score: r.score ?? DEFAULT_SCORE }));
      return { err: 0, hiscore };
    },

    reportabuse(p) {
      log("abuse report", p);
      return { err: 0 };
    },
  };

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
  const PUBLIC = new Set(["createmember", "loginmember", "PingPayMember", "getrobotall", "setrwgames", "setrobotmap", "setrobotmapNew", "admingrant"]);

  /** `trusted`: the request came from this machine, not through a proxy (index.mjs). */
  return function handleMainAsp(rawParams, { trusted = false } = {}) {
    // Field names vary in case between screens ("sessionid" / "sessionID").
    const params = {};
    for (const [key, value] of Object.entries(rawParams)) params[key.toLowerCase()] = value;
    const action = params.action || "";
    const adminOk = adminToken && trusted && params.token === adminToken;
    if (action === "admingrant" && !adminOk) {
      log("main.asp: admingrant refused");
      return toLingo({ err: -1 });
    }
    const handler = actions[action];
    if (!handler) {
      log(`main.asp: unhandled action ${JSON.stringify(action)}`, params);
      return toLingo({ err: 0 });
    }
    let member;
    if (!PUBLIC.has(action)) {
      member = store.memberForSession(params.sessionid);
      if (!member) return toLingo({ err: 18 });
    } else if (params.sessionid) {
      member = store.memberForSession(params.sessionid);
    }
    const reply = handler(params, member);
    const text = typeof reply === "string" ? reply : toLingo(reply);
    log(`main.asp ${action} -> ${text.slice(0, 200)}`);
    return text;
  };
}
