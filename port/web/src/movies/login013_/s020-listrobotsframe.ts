// login013_ behavior "listrobotsframe" (frame "listrobots"): loads the member's
// robots into the five rows; create, delete and choose a robot to enter the garage.

import { Behavior, G, callGlobal, getPref, go, member, put, sendAllSprites, sprite, the } from '../../director';
import { EMPTY, LList, LPropList, contains, num, point, propList, sym, symbol, value, voidp, type LSymbol, type LValue } from '../../lingo';
import { formatIncomingText, formatOutgoingText } from './s029-mac-pc';
import { JumpMovie } from './s032-movie-behavior';


export class Listrobotsframe extends Behavior {
  pState: LSymbol | undefined;
  pdeleteID = 0;
  pTryNum = 0;

  beginSprite() {
    G.gUserData = undefined;
    G.gLobby.setaProp(sym('selectedid'), 0);
    this.pState = sym('init');
    for (let i = 1; i <= 5; i++) member('Robotname' + i).text = EMPTY;
    G.gCHat = value(getPref('chatpref'));
    if (voidp(G.gRender)) G.gRender = getPref('renderpref');
    if (voidp(G.gRender)) G.gRender = sym('auto');
    else G.gRender = symbol(G.gRender);
    if (voidp(G.gCHat)) G.gCHat = 1;
  }

  private selected(): LPropList {
    return (G.myList as LList).getAt(G.gLobby.prop('selectedid')) as LPropList;
  }

  exitFrame() {
    G.gCom.checkNetMessages();
    switch (this.pState) {
      case sym('init'):
        G.gLobby.setaProp(sym('selectedid'), 0);
        sprite(21).loc = point(-123, -100);
        for (let i = 1; i <= 5; i++) member('Robotname' + i).text = EMPTY;
        member('gcom_STATE').text = 'Please Wait!\rLoading your robots';
        G.gCom.send('main.asp', propList('action', 'getmyrobots', 'sessionid', G.gLobby.prop('session'), 'uniquecode', G.gUser.uniqueCode), sym('done'), this, 0, propList(sym('loc'), point(554, 394)));
        this.pState = sym('wait');
        break;
      case sym('login'): {
        const robotid = this.selected().prop('robotid');
        const robotname = this.selected().prop('robotname');
        G.gGameGlobals = propList(sym('userID'), robotid, sym('robotname'), robotname, sym('friendslist'), new LList());
        JumpMovie('factory');
        this.pState = sym('jump');
        break;
      }
      case sym('logout'):
        go('logout');
        break;
    }
    go(the.frame);
  }

  logout() {
    this.pState = sym('logout');
  }

  StartGame() {
    if (num(G.gLobby.prop('selectedid')) > 0) this.pState = sym('login');
    else member('gcom_STATE').text = 'No robot selected! ';
  }

  DeleteRobot() {
    if (num(G.gLobby.prop('selectedid')) > 0) {
      if (sprite(32).locV < 0) {
        for (let i = 32; i <= 37; i++) {
          sprite(i).locV = sprite(i).locV + 390;
          this.pdeleteID = num(G.gLobby.prop('selectedid'));
          member('Deletename').text = member('robotname' + G.gLobby.prop('selectedid')).text;
          this.pState = sym('predelete');
        }
      } else {
        for (let i = 32; i <= 37; i++) {
          sprite(i).locV = sprite(i).locV - 390;
          this.pState = sym('done');
        }
      }
    } else member('gcom_STATE').text = 'No robot selected! ';
  }

  DoDeleteRobot() {
    if (this.pdeleteID > 0) {
      put(this.selected().prop('robotid'));
      put(G.gLobby.prop('session'));
      G.gCom.send('main.asp', propList('action', 'deleterobot', 'robotid', this.selected().prop('robotid'), 'sessionid', G.gLobby.prop('session'), 'uniqueCode', G.gUser.uniqueCode), sym('deletedone'), this, 0, propList(sym('loc'), point(554, 394)));
      this.pState = sym('wait');
    } else member('gcom_STATE').text = 'No robot selected! ';
  }

  CreateRobot() {
    const newName = formatOutgoingText(member('robotname_box').text);
    if (newName === EMPTY || contains(newName, '[') || contains(newName, ']')) {
      member('gcom_STATE').text = 'Invalid Robotname!';
    } else if (callGlobal('isBadLanguage', newName)) {
      member('gcom_STATE').text = 'Robotname already taken! ';
    } else {
      if (this.pState === sym('done')) {
        G.gCom.send('main.asp', propList('action', 'createrobot', 'robotname', newName, 'sessionid', G.gLobby.prop('session'), 'uniquecode', G.gUser.uniqueCode), sym('createdone'), this, 0, propList(sym('loc'), point(554, 394)));
      }
      for (let i = 24; i <= 29; i++) sprite(i).locV = sprite(i).locV - 390;
      member('robotname_box').text = EMPTY;
    }
  }

  createdone(L: LPropList) {
    switch (num(L.prop('err'))) {
      case -104:
        member('gcom_STATE').text = 'Robotname already taken! ';
        this.pState = sym('done');
        break;
      case -105:
        member('gcom_STATE').text = 'You already have 5 robots! ';
        break;
      default:
        go('listrobots');
        this.pState = sym('init');
    }
  }

  deletedone(L: LPropList) {
    switch (num(L.prop('err'))) {
      case -104:
        member('gcom_STATE').text = 'Robotname already taken! ';
        this.pState = sym('done');
        break;
      case -105:
        member('gcom_STATE').text = 'You already have 5 robots! ';
        break;
      default:
        {
          const dy = sprite(32).locV < 0 ? 390 : -390;
          for (let i = 32; i <= 37; i++) sprite(i).locV = sprite(i).locV + dy;
        }
        go('listrobots');
        this.pState = sym('init');
    }
  }

  done(L: LPropList) {
    switch (num(L.prop('err'))) {
      case 0: {
        const myList = L.prop('robotlist') as LList;
        G.myList = myList;
        while (myList.count > 5) myList.deleteAt(myList.count);
        // Each robot carries its row as #count (k.count reads the property).
        for (const k of L.prop('robotlist') as LList) {
          const kk = k as LPropList;
          member('robotname' + String(kk.prop('count'))).text = formatIncomingText(kk.prop('robotname') as LValue);
        }
        sendAllSprites('HideIfNew', (L.prop('robotlist') as LList).count > 0 ? 1 : 0);
        go(the.frame + 1);
        member('gcom_STATE').text = EMPTY;
        this.pState = sym('done');
        break;
      }
      case -1:
        member('gcom_STATE').text = 'Unable to login  ';
        this.pState = sym('done');
        break;
      case -2:
        this.pTryNum = this.pTryNum + 1;
        this.pState = this.pTryNum < 2 ? sym('send') : sym('done');
        break;
      case -3:
      case -100:
        this.pState = sym('done');
        break;
      case -103:
        member('gcom_STATE').text = 'Username/email already taken!' + String(L.prop('err'));
        this.pState = sym('done');
        break;
      default:
        member('gcom_STATE').text = 'Unable proceed ' + String(L.prop('err'));
        this.pState = sym('done');
    }
  }

  goset() {
    if (this.pState === sym('done')) go('settings');
  }
}

