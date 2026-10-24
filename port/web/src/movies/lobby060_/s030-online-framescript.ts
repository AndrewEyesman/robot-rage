// lobby060_ behavior 30 "online_FrameScript" (frames "inne" and "incountry"): the
// lobby proper. Keeps the room list and user list fresh, fetches the robot you click
// (SMUS_SendIP for its address and id, getrobotall for its data, then a P2P ping) and
// shows its card and 3D model, sends challenges and accepts incoming ones, and goes to
// "ChallengeWait" when a match is agreed.

import { Behavior, G, dot, go, member, netDone, netError, netTextResult, pass, postNetText, put, sendAllSprites, sendSprite, the } from '../../director';
import {
  EMPTY, LList, LPropList, LingoError, TAB, chars, item, itemDelimiter, lingoString, numToChar, random, setItemDelimiter, sym, value,
  voidp, type LSymbol, type LValue,
} from '../../lingo';
import { FormatUserName, Hex2Num, formatInternalUserName, getUserIpCode } from '../robotwars/s004-new-init';
import { text2image } from '../robotwars/s007-jump-movie';
import { getranking } from '../robotwars/s240-getranking';
import {
  DeclineChallenge, DisconnectFromSMUS, PingP2P, ReplaceWord, SendchallengeSMUS, SetRobotPing, changeroom, connectP2P,
  getRankClass, getrankingindex,
} from './s004-lobby-moviescript';
import { eq, setMU } from './util';

// global gOnline, gIRC, P2PmuInstanceListen, P2PmuInstanceConnect, SMUSmuInstance,
// gChallengeGo, getOpponentState, gopponentdata, gOpponentdata_temp, gLobbydata,
// gOpponentProplist, temp_proplist, gjumpto, gGameGlobals, ChallengeList, gUrl,
// gPingTable, gUserData, gVersionList, gPinglist, gDebug, RobotCache, gRoom, gPlayer,
// gOpponent, gWonGames, gLostGames, gLastroom, gFrame, gRobotData

const pl = (v: unknown) => v as LPropList;
const mainasp = () => lingoString(G.gUrl) + lingoString(dot(G.gVersionList, 'mainasp', 'version')) + '?tick=' + the.milliSeconds;

export class OnlineFramescript extends Behavior {
  pState: LSymbol | undefined;
  netId: number | undefined;
  pTimer = 0;
  pnetId: LValue;
  pchallengestate: LValue;
  pUpdateTime = 0;

  beginSprite() {
    sendSprite(1, 'usedoktor');
    this.pState = sym('init');
    G.getOpponentState = sym('nada');
    this.pchallengestate = 1;
    G.gChallengeGo = 0;
    sendAllSprites('hide3DRobot');
    G.ChallengeList = new LList();
    G.RobotCache = new LPropList();
    G.gIRC.GetRoomList(G.gRoom.getPrefix(), 1);
    this.pUpdateTime = the.milliSeconds;
    sendAllSprites('HideChallengeGFX');
    G.gPingTable = new LPropList();
    G.gPinglist = new LList();
    G.gFrame = this;
    // the runMode is "Plugin": gDebug stays unset.
    member('rvtext').text = EMPTY;
  }

  keyUp() {
    // A dummy user on space, in authoring only (the runMode is "Plugin").
    if (the.key === ' ' && eq(the.runMode, 'Author')) {
      const name = 'dummy' + numToChar(random(65, 88)) + numToChar(random(65, 88)) + numToChar(random(65, 88)) + numToChar(random(65, 88));
      put('roomJoin ' + name);
      G.gRoom.RoomJoin('#rw1', formatInternalUserName(name, '0000'));
    }
    return pass();
  }

  Received(subject: LValue, content: LValue, fromName: LValue) {
    if (eq(subject, 'rchat')) callLocal('addChatWindow', this, FormatUserName(lingoString(fromName)), content);
    else if (eq(subject, 'lastresult')) callLocal('addChatWindowResult', FormatUserName(lingoString(fromName)), content);
    else if (eq(subject, 'getroomuserinfo')) G.gRoom.UpdateUserScore(fromName, dot(content, 'score'));
    else if (eq(subject, 'roomuserinfo')) G.gRoom.UpdateUserScore(fromName, dot(content, 'score'));
  }

  abortChallenge(who: LValue) {
    const cl = G.ChallengeList as LList;
    if (cl.count > 0) {
      let i = 1;
      for (const p of [...cl]) {
        if (eq(dot(p, 'ircrobotname'), who)) {
          cl.deleteAt(i);
          i = i + 1;
          break;
        }
      }
      sendAllSprites('updateChallengeList');
    }
  }

