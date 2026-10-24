// lobby060_ movie script 4 "lobby_MovieScript": the peer-to-peer side of the lobby.
// Every player listens for peers from lobby entry on (P2PmuInstanceListen, userID =
// robot name); clicking a robot connects to it and pings it four times; a challenge
// connects again and trades P2P_Connected / P2P_ConnectedOK before both load the
// arena. Plus the room change, the opponent data from the room's user list, pings,
// the challenge message and the ranking texts.

import { G, MultiuserXtra, alert, dot, member, put, sendAllSprites, sendSprite, the } from '../../director';
import {
  EMPTY, LList, LPropList, TAB, chars, integer, item, lingoString, list, num, numToChar, offset, propList, setItemDelimiter, sym,
  symbol, value, voidp, type LValue,
} from '../../lingo';
import { FormatUserName, getUserIpCode } from '../robotwars/s004-new-init';
import { isBehindRouter } from '../robotwars/s005-changes';
import { getMyIP } from '../robotwars/s034-get-my-ip';
import { getranking } from '../robotwars/s240-getranking';
import { eq, setMU } from './util';

// global SMUSmuInstance, P2PmuInstanceListen, P2PmuInstanceConnect, gLobbydata, gOnline,
// gUserData, gVersionList, gPinglist, gRoom, getOpponentState, gopponentdata,
// gGameGlobals, gRobotData, ChallengeList, gPingTable

const ERR_NO_CONNECTION = '-2147216214';

export function SearchAndReplace(theText: string, stringToFind: string, stringToInsert: string): string {
  let hasChar = offset(stringToFind, theText);
  while (hasChar) {
    theText = chars(theText, 1, hasChar - 1) + stringToInsert + chars(theText, hasChar + stringToFind.length, theText.length);
    hasChar = offset(stringToFind, theText);
  }
  return theText;
}

/** The P2P instances' message handler (both the listener and the connection). */
export function P2PMessageHandler(me: unknown, message: LPropList) {
  const errorCode = message.getaProp(sym('errorCode'));
  const subject = message.getaProp(sym('subject'));
  const senderID = message.getaProp(sym('senderID'));
  const content = message.getaProp(sym('content'));
  if (!eq(errorCode, 0)) {
    // case 0 of voidp(...): the first instance that exists names the error.
    if (!voidp(G.P2PmuInstanceConnect)) put(G.P2PmuInstanceConnect.getNetErrorString(errorCode));
    else if (!voidp(G.P2PmuInstanceListen)) put(G.P2PmuInstanceListen.getNetErrorString(errorCode));
    if (eq(errorCode, ERR_NO_CONNECTION)) {
      put(lingoString(senderID) + '******************');
      if (the.frameLabel === 'viewChallenge') {
        sendSprite(0, 'setState', sym('noConnection'));
      } else {
        setMU('P2PmuInstanceConnect', undefined);
        put(lingoString(G.getOpponentState) + '-- detta är There is no current connection på P2P');
        const st = G.getOpponentState;
        if (st === sym('waitForRobot')) sendSprite(0, 'PingResult', 0);
        else if (st === sym('pingRobot')) sendSprite(0, 'PingResult', 0);
        else if (st === sym('waitforP2P')) G.getOpponentState = sym('noConnection');
      }
    } else {
      put(G.P2PmuInstanceConnect?.getNetErrorString(errorCode));
    }
    return undefined;
  }
  if (eq(subject, 'ConnectToNetServer')) {
    put('************ ConnectToNetServer ************');
    if (the.frameLabel === 'viewChallenge') {
      sendSprite(0, 'setState', sym('connected'));
    } else {
      G.gPinglist = new LList();
      if (G.getOpponentState === sym('waitForRobot')) G.getOpponentState = sym('pingRobot');
      else if (G.getOpponentState === sym('waitforP2P')) G.getOpponentState = sym('connected');
    }
  } else if (eq(subject, 'WaitForNetConnection')) {
    put('************ Incomming Connection ************');
    return 1;
  } else if (eq(subject, 'ConnectionProblem')) {
    put('************ ConnectionProblem ************');
  } else if (eq(subject, 'P2P_Ping')) {
    put('************ PING ************');
    G.P2PmuInstanceListen.sendNetMessage(senderID, 'P2P_Pong', content);
  } else if (eq(subject, 'P2P_Ping_Exit')) {
    put('************ PING EXIT ************');
    G.P2PmuInstanceListen.breakConnection(senderID);
    addPingToRobotId(me, senderID, content);
  } else if (eq(subject, 'P2P_Pong')) {
    put('************ PONG ************');
    const pl = G.gPinglist as LList;
    pl.setAt(pl.count, the.milliSeconds - num(pl.getAt(pl.count)));
    if (pl.count <= 3) {
      PingP2P(me, sym('ping'), undefined);
    } else {
      let sum = 0;
      for (const i of pl) sum = sum + num(i);
      const pingtime = Math.trunc(sum / pl.count);
      addPingToRobotId(me, dot(G.gRobotData, 'ircrobotname'), pingtime);
      PingP2P(me, sym('exit'), pingtime);
      sendSprite(0, 'PingResult', pingtime);
    }
  } else if (eq(subject, 'P2P_Connected')) {
    put('received: P2P_Connected');
    G.P2PmuInstanceListen.sendNetMessage(senderID, 'P2P_ConnectedOK', EMPTY);
    put('send: P2P_ConnectedOK');
    sendSprite(0, 'ConnectedOK', senderID);
  } else if (eq(subject, 'P2P_ConnectedOK')) {
    put('received: P2P_ConnectedOK');
    sendSprite(0, 'ConnectedOK', senderID);
  }
  return undefined;
}

