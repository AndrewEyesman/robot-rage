// robotwars script 2 "room object" (gRoom, created by the lobby with
// new(script("room object"))): the lobby's rooms and the user list of the room
// you're in, drawn into member "rvtext" (name, TAB, ranking; you in green).

import { DColor, G, call, dot, member, sendAllSprites, sendSprite, sprite, the } from '../../director';
import {
  EMPTY, LList, LPropList, RETURN, TAB, char, chars, contains, integer, length, lineCount, lingoString, max, min, propList, starts, sym,
  symbol, value, voidp, type LPoint, type LValue, num,
} from '../../lingo';
import { FormatUserName, GetDistance, SearchAndReplace, formatInternalUserName, getUserIpCode } from './s004-new-init';
import { formatIncomingText, formatOutgoingText } from './s003-mac-pc';
import { callMovie, eq } from './util';

const EMPTY_PL = () => new LPropList();

export class RoomObject {
  pGame: LValue;
  pRoom: string;
  pCountry: string;
  pMaxRoom: number;
  pUserList!: LList;
  pMaxUsers: number;
  sp: number;
  dx: number;
  pImg: LValue;
  pSrcImg: LValue;
  pContentRect: LValue;
  pLastNameList: string;
  pInfo: LValue;
  pSelectedLine: number;
  pRoomList: LPropList;
  pSavedRoom: LValue;
  lastResult: LValue;
  pLastMouseUpLoc: LPoint;
  pMouseDownLoc: LPoint;
  pRefreshTime: number;
  pViewImg: LValue;
  pViewRect: LValue;
  pCol1: LValue;
  pCol2: LValue;
  pScrollTop: LValue;
  pBuildTime: number;
  pForceUpdate: number;

  constructor() {
    this.pGame = 0;
    this.pRoom = EMPTY;
    this.pCountry = 'SE';
    this.pMaxRoom = 18;
    this.pMaxUsers = 100;
    this.sp = 0;
    this.dx = 0;
    this.pLastNameList = '-';
    this.pSelectedLine = 0;
    this.pRoomList = new LPropList();
    this.clearUserList();
    this.sp = 0;
    this.pSavedRoom = 0;
    this.pLastMouseUpLoc = the.mouseLoc;
    this.pMouseDownLoc = the.mouseLoc;
    this.pRefreshTime = the.milliSeconds + 4000;
    this.pForceUpdate = 1;
    this.pBuildTime = 200;
  }

  UpdateUserScore(aName: LValue, aScore: LValue) {
    for (const q of this.pUserList) {
      if (eq(dot(q, 'name'), aName)) {
        (q as LPropList).setaProp(sym('score'), aScore);
        this.pRefreshTime = Math.min(this.pRefreshTime, the.milliSeconds + 3000);
        this.pForceUpdate = 1;
        break;
      }
    }
  }

  HandleRoom() {
    G.gMultiuserInstanceIRC.checkNetMessages(1);
    if (the.milliSeconds > this.pRefreshTime) {
      this.buildUserList();
      this.pRefreshTime = the.milliSeconds + this.pBuildTime * 10;
    }
  }

  saveCurrentRoom() {
    this.pSavedRoom = propList(sym('game'), this.pGame, sym('country'), this.pCountry, sym('room'), this.pRoom);
  }

  clearUserList() {
    this.pUserList = new LList();
  }

  RoomJoin(_roomname: LValue, user: string) {
    this.addUser(user);
    // `if (pBuildTime < 100) and 0`: never.
    this.pRefreshTime = Math.min(the.milliSeconds + 1000, this.pRefreshTime);
  }

  RoomLeave(roomname: string, user: string) {
    this.removeUser(user);
    this.pRefreshTime = Math.min(the.milliSeconds + 1000, this.pRefreshTime);
    sendAllSprites('userLeft', user);
    // the movie (its name) contains "lobby"
    if (contains(the.movieName, 'lobby')) {
      if (roomname !== EMPTY) {
        const r = char(roomname, roomname.length);
        let antal = integer(member('GroupCount_' + r).text) ?? 0;
        antal = antal - 1;
        if (antal < 0) antal = 0;
        if (member('GroupCount_' + r).text !== lingoString(antal)) member('GroupCount_' + r).text = lingoString(antal);
      }
    }
  }

  RoomUsers(_roomname: LValue, users: LValue) {
    const L = value(users) as LList;
    const ipcode = dot(G.gIRC, 'ipcode');
    const fname = formatInternalUserName(dot(G.gUserData, 'robotname'), ipcode);
    // The ipcode is on the name twice, so this never matches your own nick.
    const fuser = fname + lingoString(ipcode);
    for (const q of L) if (!eq(q, fuser)) this.addUser(q as string);
    sendSprite(0, 'receivedUserList', this.pUserList);
    this.pRefreshTime = Math.min(the.milliSeconds + 200, this.pRefreshTime);
  }

  doupdate() {
    this.buildUserList();
  }

  message(sender: LValue, _receiver: LValue, objreceiver: LValue, subject: LValue, message: LValue) {
    if (starts(message, '[')) message = value(message);
    else message = formatIncomingText(message);
    if (eq(objreceiver, 'G')) {
      sendSprite(0, 'Received', subject, message, sender);
      return;
    }
  }