  prepareFrame() {
    G.gRoom.HandleRoom();
    G.gIRC.checkOutgoingList();
    if (the.milliSeconds >= this.pUpdateTime) {
      G.gIRC.GetRoomList(G.gRoom.getPrefix(), 1);
      this.pUpdateTime = the.milliSeconds + 15000;
    }
    if (!voidp(G.SMUSmuInstance)) G.SMUSmuInstance.checkNetMessages();
    const st = this.pState;
    if (st === sym('init')) {
      sendAllSprites('HideChallengeGFX');
      G.gopponentdata = undefined;
      G.gRobotData = undefined;
      sendAllSprites('doorAction', sym('open'));
      if (G.gLastroom !== undefined) {
        const lr = lingoString(G.gLastroom);
        const nr = chars(lr, 3, lr.length - 1);
        if (member('CountryName').text !== member('GroupName_' + lingoString(value(nr))).text) member('CountryName').text = member('GroupName_' + lingoString(value(nr))).text;
        if (voidp(G.gWonGames) && voidp(G.gLostGames)) this.pState = sym('waiting');
        else if (the.frame < 15) this.pState = sym('gocountry');
        else if (!eq(G.gWonGames, 0) || !eq(G.gLostGames, 0)) this.pState = sym('showgameData');
        else this.pState = sym('getmydata');
        sendSprite(0, 'EnterRoom', G.gLastroom);
        sendAllSprites('ResetSetScroll');
        if (eq(G.gLastroom, dot(G.gRoom, 'pRoom'))) {
          G.gRoom.pForceUpdate = 1;
          G.gRoom.doupdate();
        }
        sendAllSprites('ExternalsetMember', G.gLastroom);
      } else {
        if (the.frame < 15) {
          member('rvtext').text = EMPTY;
          let s = member('login_text').text;
          s = ReplaceWord(s, '<namn>', dot(G.gUserData, 'robotname'));
          sendAllSprites('showmessage', s);
        }
        this.pState = sym('waiting');
      }
    } else if (st === sym('getmydata')) {
      const infoList = new LPropList();
      infoList.addProp(sym('action'), 'getrobotall');
      infoList.addProp(sym('robotid'), dot(G.gUserData, 'robotid'));
      this.netId = postNetText(mainasp(), infoList);
      this.pState = sym('waitmyData');
    } else if (st === sym('waitmyData')) {
      if (netDone(this.netId) && this.netId !== undefined) {
        if (eq(netError(this.netId), 'ok')) {
          put('visar från servern');
          const tList = value(netTextResult(this.netId));
          sendSprite(1, 'usedoktor');
          const ud = pl(G.gUserData);
          ud.setaProp(sym('score'), dot(tList, 'score'));
          ud.setaProp(sym('rank'), getrankingindex(dot(tList, 'score')));
          ud.setaProp(sym('GameStats'), (dot(tList, 'GameStats') as LPropList).duplicate());
          sendSprite(1, 'makedoktor');
          this.pState = sym('waiting');
        }
      }
    } else if (st === sym('online')) {
      // nothing
    } else if (st === sym('getOpponentRobot')) {
      this.getOpponentRobot();
    } else if (st === sym('RoomError')) {
      sendAllSprites('showmessage', member('Roomerror_text').text);
      this.pState = sym('nada');
    } else if (st === sym('goToRoom')) {
      sendAllSprites('hide3DRobot');
      sendAllSprites('showmessage', member('RoomChange_text').text);
      this.pState = sym('nada');
    } else if (st === sym('RoomChangeDone')) {
      G.RobotCache = new LPropList();
      const room = lingoString(dot(G.gLobbydata, 'CurrentRoom'));
      let s = member('RoomWelcome').text;
      s = ReplaceWord(s, '<room>', member('groupName_' + room).text);
      s = ReplaceWord(s, '<users>', member('GroupCount_' + room).text);
      sendAllSprites('showmessage', s);
      this.pState = sym('waiting');
    } else if (st === sym('getusersOnline')) {
      // nothing
    } else if (st === sym('showUsersOnline')) {
      // state = #init: a local.
    } else if (st === sym('logoff')) {
      sendAllSprites('hide3DRobot');
      sendAllSprites('showDoorMessage', ' ', 1);
      sendAllSprites('doorAction', sym('close'));
      DisconnectFromSMUS(this);
      this.pState = sym('waitLogOut');
    } else if (st === sym('GoSmusError')) {
      sendAllSprites('hide3DRobot');
      sendAllSprites('showDoorMessage', ' ', 1);
      sendAllSprites('doorAction', sym('close'));
      DisconnectFromSMUS(this);
      this.pState = sym('waitSmusError');
    } else if (st === sym('waiting') || st === sym('ChallengeWaitDoor')) {
      // nothing
    } else if (st === sym('AcceptChallenge')) {
      pl(G.gGameGlobals).setaProp(sym('challenger'), 0);
      pl(G.gopponentdata).setaProp(sym('datadone'), 0);
      this.pState = sym('goChallenge');
    } else if (st === sym('showgameData')) {
      let s = member('ShowGameData_text').text;
      s = ReplaceWord(s, '<user1>', G.gPlayer);
      s = ReplaceWord(s, '<user2>', G.gOpponent);
      s = ReplaceWord(s, '<score1>', G.gWonGames);
      s = ReplaceWord(s, '<score2>', G.gLostGames);
      G.gWonGames = undefined;
      G.gLostGames = undefined;
      sendAllSprites('showmessage', s);
      this.pState = sym('getmydata');
    }
  }

