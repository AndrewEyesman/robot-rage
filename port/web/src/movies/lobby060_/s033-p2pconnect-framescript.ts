// lobby060_ behavior 33 "P2PConnect_framescript" (frame 76, after "ChallengeWait"):
// sets up the match. The host (gUserData.server = 1; the challenged player when both
// are behind the same router) sends SMUS_ConnectToMe and waits; the client connects to
// the host's address and sends P2P_Connected, the host answers P2P_ConnectedOK. If
// the client can't connect within 5 s the roles swap once (SMUS_ReverseP2P). Then the
// opponent's robot and paint map are loaded, the host posts setrwgames, the chosen
// P2P instance becomes muInstance and both jump to the arena.

import { Behavior, G, dot, go, member, netDone, netError, netTextResult, postNetText, put, sendAllSprites, sendSprite, the } from '../../director';
import { EMPTY, LList, LPropList, TAB, item, itemCount, lingoString, propList, setItemDelimiter, sym, value, voidp, type LSymbol, type LValue } from '../../lingo';
import { JumpMovie, text2image } from '../robotwars/s007-jump-movie';
import { ReplaceWord, connectP2P, getRankClass } from './s004-lobby-moviescript';
import { eq, setMU } from './util';

// global gopponentdata, gLobbydata, gUrl, gUserData, gGameGlobals, gVersionList,
// gChallengeGo, gRoom, P2PmuInstanceListen, P2PmuInstanceConnect, SMUSmuInstance, gIRC,
// ChallengeList, getOpponentState, gOpponentProplist, temp_proplist,
// gMultiuserInstanceIRC, gBehindFW, gWonGames, gLostGames, gPlayer, gOpponent,
// gPlayerNumber, muInstance, bWho

const pl = (v: unknown) => v as LPropList;
const mainasp = () => lingoString(G.gUrl) + lingoString(dot(G.gVersionList, 'mainasp', 'version')) + '?tick=' + the.milliSeconds;

export class P2PConnectFramescript extends Behavior {
  pState: LSymbol | undefined;
  pTimer = 0;
  pTries = 0;
  pwait = 0;
  netId: number | undefined;
  pOpName: LValue;
  pSwitch = 0;

  beginSprite() {
    sendSprite(1, 'usedoktor');
    this.pState = sym('init');
    G.getOpponentState = sym('init');
    this.pTries = 0;
    const namestring = dot(G.gopponentdata, 'robotname');
    this.pOpName = namestring;
    if (!voidp(G.bWho)) this.Challenge_Busy(G.bWho);
    this.pSwitch = 0;
  }

