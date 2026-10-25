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
// - Long email addresses (?quirks=longemail, #59): the login screen's email box scrolls
//   sideways (login013_ 97, James Newton's library behavior) by cutting the characters
//   that don't fit off the front of the field's text and keeping the whole text itself,
//   but logging in and creating an account read the field's text: an address wider than
//   the box (about 27 characters) went without its first letters, so it couldn't log in
//   (or made an account under the cut address). They now read the behavior's full text.
// - The paint map encoder's right edge (?quirks=mapedge, #63): image2text (robotwars)
//   compares each pixel with the next one along the row, and at the row's end with
//   pixels past the edge, which read as index 0, so a row ending in index 0 counted
//   pixels that don't exist and the rest of the map loaded shifted. The Paintshop's
//   palette has no index 0, but a map could hold one; the run now stops at the edge
//   (the format is unchanged).
// - Deleting a selection in the email box (?quirks=scrollselect, #65): the box's
//   behavior (login013_ 97) deletes a selection by its own copy of it, taken at keyDown
//   and while the mouse drags, so a selection it didn't see made (Tab into the field
//   selects all of it) deleted nothing and put the caret at the start, where the next
//   typing went in front of the old text. It now deletes the field's selection.
// - Staying logged in (?quirks=keeplogin, #66): the login screen kept only the email,
//   so every reload of the page asked for the password again. A login now keeps its
//   session in the browser (keptLogin); the login screen checks it with the server
//   (getmyrobots) and, while it's alive, goes straight to the robot list. Logging out
//   (QUIT on the robot list or in the garage, the lobby's idle timeout) forgets it,
//   and so does the server's "logged out" (18) for an expired or ended session.
// - The remembered email (?quirks=scrolltext, #67): the login screen fills the email box
//   with the remembered address in its frame script's beginSprite, after the box's
//   behavior (login013_ 97) read the still empty field as its full text, so the first key
//   typed in the box replaced the whole address with that key; and with the longemail
//   fix, logging in without retyping it sent no email ("Not a valid email/password!").
//   The behavior now takes the field's text when a script set it behind its back, and
//   logging in reads that text.
// - The lobby's ping (?quirks=lobbyping, #70): clicking a robot connects to it and, the
//   next frame, pings it, while the connection is still opening; the Multiuser Xtra sends
//   that ping once it opens, and the connection's arrival (ConnectToNetServer) empties
//   the ping list and pings again. Two pings went round, each pong sending the next, so
//   when four times were in and the list emptied, the other pong found it empty: a script
//   error (the first players' error report) and a ping read from half the samples. The
//   first ping now waits for the connection, and a pong with no ping waiting is ignored.
// - A session on the match connection (?quirks=relayauth, #56): the P2P relay sockets
//   (the lobby's listener and connections, which carry the match) send the login
//   session, so the server knows a connection that closes is really that player's.
//   A player who quits a ranked round then loses it (the other side's walkover claim
//   counts) instead of voiding it (server/results.mjs).
// - A lobby that lost its connection (?quirks=lobbylost): the lobby never noticed its
//   IRC connection or its match listener closing, which a phone's browser does to a page
//   it keeps in the background; the lobby stayed on screen but dead (an old user list,
//   invisible to everyone else, a clicked robot loading forever). It now enters the
//   lobby again (back into its room) saying the connection was lost (lobby060_ s030).
// - The button click on a touch screen (?quirks=touchclick): buttons click on mouseDown
//   (robotwars 52, playsound "knappljud"), and some stop every sound channel on the
//   release: the garage doors' opening (robotwars 254) silences channels 1-8 before its
//   own sound, and a movie switch stops them all. A mouse button is held long enough for
//   most of the 0.16 s click to play first; a finger's release comes a few milliseconds
//   after its press, so the click was cut before it could be heard. In touch mode the
//   click plays on its own, outside the channels (s030 playsound). A mouse and keyboard
//   session is unchanged.

import { G, TextualMember, dot, member, netDone, netError, netTextResult, player, setRelaySession } from '../director';
import { LPropList, lingoString, sym, value, type LValue } from '../lingo';
import { rocket_encrypt } from './robotwars/s072-rocket-encrypt';
import { emptyRobotProplist } from './robotwars/s011-purl';
import { onSettingChange, setting } from '../settings';

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const quirks = (query.get('quirks') ?? '').split(',');

export const gameFixes = {
  emptyRobot: !quirks.includes('emptyrobot'),
  challengeCard: !quirks.includes('challengecard'),
  gridNoChassis: !quirks.includes('grid'),
  p2pSwap: !quirks.includes('p2pswap'),
  economy: !quirks.includes('economy'),
  matchSession: !quirks.includes('results'),
  ircAuth: !quirks.includes('ircauth'),
  mapSession: !quirks.includes('mapsession'),
  robotReply: !quirks.includes('robotreply'),
  longEmail: !quirks.includes('longemail'),
  mapEdge: !quirks.includes('mapedge'),
  scrollSelect: !quirks.includes('scrollselect'),
  scrollText: !quirks.includes('scrolltext'),
  keepLogin: setting('keepLogin'),
  lobbyPing: !quirks.includes('lobbyping'),
  relayAuth: !quirks.includes('relayauth'),
  lobbyLost: !quirks.includes('lobbylost'),
  touchClick: !quirks.includes('touchclick'),
};

// The kept login changes only this browser: the player's Settings choose it.
onSettingChange('keepLogin', (v) => {
  // Turned off, the login kept now is forgotten too (this page stays logged in).
  gameFixes.keepLogin = v;
  if (!v) forgetLogin();
});

setRelaySession(() => {
  const sid = gameFixes.relayAuth ? dot(G.gLobby, 'session') : undefined;
  return typeof sid === 'string' ? sid : '';
});

/**
 * gameFixes.longEmail: the whole text of a field member that a "Horizontal scroll
 * (field)" behavior (login013_ 97) scrolls, which keeps it as myFullText while the
 * field shows only the part that fits (its end); the field's text when no sprite
 * scrolls it, or (gameFixes.scrollText) when a script set the text behind the
 * behavior's back.
 */
export function scrolledFieldText(name: string): string {
  const m = member(name) as TextualMember;
  if (gameFixes.longEmail) {
    for (const s of player.sprites) {
      if (s?.member !== m) continue;
      const b = s.scriptInstanceList.find((i) => typeof (i as { getText?: unknown }).getText === 'function') as { getText(): string } | undefined;
      if (!b) continue;
      const full = b.getText();
      return !gameFixes.scrollText || (m.text && full.endsWith(m.text)) ? full : m.text;
    }
  }
  return m.text;
}

/** gameFixes.keepLogin: the last login's session, member id and email, kept in the browser. */
export interface KeptLogin {
  sid: string;
  id: LValue;
  email: string;
}
const KEPT_LOGIN = 'rr-login';

export function keptLogin(): KeptLogin | undefined {
  if (!gameFixes.keepLogin) return undefined;
  try {
    const k = JSON.parse(localStorage.getItem(KEPT_LOGIN) ?? 'null') as KeptLogin | null;
    return k && typeof k.sid === 'string' && k.sid ? k : undefined;
  } catch {
    return undefined;
  }
}

export function keepLogin(sid: LValue, id: LValue, email: string) {
  if (gameFixes.keepLogin && typeof sid === 'string' && sid) localStorage.setItem(KEPT_LOGIN, JSON.stringify({ sid, id, email }));
}

export function forgetLogin() {
  localStorage.removeItem(KEPT_LOGIN);
}

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
