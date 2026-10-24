// The arena on its own, for development: the translated arena104 movie in the
// Director runtime, entered with the globals the garage or the lobby would leave.
// (game.html plays the whole game from the loader; this skips to the arena.)
//
//   index.html                                   Training with the test account's robot
//   index.html?user=rival@home.lan&pass=rage2005 another account (its first robot, or &robot=Name)
//   index.html?parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher
//                                                Training with a robot from part ids, no server
//   index.html?match=host&opp=1003               a match: this tab hosts (listens), opponent robot 1003
//   index.html?match=client&host=10.9.9.1&opp=1005&user=rival@home.lan&pass=rage2005
//                                                ... and joins the host at its tab address
//   &addr=10.9.9.1  this tab's address at the relay (the host's, for the client to join)
//   &ranked=1       a ranked match (setrobotscore after each round)
//
// The server is the dev server's test server (/api, /ws). Keys in the arena are the
// game's; L switches widescreen / 4:3 (movies/arena104/enhancements.ts).

import { G, boot, loadSystemFonts, member, newMultiuser, type MultiuserXtra } from './director';
import { DImage } from './director/image';
import { LList, LPropList, TAB, item, itemCount, lingoString, propList, setItemDelimiter, sym, value, type LValue } from './lingo';
import './movies';
import { createPartDescription } from './movies/robotwars/s049-part-description';
import { createRobotSample2 } from './movies/robotwars/s013-robot-descriptions';
import { parseTabText } from './movies/robotwars/s011-purl';
import { parseIniFile } from './movies/loader002/s004-ini';
import { text2image } from './movies/robotwars/s007-jump-movie';
import { rocket_encrypt } from './movies/robotwars/s072-rocket-encrypt';
import { parts } from './parts';

const query = new URLSearchParams(location.search);
const API = `${location.origin}/api/`;

