// lobby060_ behavior 224 "irc login framescript" (frame 3): opens the P2P listener,
// then logs on to the IRC lobby through gIRC, trying the ircports of main.ini in a
// shuffled order (ircip1 for tries 1-5, ircip2 for 6-10), and moves on two seconds
// after the server's welcome (376).

import { Behavior, G, dot, go, member, pass, put, sendAllSprites, sendSprite, the } from '../../director';
import { EMPTY, LList, LPropList, RETURN, lingoString, random, sym, type LSymbol, type LValue } from '../../lingo';
import { JumpMovie } from '../robotwars/s007-jump-movie';
import { getMyIP } from '../robotwars/s034-get-my-ip';
import { DisconnectFromSMUS, OpenP2PConnection, getrankingindex } from './s004-lobby-moviescript';

export class IrcLoginFramescript extends Behavior {
  pState: LSymbol | undefined;
  pnetId: LValue;
  pstartTime = 0;
  pTryNum = 0;
  infoMember: LValue;
  pseed = 0;
  pPortTable: LList | undefined;

  beginSprite() {
    sendAllSprites('usedoktor');
    member('ronline').text = EMPTY;
    this.showmessage('Entering the Lobby...');
    this.pState = sym('initIRC');
    G.gLobbydata = new LPropList();
    const ud = G.gUserData as LPropList;
    ud.setaProp(sym('Userip'), getMyIP());
    ud.setaProp(sym('FWuserip'), getMyIP());
    ud.setaProp(sym('server'), 0);
    if (lingoString(dot(ud, 'FWuserip')) === lingoString(dot(ud, 'Userip'))) ud.setaProp(sym('firewall'), 0);
    else ud.setaProp(sym('firewall'), 1);
    const gl = G.gLobbydata as LPropList;
    gl.setaProp(sym('CurrentRoom'), 0);
    gl.setaProp(sym('RoomList'), new LList());
    gl.setaProp(sym('rankgame'), 0);
    ud.setaProp(sym('rank'), getrankingindex(dot(ud, 'score')));
    (G.gGameGlobals as LPropList).setaProp(sym('SmusServerIP'), dot(G.gVersionList, 'smusip', 'version'));
    DisconnectFromSMUS();
    OpenP2PConnection(this);
    sendAllSprites('makedoktor');
  }

  showmessage(s: LValue) {
    member('ronline').text = member('ronline').text + RETURN + lingoString(s);
  }

  ClearMessage(_s?: LValue) {
    member('ronline').text = EMPTY;
  }

  IRCconnected() {
    this.pState = sym('IRCconnected');
    return pass();
  }

  IRCfailed() {
    if (this.pState === sym('waitConnect') || this.pState === sym('waitWelcome')) {
      this.ClearMessage();
      this.showmessage('Entering the Lobby...');
      this.showmessage('Connection failed.. #' + this.pTryNum);
      this.showmessage('Trying again....');
      this.pTryNum = this.pTryNum + 1;
      this.pState = sym('ConnectIRC');
    }
  }

  Welcome() {
    sendSprite(1, 'usedoktor');
    this.ClearMessage();
    this.showmessage('Entry successful.');
    if (G.gOnline > 0) this.showmessage('Robots in lobby and battle: ' + lingoString(G.gOnline));
    (G.gUserData as LPropList).setaProp(sym('online'), sym('online'));
    this.pstartTime = the.milliSeconds;
    this.pState = sym('Welcome');
    sendSprite(1, 'makedoktor');
  }

  randomizetable(table: LList): LList {
    const ntable = new LList();
    while (table.count > 0) {
      const p = random(table.count);
      ntable.add(table.getAt(p));
      table.deleteAt(p);
    }
    return ntable;
  }

  exitFrame() {
    go(the.frame);
    const st = this.pState;
    if (st === sym('initIRC')) {
      this.pTryNum = 1;
      if (this.pTryNum > 10) this.pTryNum = 1;
      this.pState = sym('ConnectIRC');
      this.pPortTable = this.randomizetable((dot(G.gShockplay, 'server', 'ircports') as LList).duplicate());
      this.pseed = random(5);
    } else if (st === sym('ConnectIRC')) {
      let tip: LValue;
      let tPort: LValue;
      if (this.pTryNum >= 1 && this.pTryNum <= 5) {
        tip = dot(G.gShockplay, 'server', 'ircip1');
        tPort = this.pPortTable!.getAt(((this.pTryNum + this.pseed) % 5) + 1);
      } else if (this.pTryNum >= 6 && this.pTryNum <= 10) {
        tip = dot(G.gShockplay, 'server', 'ircip2');
        tPort = this.pPortTable!.getAt(((this.pTryNum + this.pseed) % 5) + 1);
      } else {
        this.pState = sym('failed');
        return;
      }
      put(lingoString(tip) + ' : ' + lingoString(tPort));
      if (this.pState === sym('ConnectIRC')) {
        G.gIRC.ConnectIRC(tip, tPort, dot(G.gUserData, 'ircrobotname'), 'nopwd', dot(G.gUserData, 'robotid'));
        this.pstartTime = the.milliSeconds;
        this.pState = sym('waitConnect');
      }
    } else if (st === sym('waitConnect')) {
      if (the.milliSeconds > this.pstartTime + 3000) {
        this.showmessage('time out #' + this.pTryNum);
        G.gIRC.closeConnection();
        this.IRCfailed();
      }
    } else if (st === sym('failed')) {
      this.showmessage('Unable to connect');
      JumpMovie('factory');
      this.pState = sym('waitTraining');
    } else if (st === sym('waitWelcome')) {
      if (the.milliSeconds > this.pstartTime + 20000) {
        this.showmessage('timeout #' + this.pTryNum);
        G.gIRC.closeConnection();
        this.IRCfailed();
      }
    } else if (st === sym('IRCconnected')) {
      this.pState = sym('waitWelcome');
    } else if (st === sym('Welcome')) {
      if (the.milliSeconds > this.pstartTime + 2000) {
        go(the.frame + 1);
        this.pState = sym('nada');
      }
    } else if (st === sym('error')) {
      // nothing
    } else {
      go(the.frame);
    }
  }
}