  prepareFrame() {
    G.gIRC.checkOutgoingList();
    if (!voidp(G.P2PmuInstanceListen)) G.P2PmuInstanceListen.checkNetMessages();
    if (!voidp(G.P2PmuInstanceConnect)) G.P2PmuInstanceConnect.checkNetMessages();
    const od = () => pl(G.gopponentdata);
    const ud = () => pl(G.gUserData);
    const st = this.pState;
    if (st === sym('init')) {
      if (eq(dot(G.gopponentdata, 'datadone'), 0)) {
        const infoList = new LPropList();
        infoList.addProp(sym('action'), 'getrobotall');
        infoList.addProp(sym('robotid'), dot(G.gopponentdata, 'robotid'));
        this.netId = postNetText(mainasp(), infoList);
      }
      this.pState = sym('Connect');
    } else if (st === sym('waitGoFromToServer')) {
      this.waitForConnection();
      if (eq(G.gChallengeGo, 1)) {
        put(' Go from Server **************');
        this.pState = sym('connectToServer');
      }
    } else if (st === sym('Connect')) {
      sendAllSprites('usedoktor');
      this.pTimer = the.milliSeconds;
      if (this.pSwitch === 0) {
        const opCode = dot(G.gopponentdata, 'ipcode');
        if (eq(dot(G.gIRC, 'ipcode'), '0000')) {
          if (!eq(opCode, '0000') && !eq(opCode, 0)) {
            ud().setaProp(sym('server'), 1);
            put('jag är inte bakom router, men den andra är');
          }
        } else if (eq(opCode, '0000') || eq(opCode, 0)) {
          ud().setaProp(sym('server'), 0);
          put('jag är bakom router, men inte den andra');
        }
      }
      if (eq(dot(G.gUserData, 'server'), 1)) {
        put(" I'll be Server **************");
        put('Send: SMUS_ConnectToMe');
        G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_ConnectToMe', EMPTY);
        this.pState = sym('waitForConnection');
      } else if (eq(dot(G.gUserData, 'server'), 0)) {
        put(" I'll be Client.. **************");
        if (eq(dot(G.gGameGlobals, 'challenger'), 0)) G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_AcceptChallenge', EMPTY);
        this.pState = sym('waitGoFromToServer');
      }
      if (eq(G.gChallengeGo, 1)) this.pState = sym('connectToServer');
      G.getOpponentState = sym('init');
      sendAllSprites('makedoktor');
    } else if (st === sym('waitForConnection')) {
      this.waitForConnection();
    } else if (st === sym('connectToServer')) {
      const os = G.getOpponentState;
      if (os === sym('init')) {
        put("I'll try to connect now! to: " + lingoString(dot(G.gopponentdata, 'Userip')));
        sendAllSprites('showDoorMessage', ReplaceWord(member('ConnectToRobot_text').text, '<namn>', this.pOpName));
        connectP2P(this, dot(G.gopponentdata, 'Userip'));
        G.getOpponentState = sym('waitforP2P');
        this.pTimer = the.milliSeconds;
      } else if (os === sym('waitforP2P')) {
        if (the.milliSeconds - this.pTimer > 5000) {
          put('time out: waitForP2P');
          G.getOpponentState = sym('noConnection');
        } else {
          let s = ReplaceWord(member('ConnectToRobot_text').text, '<name>', this.pOpName);
          s = ReplaceWord(s, '<time>', 10 - Math.trunc((the.milliSeconds - this.pTimer) / 1000));
          sendAllSprites('showDoorMessage', s, 1);
        }
      } else if (os === sym('connected')) {
        put('send: P2P_Connected');
        G.P2PmuInstanceConnect.sendNetMessage(dot(G.gopponentdata, 'ircrobotname'), 'P2P_Connected', EMPTY);
        G.getOpponentState = sym('waitforOK');
        this.pTimer = the.milliSeconds;
      } else if (os === sym('waitforOK')) {
        if (the.milliSeconds - this.pTimer > 15000) this.pState = sym('online');
      } else if (os === sym('noConnection')) {
        G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_ReverseP2P', EMPTY);
        this.ReverseConnection();
      }
    } else if (st === sym('waiting')) {
      if (the.milliSeconds - this.pTimer > 60000) this.pState = sym('online');
    } else if (st === sym('connected')) {
      if (eq(dot(G.gopponentdata, 'datadone'), 0)) {
        if (netDone(this.netId) && this.netId !== undefined) {
          if (eq(netError(this.netId), 'ok')) {
            const tList = value(netTextResult(this.netId)) as LPropList;
            getRankClass(dot(tList, 'score'));
            G.gOpponentProplist = dot(tList, 'propertyList');
            od().setaProp(sym('propertyList'), dot(tList, 'propertyList'));
            od().setaProp(sym('score'), dot(tList, 'score'));
            this.netId = undefined;
            setItemDelimiter(TAB);
            const map = lingoString(dot(tList, 'map'));
            text2image(member('map2A').image, item(map, 1));
            sendAllSprites('updateTexture', 'map2A', 1);
            if (itemCount(map) > 1) {
              text2image(member('map2B').image, item(map, 2));
              sendAllSprites('updateTexture', 'map2B', 2);
            }
            od().setaProp(sym('datadone'), 1);
          } else {
            this.pState = sym('abortChallenge');
          }
        }
      } else {
        sendAllSprites('showDoorMessage', member('LoadingArena_text').text, 1);
        G.gPlayer = dot(G.gUserData, 'robotname');
        G.gOpponent = this.pOpName;
        od().setaProp(sym('propertyList'), G.gOpponentProplist);
        if (eq(dot(G.gUserData, 'server'), 1)) {
          G.gPlayerNumber = 1;
          const infoList = new LPropList();
          infoList.addProp(sym('action'), 'setrwgames');
          infoList.addProp(
            sym('gamegescription'),
            lingoString(
              propList(sym('server'), dot(G.gUserData, 'robotid'), sym('client'), dot(G.gopponentdata, 'robotid'), sym('servername'), dot(G.gUserData, 'robotname'),
                sym('clientname'), dot(G.gopponentdata, 'robotname'), sym('serverip'), dot(G.gUserData, 'robotname')),
            ),
          );
          const url = mainasp();
          this.netId = postNetText(url, infoList);
          put(lingoString(G.gUrl) + lingoString(dot(G.gVersionList, 'mainasp', 'version')), url.slice(url.indexOf('?')) + lingoString(infoList));
          G.muInstance = G.P2PmuInstanceListen;
        } else {
          G.gPlayerNumber = 2;
          G.muInstance = G.P2PmuInstanceConnect;
        }
        G.gOpponentProplist = undefined;
        setMU('P2PmuInstanceListen', undefined);
        setMU('P2PmuInstanceConnect', undefined);
        setMU('SMUSmuInstance', undefined);
        setMU('gMultiuserInstanceIRC', undefined);
        this.pState = sym('arena');
      }
    } else if (st === sym('abortChallenge')) {
      G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_AbortP2P', EMPTY);
      this.pState = sym('online');
      put('nu går vi till online');
    }
  }