export function DisconnectFromSMUS(_me?: unknown) {
  setMU('SMUSmuInstance', undefined);
  setMU('P2PmuInstanceListen', undefined);
  setMU('P2PmuInstanceConnect', undefined);
}

export function OpenP2PConnection(_me?: unknown) {
  setMU('P2PmuInstanceListen', new MultiuserXtra());
  let errCode = G.P2PmuInstanceListen.setNetMessageHandler(sym('P2PMessageHandler'), 0, EMPTY, EMPTY, 1);
  if (errCode !== 0) alert('Problem with setNetMessageHandler');
  // the machineType = 256 (Windows): the listener names its local address.
  errCode = G.P2PmuInstanceListen.waitForNetConnection(
    propList(sym('userID'), dot(G.gUserData, 'robotname'), sym('maxConnections'), 16, sym('localAddress'), getMyIP(), sym('localTCPPort'), value(dot(G.gVersionList, 'p2pport', 'version'))),
  );
  if (errCode !== 0) alert('Problem with waitForNetConnection ' + lingoString(dot(G.gUserData, 'robotname')));
}

export function DeclineChallenge(_me?: unknown) {
  const cl = G.ChallengeList as LList;
  if (cl.count > 0) {
    G.gIRC.sendMessage(dot(cl.getAt(1), 'ircrobotname'), 'SMUS_DeclineChallenge');
    cl.deleteAt(1);
    sendAllSprites('updateChallengeList');
  }
}

export function connectP2P(_me: unknown, ip: LValue) {
  setMU('P2PmuInstanceConnect', new MultiuserXtra());
  let errCode = G.P2PmuInstanceConnect.setNetMessageHandler(sym('P2PMessageHandler'), 0, EMPTY, EMPTY, 1);
  if (errCode !== 0) alert('Problem with setNetMessageHandler');
  errCode = G.P2PmuInstanceConnect.connectToNetServer(dot(G.gUserData, 'robotname'), 'NoPassWord', ip, 1626, 'robotwars_lobby');
  if (errCode !== 0) alert('Problem with connectToNetServer');
}

export function PingP2P(_me: unknown, what: LValue, pingtime: LValue) {
  if (what === sym('ping')) {
    if (!voidp(G.P2PmuInstanceConnect)) {
      (G.gPinglist as LList).add(the.milliSeconds);
      G.P2PmuInstanceConnect.sendNetMessage(dot(G.gRobotData, 'robotname'), 'P2P_Ping', EMPTY);
    } else {
      sendSprite(0, 'PingResult', 0);
    }
  } else if (what === sym('exit')) {
    G.P2PmuInstanceConnect.sendNetMessage(dot(G.gRobotData, 'robotname'), 'P2P_Ping_Exit', pingtime);
    G.gPinglist = new LList();
  }
}

export function changeroom(_me: unknown, room: LValue) {
  // SMUSmuInstance is never set in this version: a script error, so CurrentRoom stays.
  G.SMUSmuInstance.sendNetMessage('system.group.leave', 'leaveroom', '@' + lingoString(dot(G.gLobbydata, 'CurrentRoom')));
  (G.gLobbydata as LPropList).setaProp(sym('CurrentRoom'), room);
}

