// Development entry for the lobby (lobby-dev.html), not part of the game's flow: logs
// in through the server's real calls and leaves the globals the loader, login and
// garage would (gShockplay, gUrl, gCom, gUser, gLobby with #session, gGameGlobals),
// then starts lobby060_ at frame 1, whose "load robot" fetches gUserData (getrobot)
// as when coming from the garage.
//
//   /lobby-dev.html?email=tester@home.lan&password=rage2005&robot=<name>
//
// Without ?robot the account's first robot is used. A different tab (or ?addr=) gets a
// different relay address, so two tabs are two players.

import { G, boot, loadSystemFonts } from '../../director';
import { LList, LPropList, lingoString, sym, value } from '../../lingo';
import { parseIniFile } from '../loader002/s004-ini';
import { AspCommunicationObject } from '../login013_/s031-asp-communication-object';
import { UserObject } from '../login013_/s033-user-object';
import '..';

async function call(url: string, fields: Record<string, string>): Promise<LPropList> {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams(fields) });
  const v = value(await r.text());
  if (!(v instanceof LPropList)) throw new Error(`${fields.action}: unexpected reply`);
  return v;
}

export async function devLobby() {
  const q = new URLSearchParams(location.search);
  const email = q.get('email') ?? 'tester@home.lan';
  const password = q.get('password') ?? 'rage2005';
  await loadSystemFonts('/assets');
  const player = boot(document.getElementById('stage') as HTMLDivElement, '/assets');
  const ini = await (await fetch(`/game/main.ini?tick=${Date.now()}`)).text();
  G.gShockplay = parseIniFile(ini);
  const gUrl = lingoString((G.gShockplay as LPropList).getaProp(sym('info')) instanceof LPropList ? ((G.gShockplay as LPropList).getaProp(sym('info')) as LPropList).getaProp(sym('gUrl')) : '');
  G.gUrl = gUrl;
  G.gCom = new AspCommunicationObject(gUrl);
  G.gUser = new UserObject();
  const unique = lingoString(G.gUser.uniqueCode);
  const login = await call(`${gUrl}main.asp`, { action: 'loginmember', membername: email, password, uniquecode: unique });
  if (lingoString(login.getaProp(sym('err'))) !== '0') throw new Error(`login failed: ${lingoString(login)}`);
  const session = lingoString(login.getaProp(sym('sid')));
  G.gLobby = new LPropList([
    [sym('miniclipid'), login.getaProp(sym('id'))],
    [sym('session'), session],
  ]);
  G.gMyEmail = email;
  const robots = await call(`${gUrl}main.asp`, { action: 'getmyrobots', sessionid: session, uniquecode: unique });
  const rl = robots.getaProp(sym('robotlist'));
  const list = [...(rl instanceof LList ? rl : [])].filter((x): x is LPropList => x instanceof LPropList && x.getaProp(sym('robotid')) !== undefined);
  const want = q.get('robot');
  const pick = (want ? list.find((r) => lingoString(r.getaProp(sym('robotname'))).toLowerCase() === want.toLowerCase()) : list[0]) ?? list[0];
  if (!pick) throw new Error(`no robots: ${lingoString(robots)}`);
  G.gGameGlobals = new LPropList([
    [sym('userID'), pick.getaProp(sym('robotid'))],
    [sym('robotname'), pick.getaProp(sym('robotname'))],
    [sym('friendslist'), new LList()],
  ]);
  console.log('dev lobby as', lingoString(G.gGameGlobals));
  await player.start('lobby060_', q.get('frame') ?? 1);
}