  Welcome(_serverprefix: LValue, _message: LValue) {
    // `if 0`: joining the big room "#<prefix>00" is switched off.
  }

  addUser(user: string) {
    for (let i = 1; i <= this.pUserList.count; i++) if (eq(dot(this.pUserList.getAt(i), 'name'), user)) return;
    const tUsername = user;
    const tStatus = 3;
    for (let i = 1; i <= this.pUserList.count; i++) {
      if (eq(this.pUserList.getAt(i), EMPTY_PL())) {
        this.pUserList.setAt(i, propList(sym('id'), 0, sym('name'), tUsername, sym('displayName'), FormatUserName(tUsername), sym('status'), tStatus));
        return;
      }
    }
    this.pUserList.add(propList(sym('id'), 0, sym('name'), tUsername, sym('displayName'), FormatUserName(tUsername), sym('status'), tStatus));
  }

  removeUser(user: string) {
    const tUsername = user;
    // Deleting while counting up skips the entry after a deleted one, as in the original.
    for (let i = 1; i <= this.pUserList.count; i++) {
      if (!eq(this.pUserList.getAt(i), EMPTY_PL())) {
        if (eq(dot(this.pUserList.getAt(i), 'name'), tUsername)) this.pUserList.deleteAt(i);
      }
    }
  }

  GetNumUsers(sRoom: LValue) {
    const r = this.pRoomList.getaProp(sRoom);
    if (voidp(r)) return 0;
    return dot(r, 'people');
  }

  /** LIST replies ([room: count]) into pRoomList; "default<n>" rooms take main.ini's names. */
  ReceiveRoomList(L: LPropList) {
    if (voidp(L)) return;
    for (const tRoom of this.pRoomList) (tRoom as LPropList).setaProp(sym('people'), 0);
    for (let i = 1; i <= L.count; i++) {
      let tFullName = lingoString(L.getPropAt(i));
      if (starts(tFullName, '[')) tFullName = chars(tFullName, 2, length(tFullName) - 1);
      const tShortName = chars(tFullName, 6, 64);
      let tDisplayName: LValue;
      if (starts(tShortName, 'default')) {
        const list = dot(G.gShockplay, 'defaultRooms', 'list') as LList;
        let n = value(char(tShortName, 8));
        n = max(1, min(n, list.count));
        tDisplayName = list.getAt(n);
      } else {
        tDisplayName = SearchAndReplace(formatIncomingText(tShortName) as string, '_', ' ');
        if (eq(tFullName, lingoString(this.getPrefix()) + '00')) sendAllSprites('showonline', L.getAt(i));
      }
      const tPeople = L.getAt(i);
      const tRoomSymbol = symbol(formatIncomingText(tFullName));
      if (voidp(this.pRoomList.getaProp(tRoomSymbol))) {
        this.pRoomList.addProp(tRoomSymbol, propList(sym('fullName'), tFullName, sym('displayName'), tDisplayName, sym('people'), tPeople));
        continue;
      }
      (this.pRoomList.getaProp(tRoomSymbol) as LPropList).setaProp(sym('people'), tPeople);
    }
    sendSprite(0, 'refreshRoomList', this.pRoomList);
  }

  getPrefix() {
    return dot(G.gShockplay, 'info', 'ircprefix');
  }

  EnterGame(_game: LValue) {
    call('GetRoomList', G.gIRC, this.getPrefix(), 1);
    this.pRoomList = new LPropList();
    const list = dot(G.gShockplay, 'defaultRooms', 'list') as LList;
    for (let i = 1; i <= list.count; i++) {
      const tRoomName = list.getAt(i);
      const tFullName = lingoString(this.getPrefix()) + 'default' + i;
      const tRoomSymbol = symbol(formatIncomingText(tFullName));
      this.pRoomList.addProp(tRoomSymbol, propList(sym('fullName'), tFullName, sym('displayName'), tRoomName, sym('people'), 0));
    }
    // `if integerp(gShockplay.info[#online])` then `if 0`: nothing.
    sendSprite(0, 'hideRoomList');
  }

  EnterRoom(roomname: string) {
    this.pRoom = roomname;
    this.pLastNameList = '-';
    call('JoinRoom', G.gIRC, this.pRoom);
    this.pRefreshTime = -the.maxinteger;
  }

  LeaveRoom() {
    if (this.pRoom === EMPTY) return;
    call('LeaveRoom', G.gIRC, this.pRoom);
    this.clearUserList();
    this.pRoom = EMPTY;
    this.pSelectedLine = 0;
    this.pLastNameList = '-';
  }

  newRoom(roomname: string) {
    roomname = SearchAndReplace(formatOutgoingText(roomname) as string, ' ', '_');
    this.pRoom = lingoString(this.getPrefix()) + roomname;
    this.EnterRoom(this.pRoom);
  }

  enterTournamentRoom(tID: LValue) {
    this.pRoom = 't' + lingoString(tID);
    this.EnterRoom(this.pRoom);
  }

