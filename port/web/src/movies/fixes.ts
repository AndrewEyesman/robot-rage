// The port's fixes to the original game's bugs outside the arena (the arena's are in
// arena104/enhancements.ts). The maintainer's rule: functionality first, then accuracy, so an
// original bug that hurts play is fixed here without waiting for a decision; the
// translated script keeps the original logic behind the flag, `?quirks=<name>[,...]`
// restores it, and a check in port/tools/regress.mjs guards the fix. Each is logged in
// docs/port-issues.md ("Fixes to the original").
//
// - Never-saved robots (?quirks=emptyrobot, #29): the server holds an empty property
//   list ([]) for a robot that was never saved (its owner's client fills in the empty
//   robot until the first door saves it). Another player clicking it in the lobby got a
//   script error, no 3D robot, no CHALLENGE, and a lobby that ignored every later
//   click; accepting its challenge broke the match. The lobby now shows (and fights)
//   such a robot as the empty robot.
// - Clicking an incoming challenge (?quirks=challengecard, #31): the original sends the
//   challenger's robot id where the robot's data is expected, a script error, so
//   nothing happened. It now opens the challenger's card, as clicking its name does.
// - The paintshop's grid button with no chassis (?quirks=grid, #40): read the chassis
//   before checking there was one, a script error, so the button didn't toggle.
// - The P2P role swap (?quirks=p2pswap, #28): when the challenge's connection fails,
//   both sides swap server and client and try again, but the original leaves
//   gChallengeGo set, so the new server connects again instead of waiting: the swap
//   never worked and both players went back to the lobby. The swap now clears it, and
//   the new server's second ConnectToMe no longer undoes a connection already made.
// - Closing doors (?quirks=doors): the door halves (robotwars 263, on every screen's
//   entry: garage, lobby, the arena's control panel) brake toward x = 0 instead of their
//   closed positions, and the first half to stop advances the playhead, so the slide
//   snapped halfway (the maintainer). Each half now slides to its own closed position; all
//   arrive together.
// - The server owns the economy (?quirks=economy restores the original client): the
//   server checks every save (setrobot) against its own record of the robot's money and
//   parts and keeps no more money than legal buying and selling allow, and pays prizes
//   for confirmed ranked results and admin grants itself (server/economy.mjs). The
//   client sends economy=1 with each save and takes the reply's money back (the
//   difference from what it sent), so it shows what the server kept and its later saves
//   agree with the server.
// - Match starts with a session (?quirks=results, like the arena's fix): the host's
//   setrwgames carries its session, so the server knows the start is the host's own.
// - The lobby's identity (?quirks=ircauth, #57): the lobby logged on to IRC with an
//   empty PASS and a nick made from its robot's name, so anyone could take any robot's
//   nick. It now sends its login session as PASS, which the server checks against the
//   nick's robot (and requires with IRC_REQUIRE_SESSION=1, as hosted).
// - Paint map saves with a session (?quirks=mapsession, #57): the garage's and lobby's
//   setrobotmap carried only the robot's id and name, so the server had to trust the
//   owner's address. It now carries the session too (MAP_REQUIRE_SESSION=1 needs it).
// - Robot data error replies in the lobby (?quirks=robotreply, #57): the lobby read its
//   getrobotall replies without checking #err. For its own robot that was a script error
//   every frame (the reply stays done); an error reply now leaves the score and stats as
//   they were and the lobby waiting, as after a good reply. For a clicked robot it
//   showed a card of nothing; it now says the robot couldn't be loaded, as for a failed
//   request.

import { G, TextualMember, dot, member, netDone, netError, netTextResult } from '../director';
import { LPropList, lingoString, sym, value, type LValue } from '../lingo';
import { rocket_encrypt } from './robotwars/s072-rocket-encrypt';
import { emptyRobotProplist } from './robotwars/s011-purl';

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const quirks = (query.get('quirks') ?? '').split(',');

export const gameFixes = {
  emptyRobot: !quirks.includes('emptyrobot'),
  challengeCard: !quirks.includes('challengecard'),
  gridNoChassis: !quirks.includes('grid'),
  p2pSwap: !quirks.includes('p2pswap'),
  doorClose: !quirks.includes('doors'),
  economy: !quirks.includes('economy'),
  matchSession: !quirks.includes('results'),
  ircAuth: !quirks.includes('ircauth'),
  mapSession: !quirks.includes('mapsession'),
  robotReply: !quirks.includes('robotreply'),
};

/**
 * gameFixes.economy: after a save (setrobot, net operation `id`) the server's reply
 * says how much money it kept (#money): move gUserData's money by the difference from
 * what was sent, so a change made since (a part bought while the reply was on its way)
 * stays. info1 follows, and MrDoktor's copy too if it was in step (so the change isn't
 * taken for a cheat). Polled, as some saves never read their reply.
 */
export function watchSave(id: number, sentMoney: number) {
  const timer = setInterval(() => {
    if (!netDone(id)) return;
    clearInterval(timer);
    if (netError(id) !== 'OK') return;
    let reply: LValue;
    try {
      reply = value(netTextResult(id));
    } catch {
      return;
    }
    if (!(reply instanceof LPropList) || reply.getaProp(sym('err')) !== 0) return;
    const kept = reply.getaProp(sym('money'));
    if (typeof kept !== 'number' || kept === sentMoney) return;
    const pl = dot(G.gUserData, 'propertyList');
    if (!(pl instanceof LPropList)) return;
    const inStep = G.gDoktor !== undefined && G.gDoktor === rocket_encrypt(G.gUserData);
    const money = Number(pl.getaProp(sym('money'))) + kept - sentMoney;
    pl.setaProp(sym('money'), money);
    pl.setaProp(sym('info1'), 1112 - money);
    if (inStep) G.gDoktor = rocket_encrypt(G.gUserData);
    const stats = member('Money Stats');
    if (stats instanceof TextualMember) stats.text = lingoString(money);
  }, 100);
}

/** A robot's property list, or the empty robot's when it has none ([] or no robotDescription). */
export function withRobotDefaults(propertyList: LValue): LValue {
  if (propertyList instanceof LPropList && propertyList.getaProp(sym('robotDescription')) instanceof LPropList) return propertyList;
  return emptyRobotProplist();
}

/**
 * The lobby's opponent data for a challenger, as getOnlineRobotId builds it for a name
 * clicked in the user list (robot id 0 and no address until SMUS_SendIP answers).
 */
export function challengerData(ircrobotname: LValue, robotname: LValue, ipcode: LValue): LPropList {
  return new LPropList([
    [sym('robotname'), robotname],
    [sym('ircrobotname'), ircrobotname],
    [sym('robotid'), 0],
    [sym('Userip'), undefined],
    [sym('rank'), 5],
    [sym('firewall'), 0],
    [sym('FWuserip'), undefined],
    [sym('ping'), 0],
    [sym('ipcode'), ipcode],
  ]);
}