async function mainAsp(fields: Record<string, string | number>): Promise<string> {
  const body = new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${API}main.asp`, { method: 'POST', body });
  return r.text();
}

const prop = (l: LValue, k: string): LValue => (l instanceof LPropList ? l.getaProp(sym(k)) : undefined);

interface Account {
  sid: string;
  memberId: number;
  /** getrobot's reply, as the garage's "load robot" keeps it. */
  robot: LPropList;
  map: string;
}

async function login(user: string, pass: string, robotName: string | null): Promise<Account> {
  const r = value(await mainAsp({ action: 'loginmember', membername: user, password: pass })) as LPropList;
  if (prop(r, 'err') !== 0) throw new Error(`login ${user}: ${lingoString(r)}`);
  const sid = String(prop(r, 'sid'));
  const list = prop(value(await mainAsp({ action: 'getmyrobots', sessionid: sid })), 'robotlist') as LList;
  const entry = [...list].find((e) => !robotName || String(prop(e, 'robotname')).toLowerCase() === robotName.toLowerCase());
  if (!entry) throw new Error(`no robot ${robotName ?? ''} for ${user}`);
  const robotid = prop(entry, 'robotid') as number;
  const robot = value(await mainAsp({ action: 'getrobot', sessionid: sid, robotid })) as LPropList;
  const map = await mainAsp({ action: 'getrobotmap', sessionid: sid, robotid });
  return { sid, memberId: Number(prop(r, 'id')), robot, map };
}

/** A robotDescription from part ids (?parts=), as the server's robot data has it. */
function describe(ids: string, positions: string): LPropList {
  const keys = ['ram', 'torn', 'hjul', 'motor', 'batteri', 'vapen', 'wpnPos', 'special', 'ammunition'];
  const lists = new Map(keys.map((k) => [k, new LList()]));
  for (const id of ids.split(',').filter(Boolean)) lists.get(parts[id]?.typ ?? '')?.append(sym(id));
  for (const p of positions.split(',').slice(0, lists.get('vapen')!.count)) lists.get('wpnPos')!.append(sym(p));
  return new LPropList(keys.map((k) => [sym(k), lists.get(k)!]));
}

function offlineRobot(): LPropList {
  const name = query.get('name') ?? 'Crusher';
  const pansar = Number(query.get('pansar') ?? 50);
  const pl = propList(
    sym('robotDescription'), describe(query.get('parts') ?? 'r1,h2,ma1,b1,v6', query.get('pos') ?? 'f'), sym('inventory'), new LList(),
    sym('money'), 50, sym('space'), 100, sym('spaceleft'), 10, sym('maxSpeed'), 40, sym('pansar'), pansar, sym('info1'), 1112 - 50, sym('saveMap'), 0,
    sym('soldweapons'), new LList(),
  );
  return propList(
    sym('err'), 0, sym('robotid'), 0, sym('robotname'), name, sym('UserLibName'), 'offline', sym('score'), 0, sym('propertyList'), pl,
    sym('friendslist'), new LList(), sym('GameStats'), propList(sym('Win'), 0, sym('lose'), 0, sym('draw'), 0),
  );
}

/** The paint map text (getrobotmap: TAB-separated chassis and tower maps) into map<n>A/B. */
function loadMaps(n: 1 | 2, text: string) {
  setItemDelimiter(TAB);
  text2image(member(`map${n}A`).image as DImage, text ? item(text, 1) : undefined);
  if (text && itemCount(text) > 1) text2image(member(`map${n}B`).image as DImage, item(text, 2));
  else text2image(member(`map${n}B`).image as DImage, undefined);
}

async function main() {
  await loadSystemFonts('/assets');
  const match = query.get('match');
  if (query.get('addr')) sessionStorage.rrAddress = query.get('addr');

  // What the login and garage leave: the session, the robot, the part table...
  let account: Account | null = null;
  if (!query.get('parts')) {
    account = await login(query.get('user') ?? 'tester@home.lan', query.get('pass') ?? 'rage2005', query.get('robot'));
  }
  const ud = account?.robot ?? offlineRobot();
  const robotid = prop(ud, 'robotid');
  // ... and, for a match, what the lobby leaves: the opponent's robot (getrobotall).
  let opponent: LPropList | null = null;
  if (match) {
    const opp = value(await mainAsp({ action: 'getrobotall', robotid: query.get('opp') ?? '' })) as LPropList;
    if (prop(opp, 'err') !== 0) throw new Error(`opponent ${query.get('opp')}: ${lingoString(opp)}`);
    opponent = opp;
    // The lobby's host reports the match start (setrwgames, lobby060_ s033, with its
    // session as the port's lobby sends it); the server counts ranked results only for
    // a match it saw start.
    if (match === 'host' && account) {
      const description = propList(
        sym('server'), robotid, sym('client'), prop(opp, 'robotid'), sym('servername'), prop(ud, 'robotname'), sym('clientname'), prop(opp, 'robotname'),
        sym('serverip'), prop(ud, 'robotname'),
      );
      await mainAsp({ action: 'setrwgames', gamegescription: lingoString(description), sessionid: account.sid });
    }
  }

  // What the loader leaves: main.ini (the file list JumpMovie uses, the server URL).
  const ini = parseIniFile(await (await fetch(`${location.origin}/game/main.ini`)).text());

  const player = boot(document.getElementById('stage') as HTMLDivElement, '/assets');
  player.paused = true;
  await player.start('arena104', match ? 1 : 'backyard');

  // Globals that need the movie's members.
  G.gShockplay = ini;
  G.gUrl = prop(prop(ini, 'info'), 'gUrl') ?? API;
  G.gVersionList = parseTabText(member('version', 'robotwars').text);
  createPartDescription();
  G.gLobby = propList(sym('session'), account?.sid ?? '', sym('selectedid'), 1);
  G.gGameGlobals = propList(sym('userID'), robotid, sym('robotname'), prop(ud, 'robotname'), sym('friendslist'), new LList());
  ud.setaProp(sym('ircrobotname'), '_R' + lingoString(prop(ud, 'robotname')));
  G.gUserData = ud;
  G.gCHat = 1;
  G.gRender = 'openGL';
  loadMaps(1, account?.map ?? '');
  if (opponent) {
    G.gopponentdata = propList(
      sym('robotid'), prop(opponent, 'robotid'), sym('robotname'), prop(opponent, 'robotname'), sym('score'), prop(opponent, 'score'),
      sym('propertyList'), prop(opponent, 'propertyList'),
    );
    loadMaps(2, String(prop(opponent, 'map') ?? ''));
    G.gPlayer = prop(ud, 'robotname');
    G.gOpponent = prop(opponent, 'robotname');
    G.gLobbydata = propList(sym('rankgame'), query.get('ranked') === '1' ? 1 : 0);
    ud.setaProp(sym('server'), match === 'host' ? 1 : 0);
    G.gPlayerNumber = match === 'host' ? 1 : 2;
    G.muInstance = await connect(match === 'host', String(prop(ud, 'robotname')));
  } else {
    G.gopponentdata = createRobotSample2();
  }
  // The mrdoktor behavior's copy of the robot data (makedoktor).
  G.gDoktor = rocket_encrypt(G.gUserData);
  player.paused = false;
  document.title += ' (ready)';
}

/** The lobby's P2P connection: the host listens, the client connects to the host's address. */
function connect(host: boolean, name: string): Promise<MultiuserXtra> {
  const mu = newMultiuser();
  const info = document.getElementById('info')!;
  return new Promise((resolve) => {
    const watcher = {
      connected(msg: LPropList) {
        const subject = String(prop(msg, 'subject'));
        if (prop(msg, 'errorCode') !== 0) {
          info.textContent = `${subject}: no connection (${String(prop(msg, 'errorCode'))}), retrying`;
          if (!host) setTimeout(() => mu.connectToNetServer(name, 'NoPassWord', query.get('host') ?? '', 1626, 'robotwars_lobby'), 1000);
          return;
        }
        if ((host && subject === 'WaitForNetConnection') || (!host && subject === 'ConnectToNetServer')) {
          info.textContent = '';
          resolve(mu);
        }
      },
    };
    mu.setNetMessageHandler(sym('connected'), watcher, '', '', 1);
    if (host) {
      info.textContent = `hosting as ${name} at ${sessionStorage.rrAddress ?? '?'}: waiting for the opponent`;
      mu.waitForNetConnection(propList(sym('userID'), name, sym('maxConnections'), 16));
    } else {
      info.textContent = `joining ${query.get('host')} as ${name}`;
      mu.connectToNetServer(name, 'NoPassWord', query.get('host') ?? '', 1626, 'robotwars_lobby');
    }
  });
}

main().catch((e) => {
  document.getElementById('info')!.textContent = String(e);
  document.title = `error: ${e}`;
  console.error(e);
});
