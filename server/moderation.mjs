// What a moderator reads (scripts/moderate.mjs: offline from the data file, online
// through adminrecord and adminreports): an account's ranked record and its recent
// matches, and the arena's abuse reports. Plain objects, from the data results.mjs and
// api.mjs keep in the store. A report keeps a copy of its match, as matches are pruned
// after a week.

const RECENT_MATCHES = 10;
const iso = (t) => (t ? new Date(t).toISOString() : "");

/** An account's record (confirmed rounds, voids against it), its robots and recent matches. */
export function accountRecord(store, member) {
  const robots = store.robotsOf(member.id);
  const ids = new Set(robots.map((r) => r.robotid));
  const matches = Object.values(store.db.matches ?? {})
    .filter((m) => ids.has(m.host) || ids.has(m.guest))
    .sort((a, b) => b.started - a.started)
    .slice(0, RECENT_MATCHES)
    .map((m) => matchView(store, m));
  return {
    account: member.name,
    robots: robots.map((r) => r.robotname),
    record: { rounds: 0, disagreed: 0, unanswered: 0, ...store.db.records?.[member.id] },
    matches,
  };
}

/** A match record (or an abuse report's copy of one), in robot names. */
export function matchView(store, m) {
  const name = (id) => store.robot(id)?.robotname ?? String(id);
  const host = m.tally?.[m.host] ?? {};
  const guest = m.tally?.[m.guest] ?? {};
  const draws = host.draw ? `, ${host.draw} draw(s)` : "";
  return {
    id: m.id,
    started: iso(m.started),
    score: `${name(m.host)} ${host.won ?? 0}-${guest.won ?? 0} ${name(m.guest)}${draws}`,
    state: [m.closed ? "over" : "open", m.unranked ? "unranked" : "ranked"].join(", "),
    left: Object.entries(m.left ?? {}).map(([id, at]) => `${name(id)} at ${iso(at)}`),
    voids: (m.voids ?? []).map((v) => ({
      at: iso(v.at),
      kind: v.kind,
      reports: Object.entries(v.reports).map(([id, winner]) => `${name(id)}: ${winner ? `${name(winner)} won` : "tie"}`),
      against: v.blamed.map(name),
    })),
  };
}

/** The abuse reports, newest first. */
export function abuseReports(store, limit = 20) {
  const name = (id, fallback) => store.robot(id)?.robotname ?? fallback ?? String(id);
  return (store.db.reports ?? [])
    .slice(-limit)
    .reverse()
    .map((r) => {
      // The match as it is now (its voids may come after the report), else the report's copy.
      const m = (r.match && store.db.matches?.[r.match.id]) ?? r.match;
      return {
        id: r.id,
        at: iso(r.at),
        reporter: name(r.reporter, r.reporterName),
        reported: name(r.reported, r.reportedName),
        match: m ? matchView(store, m) : undefined,
        chat: r.chat,
      };
    });
}
