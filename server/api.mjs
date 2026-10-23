// Replacement for the game's Shockplay backend (`main.asp`). Every request
// is a form POST with an `action` field; every reply is a Lingo property
// list such as `[#err: 0, #sid: "..."]`.
//
// Error codes the client understands (from its login/garage screens):
//   0 ok, -1 bad login, -103 name taken, -104 robot name taken,
//   -105 robot limit reached, 18 logged out.

import { createHash } from "node:crypto";
import { toLingo, raw } from "./lingo.mjs";

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

export function createApi(store, log) {
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
    // the data goes back exactly as the client last saved it.
    getrobot(p, member) {
      const robot = ownRobot(p, member);
      if (!robot) return { err: -1 };
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

    setrobot(p, member) {
      const robot = ownRobot(p, member);
      if (!robot || !p.proplist) return { err: -1 };
      robot.propertyList = p.proplist;
      store.save();
      return { err: 0 };
    },

    setrobotmap(p, member) {
      const robot = ownRobot(p, member);
      if (!robot) return { err: -1 };
      robot.map = p.map || "";
      store.save();
      return { err: 0 };
    },

    // The garage's save button uses this name; same payload.
    setrobotmapNew(p, member) {
      return actions.setrobotmap(p, member);
    },

    // The challenge host reports each match it starts; only logged.
    setrwgames(p) {
      log("match started", p.gamegescription);
      return { err: 0 };
    },

    // Sent by both players after a match; each reports from its own side,
    // so only the sender's robot is updated.
    setrobotscore(p, member) {
      const robot = ownRobot(p, member);
      if (!robot) return { err: -1 };
      const stats = (robot.stats ||= { Win: 0, lose: 0, draw: 0 });
      const winner = Number(p.winner);
      robot.score ??= DEFAULT_SCORE;
      if (winner === robot.robotid) {
        stats.Win++;
        robot.score += SCORE_STEP;
      } else if (winner && winner === Number(p.user2id ?? p.user1id)) {
        stats.lose++;
        robot.score = Math.max(0, robot.score - SCORE_STEP);
      } else {
        stats.draw++;
      }
      store.save();
      return { err: 0, score: robot.score };
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

  function gameStatsOf(robot) {
    const stats = robot.stats || { Win: 0, lose: 0, draw: 0 };
    return `[#Win: ${stats.Win}, #lose: ${stats.lose}, #draw: ${stats.draw}]`;
  }

  function ownRobot(p, member) {
    const robot = store.robot(p.robotid);
    return robot && robot.memberId === member.id ? robot : undefined;
  }

  // Actions that can be called without a session.
  const PUBLIC = new Set(["createmember", "loginmember", "PingPayMember", "getrobotall", "setrwgames"]);

  return function handleMainAsp(rawParams) {
    // Field names vary in case between screens ("sessionid" / "sessionID").
    const params = {};
    for (const [key, value] of Object.entries(rawParams)) params[key.toLowerCase()] = value;
    const action = params.action || "";
    const handler = actions[action];
    if (!handler) {
      log(`main.asp: unhandled action ${JSON.stringify(action)}`, params);
      return toLingo({ err: 0 });
    }
    let member;
    if (!PUBLIC.has(action)) {
      member = store.memberForSession(params.sessionid);
      if (!member) return toLingo({ err: 18 });
    }
    const reply = handler(params, member);
    const text = typeof reply === "string" ? reply : toLingo(reply);
    log(`main.asp ${action} -> ${text.slice(0, 200)}`);
    return text;
  };
}