  /** The #getOpponentRobot branch of prepareFrame. */
  private getOpponentRobot() {
    const st = G.getOpponentState;
    const rd = () => pl(G.gRobotData);
    if (st === sym('nada')) {
      // nothing
    } else if (st === sym('init')) {
      rd().setaProp(sym('datadone'), 0);
      sendAllSprites('ChallengeButton', sym('hide'));
      this.pchallengestate = 0;
      sendAllSprites('showmessage', member('laddarRobot_text').text);
      G.getOpponentState = sym('waitIp');
    } else if (st === sym('waitIp')) {
      if (!eq(dot(G.gRobotData, 'robotid'), 0)) {
        G.getOpponentState = sym('getdata');
        put(dot(G.gRobotData, 'robotid'));
      }
    } else if (st === sym('getdata')) {
      sendAllSprites('hide3DRobot');
      const infoList = new LPropList();
      infoList.addProp(sym('action'), 'getrobotall');
      infoList.addProp(sym('robotid'), dot(G.gRobotData, 'robotid'));
      this.netId = postNetText(mainasp(), infoList);
      rd().setaProp(sym('ping'), 1);
      // #showOpponentRobot is set and at once replaced by #pingRobot.
      G.getOpponentState = sym('pingRobot');
      connectP2P(this, dot(G.gRobotData, 'Userip'));
      this.pTimer = the.milliSeconds;
    } else if (st === sym('pingRobot')) {
      PingP2P(this, sym('ping'), undefined);
      G.getOpponentState = sym('waitForRobot');
      this.pTimer = the.milliSeconds;
    } else if (st === sym('waitForRobot')) {
      if (the.milliSeconds - this.pTimer > 5000) {
        setMU('P2PmuInstanceConnect', undefined);
        this.PingResult(0);
        G.getOpponentState = sym('ErrorgetRobot');
      }
    } else if (st === sym('showOpponentRobot')) {
      if (netDone(this.netId) && this.netId !== undefined) {
        if (eq(netError(this.netId), 'ok')) {
          put('visar från servern');
          const tList = value(netTextResult(this.netId)) as LPropList;
          this.showrobot(tList);
          this.pState = sym('waiting');
        } else {
          G.getOpponentState = sym('ErrorgetRobot');
          put(netError(this.netId));
        }
      }
    } else if (st === sym('ErrorgetRobot')) {
      sendAllSprites('showmessage', member('ErrorgetRobot_text').text);
      G.getOpponentState = sym('waitReceiveRoomListing');
      this.pState = sym('waiting');
    }
  }

  showrobot(tList: LPropList) {
    G.gOpponentProplist = dot(tList, 'propertyList');
    pl(G.gRobotData).setaProp(sym('propertyList'), dot(tList, 'propertyList'));
    pl(G.gRobotData).setaProp(sym('score'), dot(tList, 'score'));
    sendAllSprites('showmessage', this.Robotmessage(tList));
    this.netId = undefined;
    sendAllSprites('Show3DRobot');
    setItemDelimiter(TAB);
    // The whole map (both items) goes into map2A, as in the original.
    text2image(member('map2A').image, dot(tList, 'map'));
    sendAllSprites('updateTexture', 'map2A', 1);
    if ((dot(G.gOpponentProplist, 'robotDescription', 'torn') as LList).count > 0) {
      text2image(member('map2B').image, item(lingoString(dot(tList, 'map')), 2));
      sendAllSprites('updateTexture', 'map2B', 2);
    }
    sendAllSprites('ChallengeButton', sym('show'));
    this.pchallengestate = 1;
    pl(G.gRobotData).setaProp(sym('datadone'), 1);
    G.getOpponentState = sym('waiting');
  }

