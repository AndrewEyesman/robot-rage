// Ranked results that count only when both players agree.
//
// The challenge host reports each match it starts (setrwgames, naming both
// robots). After each ranked round both players report the round
// (setrobotscore: user1id = the sender's robot, user2id = the opponent, winner =
// a robot id or 0 for a tie). A round counts (stats, scores, prize) only when
// the two reports agree and arrive within REPORT_WINDOW_MS of each other, for a
// match the server saw start. A report that finds no started match, a report the
// other side never confirms, and two reports that disagree record nothing.
//
// Walkovers and disconnects: the side that vanishes sends nothing, and the
// survivor's arena claims the round as a walkover (its connection reports the
// other side gone). That lone claim counts only when the relay saw the other side
// leave (left(): its own, session-checked connection closed on its own, not
// replaced or dropped by the other side) and the other side never reported:
// then the leaver loses the round and the match ends, as in the arena. Otherwise
// an unconfirmed report records nothing, so faking a disconnect (closing your own
// connection, or cutting the other side's) still can't win anything. (A surrender
// counts as before: the surrendering client reports the opponent as the winner.)
// Rounds confirmed before the disconnect keep counting.
//
// Voids, for moderators: a round that didn't count is noted on its match (`voids`) and
// counted on the accounts involved (`store.db.records`, by member id, beside the rounds
// they had confirmed): two reports that disagree count against both accounts
// (`disagreed`); a claim the other side never answered, once it can no longer count as a
// walkover, against the silent one (`unanswered`), unless the claimant had left the match
// first (then against nobody). Nothing is decided from them: a modified client can void a
// round it's losing this way, and so can lag (an arena with a high ping doesn't report),
// so a moderator reads the counts beside the match records (scripts/moderate.mjs).
//
// Win trading (off by default, RANKED_PER_PAIR_PER_DAY): the same two accounts play
// at most rankedPerPairPerDay ranked matches (with a confirmed round) a day; later
// starts play unranked: the rounds are checked as usual but change no stats or
// scores and pay nothing.
//
// Prizes mirror the arena's "update m" (behavior 167): a ranked match the player
// didn't lose (rounds won >= rounds lost) pays 10 credits per round won, here
// counted over confirmed rounds only. A robot's matches are settled when its
// owner next loads or saves the robot (after its last unconfirmed report has had
// time to be confirmed); the prize becomes a pending credit (economy).

export const REPORT_WINDOW_MS = 30_000; // default: a round's two reports must arrive this close together
export const WALKOVER_MS = 60_000; // a walkover claim and the other side's leaving must be this close together
export const MATCH_TTL_MS = 2 * 60 * 60_000; // a match with no activity for this long is over
const MATCH_KEEP_MS = 7 * 24 * 60 * 60_000; // settled or not, a match record is dropped after this
const WINS_TO_END = 3; // first to three rounds (arena main framescript #done)
const MAX_ROUNDS = 15; // ties included; a cap on what one match can record
const DAY_MS = 24 * 60 * 60_000;
const MAX_VOIDS = 30; // the voids a match record keeps
export const PRIZE_PER_ROUND = 10;

/**
 * `onRound(winner, own, opponent)`: a ranked round counted (robots). `robot(id)`: a
 * robot by id. `reportWindowMs`, `walkoverMs`, `rankedPerPairPerDay` (0: no limit): limits.mjs.
 */