/** The opponent data for a name in the room's user list (robotid 0 until SMUS_GetIP). */
export function getOnlineRobotId(_me: unknown, who: LValue): LPropList | undefined {
  put('check ' + lingoString(who));
  const tempList = (dot(G.gRoom, 'pUserList') as LList).duplicate();
  setItemDelimiter(TAB);
  let opdata: LPropList | undefined;
  for (let i = 1; i <= tempList.count; i++) {
    const u = tempList.getAt(i);
    if (eq(item(lingoString(dot(u, 'displayName')), 1), who)) {
      opdata = new LPropList();
      opdata.addProp(sym('robotname'), FormatUserName(lingoString(dot(u, 'name'))));
      opdata.addProp(sym('ircrobotname'), dot(u, 'name'));
      opdata.addProp(sym('robotid'), integer(dot(u, 'id')));
      opdata.addProp(sym('Userip'), undefined);
      opdata.addProp(sym('rank'), 5);
      opdata.addProp(sym('firewall'), 0);
      opdata.addProp(sym('FWuserip'), undefined);
      opdata.addProp(sym('ping'), 0);
      const userstring = lingoString(dot(u, 'name'));
      opdata.addProp(sym('ipcode'), getUserIpCode(userstring));
    }
  }
  return opdata;
}

export function addPingToRobotId(_me: unknown, who: LValue, ping: LValue) {
  // Leaves the itemDelimiter at ":", as the original does.
  setItemDelimiter(':');
  const theuserid = symbol(item(lingoString(who), 2));
  const t = G.gPingTable as LPropList;
  if (t.getaProp(theuserid) === undefined) t.addProp(symbol(theuserid), ping);
  else if (num(t.getaProp(theuserid)) < num(ping)) t.setaProp(symbol(theuserid), ping);
}

export function SetRobotPing(_me: unknown, whoid: LValue, ping: LValue) {
  // The table is emptied first, so it only ever holds the last robot.
  G.gPingTable = new LPropList();
  const id = symbol(whoid);
  const t = G.gPingTable as LPropList;
  if (t.getaProp(id) === undefined) t.addProp(symbol(id), ping);
  else if (num(t.getaProp(id)) < num(ping)) t.setaProp(symbol(id), ping);
}

export function GetRobotPing(_me: unknown, _whoid: LValue) {
  // Returns 50 before the table lookup after it.
  return 50;
}

export function SendchallengeSMUS(_me: unknown, who: LValue) {
  put('challenge sent to ' + lingoString(dot(who, 'ircrobotname')));
  const ud = G.gUserData;
  const L = propList(sym('id'), dot(ud, 'robotid'), sym('server'), isBehindRouter() ? 0 : 1, sym('ip'), dot(ud, 'Userip'), sym('rank'), dot(ud, 'rank'));
  G.gIRC.sendMessage(dot(who, 'ircrobotname'), 'Challenge', 0, L);
  put('Sending Challange ***********');
}

export function ReplaceWord(txt: LValue, src?: LValue, dst?: LValue): string {
  let t = lingoString(txt);
  const s = lingoString(src);
  // getRankClass calls this with the text alone: Director's offset of an empty string
  // is 0 (the loop would never end otherwise), so the text comes back unchanged.
  if (s === EMPTY) return t;
  while (offset(s, t) > 0) {
    const p = offset(s, t);
    t = chars(t, 1, p - 1) + lingoString(dst) + chars(t, p + s.length, t.length + s.length);
  }
  return t;
}

export function getRankClass(tScore: LValue): string {
  const gl = G.gLobbydata as LPropList;
  if (getranking(num(tScore)) === getranking(num(dot(G.gUserData, 'score')))) {
    gl.setaProp(sym('rankgame'), 1);
    return ReplaceWord(member('rankclassok_text').text);
  }
  gl.setaProp(sym('rankgame'), 0);
  return ReplaceWord(member('rankclassbad_text').text);
}

export function getrankingindex(temp_score: LValue): number | undefined {
  const s = num(temp_score);
  if (s < 250) return 0;
  if (s < 500) return 1;
  if (s < 1000) return 2;
  if (s < 2000) return 3;
  if (s < 4000) return 4;
  if (s >= 4000) return 5;
  return undefined;
}

/** The machineType is 256 (Windows): the lowest ranking is an em dash. */
const RANKS = () => list(numToChar(151), '+', '++', '+++', '++++', '+++++');

export function getrankingfromindex(tIndex: LValue): LValue {
  return RANKS().getAt(num(tIndex) + 1);
}

export function getrankingfromindex2(tIndex: LValue): LValue {
  if (voidp(integer(tIndex))) tIndex = 0;
  return RANKS().getAt(num(tIndex) + 1);
}