  doordone() {
    const st = this.pState;
    if (st === sym('waitSmusError')) this.pState = sym('SmusError');
    else if (st === sym('waitLogOut')) this.pState = sym('loggedOff');
    else if (st === sym('waitopen')) {
      const room = dot(G.gLobbydata, 'CurrentRoom');
      if (Number(room) > 0) {
        let s = member('RoomWelcome').text;
        s = ReplaceWord(s, '<room>', member('groupName_' + lingoString(room)).text);
        s = ReplaceWord(s, '<users>', member('GroupCount_' + lingoString(room)).text);
        sendAllSprites('showmessage', s);
      } else {
        sendAllSprites('showmessage', ReplaceWord(member('login_text').text, '<namn>', dot(G.gUserData, 'robotname')));
      }
      this.pState = sym('waiting');
    } else if (st === sym('ChallengeWaitDoor')) this.pState = sym('goChallenge');
  }

  exitFrame() {
    go(the.frame);
    const st = this.pState;
    if (st === sym('SmusError')) {
      sendAllSprites('showDoorMessage', member('SmusError_text').text);
      go('logoff');
    } else if (st === sym('loggedOff')) {
      sendAllSprites('showDoorMessage', member('LeaveLobby_text').text);
      go('logoff');
    } else if (st === sym('gotomovie')) {
      go('logoff');
    } else if (st === sym('goChallenge')) {
      // gOpentstate = #init: a local (no such global), so nothing.
      go('ChallengeWait');
    } else if (st === sym('gocountry')) {
      go('incountry');
    }
  }

  setState(instate: LSymbol) {
    this.pState = instate;
  }

  goToRoom(room: LValue) {
    changeroom(this, room);
    this.pState = sym('goToRoom');
  }

  getRobot(opponentData: LValue, load: LValue) {
    // IncommingChallenge sends a robot id here, not opponent data: a script error.
    if (!(opponentData instanceof LPropList)) throw new LingoError('getRobot: no opponent data');
    G.gRobotData = opponentData;
    G.gIRC.sendMessage(dot(G.gRobotData, 'ircrobotname'), 'SMUS_SendIP', EMPTY);
    this.pState = sym('getOpponentRobot');
    G.getOpponentState = eq(load, 1) ? sym('init') : sym('showOpponentRobot');
  }

  PingResult(pingtime: LValue) {
    SetRobotPing(this, dot(G.gRobotData, 'robotid'), pingtime);
    pl(G.gRobotData).setaProp(sym('ping'), pingtime);
    put('ping: ' + lingoString(pingtime));
    G.getOpponentState = sym('showOpponentRobot');
  }

  SendChallenge() {
    if (eq(this.pchallengestate, 1)) {
      if (voidp(G.gRobotData)) {
        sendAllSprites('showmessage', member('NoRobot_text').text);
      } else if (eq(dot(G.gRobotData, 'robotid'), dot(G.gUserData, 'robotid'))) {
        sendAllSprites('showmessage', member('YourRobot_text').text);
      } else {
        // chall = 1 always; the "user gone" branch never runs.
        this.pState = sym('waiting');
        // getOpponentRobot = #init: a local.
        const cl = G.ChallengeList as LList;
        if (cl.count > 0) {
          if (eq(dot(cl.getAt(1), 'ircrobotname'), dot(G.gRobotData, 'ircrobotname'))) this.AcceptChallenge();
        } else {
          SendchallengeSMUS(this, G.gRobotData);
          G.gopponentdata = pl(G.gRobotData).duplicate();
          pl(G.gGameGlobals).setaProp(sym('challenger'), 1);
          sendAllSprites('showDoorMessage', ' ', 1);
          sendAllSprites('doorAction', sym('close'));
          sendAllSprites('hide3DRobot');
          this.pState = sym('goChallenge');
        }
      }
    }
  }