export function createResults(store, log, { onRound, robot = (id) => store.robot(id), reportWindowMs = REPORT_WINDOW_MS, walkoverMs = WALKOVER_MS, rankedPerPairPerDay = 0 }) {
  const REPORT_WINDOW_MS = reportWindowMs;
  const WALKOVER_MS = walkoverMs;
  // A lone claim is void once it can be neither confirmed nor a walkover.
  const VOID_AFTER_MS = Math.max(REPORT_WINDOW_MS, WALKOVER_MS);
  const matches = () => (store.db.matches ||= {});
  const records = () => (store.db.records ||= {});

  /**
   * Adds one to a field of the record of the account that owns robot `id`: its
   * confirmed rounds (`rounds`) and the voids counted against it, by member id.
   */
  function bump(id, field) {
    const memberId = robot(id)?.memberId;
    if (memberId === undefined) return;
    const r = (records()[memberId] ||= { rounds: 0, disagreed: 0, unanswered: 0 });
    r[field] = (r[field] ?? 0) + 1;
  }

  /** Drops match records with no activity for MATCH_KEEP_MS. Returns how many. */
  function prune(now = Date.now()) {
    let n = 0;
    for (const [id, m] of Object.entries(matches())) {
      if (now - m.last > MATCH_KEEP_MS) {
        delete matches()[id];
        n++;
      }
    }
    if (n) store.save();
    return n;
  }

  const isOpen = (m, now) => !m.closed && now - m.last <= MATCH_TTL_MS;

  function openMatchOf(a, b, now) {
    return Object.values(matches())
      .filter((m) => isOpen(m, now) && ((m.host === a && m.guest === b) || (m.host === b && m.guest === a)))
      .sort((x, y) => y.started - x.started)[0];
  }

  /** setrwgames: the host starts a match. `authenticated`: the sender's session owns the host robot. */
  function start(host, guest, authenticated, now = Date.now()) {
    prune(now);
    if (!host || !guest || host.robotid === guest.robotid || host.memberId === guest.memberId) return undefined;
    const open = openMatchOf(host.robotid, guest.robotid, now);
    // An unauthenticated start (an old client, or anyone) can't replace a match in progress.
    if (open && !authenticated) return open;
    if (open) open.closed = true;
    const id = String(store.nextId());
    // Ranked matches with a confirmed round between these two accounts in the last day.
    const members = [host.memberId, guest.memberId].sort().join(":");
    const today = Object.values(matches()).filter((x) => x.members === members && x.rounds > 0 && !x.unranked && now - x.started < DAY_MS).length;
    const unranked = rankedPerPairPerDay > 0 && today >= rankedPerPairPerDay;
    const m = {
      id,
      host: host.robotid,
      guest: guest.robotid,
      members,
      started: now,
      last: now,
      authenticated,
      unranked,
      rounds: 0,
      tally: { [host.robotid]: { won: 0, lost: 0, draw: 0 }, [guest.robotid]: { won: 0, lost: 0, draw: 0 } },
      pending: {},
      settled: {},
    };
    matches()[id] = m;
    store.save();
    log("match started", id, host.robotname, "vs", guest.robotname, authenticated ? "" : "(no session)", unranked ? `(unranked: ${today} ranked matches between these accounts today)` : "");
    return m;
  }

  /** A confirmed round: the tally, and (ranked) the robots' stats and scores. */
  function count(m, winner, own, opponent) {
    m.rounds++;
    bump(m.host, "rounds");
    bump(m.guest, "rounds");
    const t = m.tally;
    if (!winner) {
      t[m.host].draw++;
      t[m.guest].draw++;
    } else {
      const loser = winner === m.host ? m.guest : m.host;
      t[winner].won++;
      t[loser].lost++;
    }
    if (!m.unranked) onRound(winner, own, opponent);
    if (t[m.host].won >= WINS_TO_END || t[m.guest].won >= WINS_TO_END || m.rounds >= MAX_ROUNDS) m.closed = true;
  }

  const nameOf = (id) => robot(id)?.robotname ?? id;

  /**
   * A round that didn't count: `reports`, robot id -> the winner it reported; `blamed`,
   * the robot ids whose accounts the void counts against, as `kind`.
   */
  function voidRound(m, kind, reports, blamed, now) {
    (m.voids ||= []).push({ at: now, kind, reports, blamed });
    if (m.voids.length > MAX_VOIDS) m.voids.splice(0, m.voids.length - MAX_VOIDS);
    for (const id of blamed) bump(id, kind);
    log("result void", m.id, kind, blamed.length ? `(${blamed.map(nameOf).join(", ")})` : "(nobody's: the claimant left first)");
  }

  /**
   * `id`'s unconfirmed claim, past its window: void, against the other side for not
   * answering, unless the claimant left first.
   */
  function expire(m, id, now) {
    const claim = m.pending[id];
    delete m.pending[id];
    const otherId = id === m.host ? m.guest : m.host;
    const myLeave = m.left?.[id];
    const theirLeave = m.left?.[otherId];
    const leftFirst = myLeave !== undefined && !(theirLeave < myLeave);
    voidRound(m, "unanswered", { [id]: claim.winner }, leftFirst ? [] : [otherId], now);
    store.save();
  }

  /**
   * The relay saw `leaver`'s connection to `other` close on its own (a session-checked
   * connection, not replaced or dropped): noted on their open match, for resolve().
   */
  function left(leaver, other, now = Date.now()) {
    const m = openMatchOf(leaver.robotid, other.robotid, now);
    if (!m) return;
    (m.left ||= {})[leaver.robotid] = now;
    store.save();
    log("match", m.id, leaver.robotname, "left");
  }

  /**
   * Walkovers: a side's unconfirmed claim of a round for itself counts once the report
   * window has passed, when the other side left within WALKOVER_MS of the claim (and
   * not after this side left) and sent no report of its own. The match ends there.
   */
  function resolve(m, now) {
    if (m.closed || !m.left) return;
    for (const id of [m.host, m.guest]) {
      const claim = m.pending[id];
      if (!claim || claim.winner !== id || now - claim.at <= REPORT_WINDOW_MS) continue;
      const otherId = id === m.host ? m.guest : m.host;
      const theirLeave = m.left[otherId];
      const myLeave = m.left[id];
      if (theirLeave === undefined || Math.abs(claim.at - theirLeave) > WALKOVER_MS) continue;
      if (myLeave !== undefined && myLeave < theirLeave) continue;
      if (m.pending[otherId]) continue;
      const own = robot(id);
      const opponent = robot(otherId);
      if (!own || !opponent) continue;
      delete m.pending[id];
      count(m, id, own, opponent);
      m.closed = true;
      log("result confirmed", m.id, "round", m.rounds, "winner", id, "(walkover: the other side left)");
      store.save();
      return;
    }
  }

  /**
   * resolve() for every open match, then the voids of claims nobody answered (the server
   * calls it every few seconds).
   */
  function resolveAll(now = Date.now()) {
    for (const m of Object.values(matches())) {
      if (isOpen(m, now)) resolve(m, now);
      for (const id of Object.keys(m.pending ?? {}).map(Number)) if (now - m.pending[id].at > VOID_AFTER_MS) expire(m, id, now);
    }
  }

  /**
   * setrobotscore from `own` about `opponent`. Returns what happened:
   * "nomatch", "pending", "confirmed", "mismatch" or "over".
   */
  function report(own, opponent, winner, now = Date.now()) {
    const m = openMatchOf(own.robotid, opponent.robotid, now);
    if (!m) {
      log("result ignored: no started match", own.robotname, "vs", opponent.robotname);
      return "nomatch";
    }
    resolve(m, now);
    if (m.closed) return "over";
    m.last = now;
    // This side's last claim went unanswered (it has moved on to another round).
    const mine = m.pending[own.robotid];
    if (mine && now - mine.at > REPORT_WINDOW_MS) expire(m, own.robotid, now);
    const other = m.pending[opponent.robotid];
    if (other && now - other.at <= REPORT_WINDOW_MS) {
      delete m.pending[opponent.robotid];
      delete m.pending[own.robotid];
      if (other.winner !== winner) {
        voidRound(m, "disagreed", { [own.robotid]: winner, [opponent.robotid]: other.winner }, [own.robotid, opponent.robotid], now);
        store.save();
        return "mismatch";
      }
      if (m.closed) return "over";
      count(m, winner, own, opponent);
      log("result confirmed", m.id, "round", m.rounds, "winner", winner || "tie");
      store.save();
      return "confirmed";
    }
    // A newer report from the same side replaces its unconfirmed one.
    m.pending[own.robotid] = { winner, at: now };
    store.save();
    return "pending";
  }

  /**
   * Settle a robot's finished matches: the prize for each (10 per confirmed round
   * won, if it won at least as many as it lost), once. A match is left for later
   * while the robot's own last report still waits for the opponent's.
   */
  function settle(robotid, now = Date.now()) {
    const prizes = [];
    for (const m of Object.values(matches())) {
      if ((m.host !== robotid && m.guest !== robotid) || m.settled[robotid]) continue;
      if (isOpen(m, now)) resolve(m, now);
      // Nothing confirmed yet in a match still open: it may only just have started.
      if (!m.rounds && isOpen(m, now)) continue;
      const mine = m.pending[robotid];
      if (mine && now - mine.at <= REPORT_WINDOW_MS) continue;
      const opponentId = m.host === robotid ? m.guest : m.host;
      const theirs = m.pending[opponentId];
      if (theirs && now - theirs.at <= REPORT_WINDOW_MS) continue;
      m.settled[robotid] = true;
      const { won, lost } = m.tally[robotid];
      if (!m.unranked && won > 0 && won >= lost) prizes.push({ amount: PRIZE_PER_ROUND * won, reason: `match ${m.id}: ${won}-${lost}` });
    }
    if (prizes.length) store.save();
    return prizes;
  }

  /** The latest match between two robots, open or not (an abuse report's match). */
  function lastMatchOf(a, b) {
    return Object.values(matches())
      .filter((m) => (m.host === a && m.guest === b) || (m.host === b && m.guest === a))
      .sort((x, y) => y.started - x.started)[0];
  }

  return { start, report, left, resolveAll, settle, openMatchOf, lastMatchOf, prune };
}
