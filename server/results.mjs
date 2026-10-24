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
// Walkovers and disconnects: the side that vanishes sends nothing, so the
// survivor's report is never confirmed and the round doesn't count, either way.
// Faking a disconnect therefore can't win anything; it only voids the round in
// progress. (A surrender still counts: the surrendering client reports the
// opponent as the winner, as the original already did.) Rounds confirmed before
// the disconnect keep counting.
//
// Prizes mirror the arena's "update m" (behavior 167): a ranked match the player
// didn't lose (rounds won >= rounds lost) pays 10 credits per round won, here
// counted over confirmed rounds only. A robot's matches are settled when its
// owner next loads or saves the robot (after its last unconfirmed report has had
// time to be confirmed); the prize becomes a pending credit (economy).

export const REPORT_WINDOW_MS = 30_000; // a round's two reports must arrive this close together
export const MATCH_TTL_MS = 2 * 60 * 60_000; // a match with no activity for this long is over
const MATCH_KEEP_MS = 7 * 24 * 60 * 60_000; // settled or not, a match record is dropped after this
const WINS_TO_END = 3; // first to three rounds (arena main framescript #done)
const MAX_ROUNDS = 15; // ties included; a cap on what one match can record
export const PRIZE_PER_ROUND = 10;

export function createResults(store, log, { onRound }) {
  const matches = () => (store.db.matches ||= {});

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
    const m = {
      id,
      host: host.robotid,
      guest: guest.robotid,
      started: now,
      last: now,
      authenticated,
      rounds: 0,
      tally: { [host.robotid]: { won: 0, lost: 0, draw: 0 }, [guest.robotid]: { won: 0, lost: 0, draw: 0 } },
      pending: {},
      settled: {},
    };
    matches()[id] = m;
    store.save();
    log("match started", id, host.robotname, "vs", guest.robotname, authenticated ? "" : "(no session)");
    return m;
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
    m.last = now;
    const other = m.pending[opponent.robotid];
    if (other && now - other.at <= REPORT_WINDOW_MS) {
      delete m.pending[opponent.robotid];
      delete m.pending[own.robotid];
      if (other.winner !== winner) {
        log("result ignored: reports disagree", m.id, winner, other.winner);
        store.save();
        return "mismatch";
      }
      if (m.closed) return "over";
      m.rounds++;
      const t = m.tally;
      if (!winner) {
        t[m.host].draw++;
        t[m.guest].draw++;
      } else {
        const loser = winner === m.host ? m.guest : m.host;
        t[winner].won++;
        t[loser].lost++;
      }
      onRound(winner, own, opponent);
      if (t[m.host].won >= WINS_TO_END || t[m.guest].won >= WINS_TO_END || m.rounds >= MAX_ROUNDS) m.closed = true;
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
      // Nothing confirmed yet in a match still open: it may only just have started.
      if (!m.rounds && isOpen(m, now)) continue;
      const mine = m.pending[robotid];
      if (mine && now - mine.at <= REPORT_WINDOW_MS) continue;
      const opponentId = m.host === robotid ? m.guest : m.host;
      const theirs = m.pending[opponentId];
      if (theirs && now - theirs.at <= REPORT_WINDOW_MS) continue;
      m.settled[robotid] = true;
      const { won, lost } = m.tally[robotid];
      if (won > 0 && won >= lost) prizes.push({ amount: PRIZE_PER_ROUND * won, reason: `match ${m.id}: ${won}-${lost}` });
    }
    if (prizes.length) store.save();
    return prizes;
  }

  return { start, report, settle, openMatchOf, prune };
}