  AcceptChallenge() {
    sendAllSprites('usedoktor');
    const cl = G.ChallengeList as LList;
    if (cl.count > 0) {
      const c = cl.getAt(1);
      put('c =  ' + lingoString(c));
      const od = new LPropList();
      G.gopponentdata = od;
      od.setaProp(sym('ircrobotname'), dot(c, 'ircrobotname'));
      od.setaProp(sym('robotname'), FormatUserName(lingoString(dot(c, 'ircrobotname'))));
      od.setaProp(sym('robotid'), dot(c, 'robotid'));
      od.setaProp(sym('ipcode'), getUserIpCode(lingoString(dot(c, 'ircrobotname'))));
      od.setaProp(sym('Userip'), dot(c, 'ip'));
      od.setaProp(sym('server'), dot(c, 'server'));
      pl(G.gUserData).setaProp(sym('server'), eq(dot(c, 'server'), 0) ? 1 : 0);
      this.pState = sym('AcceptChallenge');
      G.getOpponentState = sym('init');
      cl.deleteAt(1);
      let i = cl.count;
      while (i > 0) {
        DeclineChallenge();
        i = i - 1;
      }
    } else {
      put('ingen robot vald');
    }
    sendAllSprites('makedoktor');
  }

  getPingText(ping: LValue): LValue {
    const p = Number(ping);
    if (eq(ping, 0)) return 'No P2P';
    if (p < 80) return 'Really Good';
    if (p < 100) return 'Very Good';
    if (p < 150) return 'Good';
    if (p < 300) return 'Good Enough';
    if (p < 400) return 'Not good';
    if (p >= 400) return 'Bad';
    return ping;
  }

  Robotmessage(temp_list: LValue): string {
    let s: string;
    if (eq(dot(temp_list, 'UserLibName'), dot(G.gUserData, 'UserLibName'))) {
      s = member('showrobot_text_own').text;
      s = ReplaceWord(s, '<creds>', dot(G.gUserData, 'propertyList', 'money'));
    } else {
      s = member('showrobot_text').text;
    }
    s = ReplaceWord(s, '<username>', dot(temp_list, 'robotname'));
    s = ReplaceWord(s, '<owner>', dot(temp_list, 'UserLibName'));
    s = ReplaceWord(s, '<rank>', getranking(Number(dot(temp_list, 'score'))));
    s = ReplaceWord(s, '<score>', dot(temp_list, 'score'));
    s = ReplaceWord(s, '<win>', dot(temp_list, 'GameStats', 'Win'));
    s = ReplaceWord(s, '<lose>', dot(temp_list, 'GameStats', 'lose'));
    s = ReplaceWord(s, '<draw>', dot(temp_list, 'GameStats', 'draw'));
    s = ReplaceWord(s, '<rankclass>', getRankClass(dot(temp_list, 'score')));
    s = ReplaceWord(s, '<ping>', dot(G.gRobotData, 'ping'));
    s = ReplaceWord(s, '<connection>', this.getPingText(dot(G.gRobotData, 'ping')));
    return s;
  }

  EnterRoom(sRoom: LValue) {
    if (!eq(dot(G.gRoom, 'pRoom'), sRoom)) {
      G.gRoom.LeaveRoom();
      G.gRoom.EnterRoom(sRoom);
      sendAllSprites('HideSelection');
    }
  }

  gotomovie(pmovie: LValue, pMarker: LValue) {
    G.gjumpto = new LList([pmovie, pMarker]);
    this.pState = sym('logoff');
  }

  ChallengeDecline(who: LValue) {
    if (!voidp(G.gopponentdata)) {
      if (eq(who, dot(G.gopponentdata, 'ircrobotname'))) {
        const opname = FormatUserName(lingoString(dot(G.gopponentdata, 'robotname')));
        sendAllSprites('showmessage', ReplaceWord(member('DeclineFromRobot_text').text, '<name>', opname));
        sendAllSprites('doorAction', sym('open'));
        G.getOpponentState = sym('init');
        this.pState = sym('waiting');
      }
    }
  }

  Challenge_Busy(_who: LValue) {
    const opname = FormatUserName(lingoString(dot(G.gopponentdata, 'robotname')));
    sendAllSprites('showmessage', ReplaceWord(member('RobotBusy_text').text, '<name>', opname));
    sendAllSprites('doorAction', sym('open'));
    G.getOpponentState = sym('init');
    this.pState = sym('waiting');
  }

  GetIp(_who: LValue, ip: LValue) {
    const s = lingoString(ip);
    const tID = itemDelimiter();
    setItemDelimiter('_');
    pl(G.gRobotData).setaProp(sym('Userip'), item(s, 1));
    pl(G.gRobotData).setaProp(sym('robotid'), Hex2Num(item(s, 2)));
    setItemDelimiter(tID);
  }

  isready() {
    if (this.pState === sym('waiting')) return 1;
    return undefined;
  }
}

/** Handlers the original calls that exist in no script of this version (script errors). */
function callLocal(name: string, ..._args: unknown[]) {
  throw new LingoError(`handler ${name} not defined`);
}