  /** The visible users (same ipcode as you, or 0000) into "rvtext" and the room's GroupCount. */
  buildUserList() {
    const tStart = the.milliSeconds;
    let NameList = EMPTY;
    let tUserLine = 0;
    const myCode = dot(G.gIRC, 'ipcode');
    for (let i = 1; i <= this.pUserList.count; i++) {
      const user = this.pUserList.getAt(i) as LPropList;
      if (eq(dot(user, 'displayName'), dot(G.gUserData, 'robotname'))) tUserLine = i;
      const tCode = getUserIpCode(lingoString(dot(user, 'name')));
      let tAddUser = 0;
      if (eq(myCode, '0000') || eq(tCode, 0) || eq(tCode, '0000')) tAddUser = 1;
      else if (eq(myCode, tCode)) tAddUser = 1;
      if (tAddUser) {
        if (i > 1) NameList = NameList + RETURN;
        if (eq(user, EMPTY_PL())) NameList = NameList + EMPTY;
        else if (eq(user.getaProp(sym('removed')), 1)) {
          NameList = NameList + EMPTY;
          this.pUserList.setAt(i, EMPTY_PL());
        } else {
          const name = lingoString(dot(user, 'name'));
          const namestring = FormatUserName(name) + TAB + lingoString(callMovie('getrankingfromindex2', char(name, 3)));
          NameList = NameList + namestring;
        }
        continue;
      }
    }
    if (this.pRoom.length > 2) {
      const room = lingoString(dot(G.gRoom, 'pRoom'));
      member('GroupCount_' + char(room, room.length)).text = lingoString(lineCount(NameList));
    }
    if (this.pLastNameList !== NameList || this.pForceUpdate) {
      const textm = member('rvtext');
      textm.fontStyle = ['bold'];
      textm.color = DColor.hex('0xCCCC66');
      textm.text = NameList;
      // textm.tabs = [[#type: #right, #position: 160]]: kept on the member for the renderer.
      textm.tabs = new LList([propList(sym('type'), sym('right'), sym('position'), 160)]);
      if (tUserLine > 0) setLineColor(textm, tUserLine, new DColor(0, 255, 0));
      // A loop over the users' #score that does nothing with it.
      this.pLastNameList = NameList;
    }
    this.pBuildTime = 100 + the.milliSeconds - tStart;
    this.pRefreshTime = the.milliSeconds + this.pBuildTime * 100;
    this.pForceUpdate = 0;
  }

  // mouseDown/mouseUp: the object is never a sprite (sp is 0, pContentRect VOID), so
  // in the original these would fail if they ever ran; translated as written.
  mouseDown() {
    this.pMouseDownLoc = the.mouseLoc;
    const r = sprite(this.sp).rect;
    const ptV = num(this.pMouseDownLoc.locV) - num(r.top);
    const n = integer((ptV - num(dot(this.pContentRect, 'top')) + num(this.pScrollTop)) / 16 + 1) ?? 0;
    if (n >= 1 && n <= this.pUserList.count) {
      if (!eq(this.pUserList.getAt(n), EMPTY_PL())) call('hiliteLine', this, n);
    }
  }

  mouseUp() {
    if (the.clickOn === this.sp) {
      const r = sprite(this.sp).rect;
      const ptV = num(this.pMouseDownLoc.locV) - num(r.top);
      const n = integer((ptV - num(dot(this.pContentRect, 'top')) + num(this.pScrollTop)) / 16 + 1) ?? 0;
      if (n > this.pUserList.count) return;
      if (the.doubleClick && num(GetDistance(the.mouseLoc, this.pLastMouseUpLoc)) < 4 && 0) {
        // `and 0`: never.
      } else {
        sendAllSprites('hideUserInfo');
        const u = this.pUserList.getAt(n);
        if (!eq(u, EMPTY_PL())) {
          if (!eq(dot(G.gUserData, 'name'), dot(u, 'name'))) call('sendMessage', G.gIRC, dot(u, 'name'), 'B', 'getinfo', new LPropList());
          else sendSprite(0, 'showMyInfo');
        }
      }
    }
    this.pLastMouseUpLoc = the.mouseLoc;
  }

  ClickChallenge() {
    this.pGame = sprite(60).getProp('pSelectedRoom') as LValue;
    call('SetUpMatch', G.gMatch);
    call('addPlayer', G.gMatch, dot(G.gUserData, 'name'), dot(G.gUserData, 'id'));
    call('MakeChallenge', this, call('getMatchInfo', G.gMatch));
  }
}

/** member.line[n].color = c */
function setLineColor(m: { text: string; styled?: { restyle(a: number, b: number, f: (r: { color: string }) => unknown): void }; touch?: () => void }, n: number, c: DColor) {
  if (!m.styled) return;
  let start = 0;
  for (let i = 1; i < n; i++) {
    const k = m.text.indexOf(RETURN, start);
    if (k < 0) return;
    start = k + 1;
  }
  let end = m.text.indexOf(RETURN, start);
  if (end < 0) end = m.text.length;
  m.styled.restyle(start, end, (r) => ({ ...r, color: `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('')}` }));
  m.touch?.();
}