  exitFrame() {
    go(the.frame);
    const st = this.pState;
    if (st === sym('online')) {
      G.gWonGames = 0;
      G.gLostGames = 0;
      go('online');
    } else if (st === sym('GoOnline')) {
      if (this.pwait > 0) {
        this.pwait = this.pwait - 1;
        return;
      }
      this.pState = sym('online');
    } else if (st === sym('arena')) {
      G.gRoom.LeaveRoom();
      G.gIRC.closeConnection();
      G.ChallengeList = new LList();
      this.pState = sym('waiting');
      JumpMovie('arena');
    }
  }

  setState(instate: LSymbol) {
    this.pState = instate;
  }

  ReverseConnection(_senderID?: LValue) {
    sendAllSprites('usedoktor');
    put('ReverseConnection**************');
    if (this.pTries > 0) {
      G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_AbortP2P', EMPTY);
      if (eq(dot(G.gIRC, 'ipcode'), '0000')) {
        G.gBehindFW = 1;
        this.pState = sym('Fwerror');
      } else {
        put('Nu går vi tillbaka?');
        this.pState = sym('online');
      }
    } else {
      put('Nu byter vi');
      this.pState = sym('Connect');
      this.pSwitch = 1;
      this.pTries = 1;
      pl(G.gUserData).setaProp(sym('server'), eq(dot(G.gUserData, 'server'), 0) ? 1 : 0);
    }
    sendAllSprites('makedoktor');
  }

  ConnectedOK(_senderID?: LValue) {
    this.pState = sym('connected');
  }

  ChallengeDecline(who: LValue) {
    if (eq(who, dot(G.gopponentdata, 'ircrobotname'))) {
      sendAllSprites('showDoorMessage', ReplaceWord(member('DeclineFromRobot_text').text, '<name>', this.pOpName));
      this.pState = sym('GoOnline');
      this.pwait = 30;
    }
  }

  waitForConnection() {
    const secs = Math.trunc((the.milliSeconds - this.pTimer) / 1000);
    if (the.milliSeconds - this.pTimer > 17000) {
      sendAllSprites('showDoorMessage', ReplaceWord(member('NoAnswer_text').text, '<name>', this.pOpName), 1);
    } else {
      let s: string;
      if (eq(dot(G.gUserData, 'server'), 1)) s = ReplaceWord(member('waitForRobot1_text').text, '<name>', this.pOpName);
      else s = ReplaceWord(member('waitForRobot2_text').text, '<name>', this.pOpName);
      s = ReplaceWord(s, '<time>', 20 - secs);
      sendAllSprites('showDoorMessage', s, 1);
    }
    if (secs > 19) this.pState = sym('online');
  }

  abortChallenge(_who?: LValue) {
    G.gWonGames = 0;
    G.gLostGames = 0;
    this.pState = sym('abortChallenge');
  }

  AcceptChallenge(who: LValue) {
    put('AcceptChallenge**************');
    if (eq(who, dot(G.gopponentdata, 'ircrobotname'))) {
      if (eq(dot(G.gUserData, 'server'), 1)) G.gIRC.sendMessage(dot(G.gopponentdata, 'ircrobotname'), 'SMUS_ConnectToMe');
      else put('vad ska hända här?');
    }
  }

  ConnectToMe(who: LValue) {
    put('ConnectToMe**************');
    if (eq(who, dot(G.gopponentdata, 'ircrobotname'))) {
      G.gChallengeGo = 1;
      this.pState = sym('connectToServer');
    }
  }

  Challenge_Busy(_who: LValue) {
    sendAllSprites('showDoorMessage', ReplaceWord(member('RobotBusy_text').text, '<name>', this.pOpName));
    this.pState = sym('GoOnline');
    this.pwait = 90;
    G.bWho = undefined;
  }
}

