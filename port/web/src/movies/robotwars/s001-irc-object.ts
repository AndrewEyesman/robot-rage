// robotwars parent script 1 "IRC_OBJECT" (gIRC, created by the lobby): the lobby's
// IRC client over the Multiuser Xtra in #text mode. Registers as
// `_R<rank><name><ipcode>`, parses the server's numerics into the room object
// (gRoom), and carries the players' private messages (SMUS_*, Challenge, P2P...).

import { G, MultiuserXtra, call, dot, externalParamValue, put, sendAllSprites, sendSprite, the } from '../../director';
import {
  EMPTY, LList, LPropList, QUOTE, RETURN, SPACE, char, chars, concat, concatSpace, contains, deleteChunk, integer, item,
  itemCount, itemDelimiter, length, line, lineCount, lingoString, numToChar, offset, propList, putBefore, putAfter, random, setItemDelimiter,
  stringp, sym, value, voidp, word, wordCount, type LValue,
} from '../../lingo';
import { JumpMovie } from './s007-jump-movie';
import { AddDebugLog, FormatUserName, Num2Hex, SearchAndReplace, makeCheckSum } from './s004-new-init';
import { isBehindRouter } from './s005-changes';
import { callMovie, eq } from './util';

export class IRC_OBJECT {
  pIRCUserName: LValue;
  pIRCUserID: LValue;
  pIRCUserPassword: LValue;
  pPrefix: LValue;
  pIRCip: LValue;
  pIRCport: LValue;
  pRoomList: LPropList;
  pOutGoingList: LList;
  pLastSendTime: number;
  pLog: string;
  pIsLost: number;
  pTestMode: number;
  pGetRoomListTime: number;
  pStat: LPropList;
  users: LValue;
  pDoUpdate: LValue;
  pLastLine: string;
  anyprefix: string;
  Prefix: string;
  checkWO: LPropList;
  checkConnection: LPropList;
  Userip: string;
  ipcode: string;
  pfoundIP: LValue;

  constructor() {
    this.pOutGoingList = new LList();
    this.pLastSendTime = the.milliSeconds;
    this.pLog = EMPTY;
    this.pIsLost = 0;
    // pServerResponse = EMPTY: a local, unused.
    this.pGetRoomListTime = -the.maxinteger;
    this.pTestMode = 0;
    this.pLastLine = EMPTY;
    this.anyprefix = '#+';
    this.checkWO = propList(sym('time'), 0, sym('state'), 0);
    this.checkConnection = propList(sym('time'), 0, sym('state'), 0);
    this.pStat = propList(sym('Received'), 0, sym('sent'), 0, sym('startTime'), the.milliSeconds);
    this.Prefix = '#';
    this.Userip = EMPTY;
    this.ipcode = EMPTY;
    this.pRoomList = new LPropList();
  }

  addLog(txt: string) {
    if (lineCount(this.pLog) >= 55) this.pLog = line(this.pLog, 5, lineCount(this.pLog));
    this.pLog = this.pLog + txt + RETURN + RETURN;
  }

  checkUserOnline(tName: string) {
    const status = dot(G.gMatch, 'status');
    if ((status === sym('started') || status === sym('notStarted')) && eq(this.checkWO.prop('state'), 0)) {
      this.checkWO.prop('state', sym('sent'));
      this.checkWO.prop('time', the.milliSeconds);
      this.checkConnection.prop('state', sym('sent'));
      this.checkConnection.prop('time', the.milliSeconds);
      this.sendMessage(tName, 'i', 'areyouawake', new LPropList());
      this.sendIRCmessage('LUSERS');
    }
  }

  handleIRC() {
    if (!eq(this.checkWO.prop('state'), 0)) {
      if (the.milliSeconds > (this.checkWO.prop('time') as number) + 14000) {
        const status = dot(G.gMatch, 'status');
        if (status === sym('started') || status === sym('notStarted')) {
          if (this.checkConnection.prop('state') === sym('sent')) {
            this.checkConnection.prop('state', 0);
          } else {
            // No script creates gText, so this is a script error in the original and the
            // handler stops here (checkWO stays set).
            if (voidp(G.gText)) return;
            call('associate', G.gText, 'opponent', FormatUserName(dot(dot(G.gP2P, 'pOpponent'), 'name')));
            this.checkWO.prop('state', 0);
          }
        }
      }
    }
  }

  losebywo() {
    this.checkWO.prop('state', 0);
    call('losebywo', G.gMatch);
    call('closeMui', G.gP2P);
    JumpMovie('main', 'menu');
  }

  winbywo() {
    this.checkWO.prop('state', 0);
    call('winbywo', G.gMatch);
    call('closeMui', G.gP2P);
    JumpMovie('main', 'menu');
  }

  addToOutList(txt: string, t0: number) {
    this.pOutGoingList.add(propList(sym('timeStamp'), t0, sym('content'), txt));
  }

  checkOutgoingList() {
    if (this.pOutGoingList.count > 0) {
      const first = this.pOutGoingList.getAt(1) as LPropList;
      if (the.milliSeconds > (first.prop('timeStamp') as number)) {
        this.sendIRCmessage(first.prop('content') as string);
        this.pLastSendTime = the.milliSeconds;
        this.pOutGoingList.deleteAt(1);
      }
    }
  }

  logoutbutton() {
    JumpMovie('main', 'exit');
  }

  /** The Xtra's message handler: connection, then IRC text in chunks (a line may span two). */
  defaultMessageHandler(message: LPropList) {
    this.addLog(concatSpace('receive:', message));
    this.pStat.prop('Received', (this.pStat.prop('Received') as number) + 1);
    const errorCode = message.prop('errorCode');
    if (!eq(errorCode, 0)) {
      this.addLog(concatSpace(concatSpace('*** error in message handler:', errorCode), G.gMultiuserInstanceIRC?.getNetErrorString(errorCode)));
      if (eq(errorCode, -2147216214)) sendAllSprites('IRCfailed');
      return;
    }
    if (this.pLastLine !== EMPTY) {
      message.prop('content', this.pLastLine + lingoString(message.prop('content')));
      this.pLastLine = EMPTY;
    }
    const content = () => message.prop('content');
    if (eq(message.prop('subject'), 'ConnectToNetServer')) {
      this.addLog('Connected Wait... Sending PASS, NICK, USER');
      this.sendIRCmessage('PASS ');
      this.sendIRCmessage(concatSpace('NICK', this.pIRCUserID));
      this.sendIRCmessage(concatSpace('USER Shockplay 0 *', this.pIRCUserName));
      sendAllSprites('IRCconnected');
    } else if (char(lingoString(content()), 1) === ':') {
      this.pIsLost = 0;
      if (!stringp(content())) return;
      const c = content() as string;
      for (let mi = 1; mi <= lineCount(c) - 1; mi++) this.IRCParcer(line(c, mi));
      this.pLastLine = line(c, lineCount(c));
      if (this.pLastLine !== numToChar(10)) {
        this.pLastLine = SearchAndReplace(this.pLastLine, numToChar(10), EMPTY);
        this.addLog(concatSpace('lastline=', this.pLastLine));
      } else {
        this.pLastLine = EMPTY;
      }
    } else if (eq(word(lingoString(content()), 1), 'PING')) {
      AddDebugLog('pong');
      this.addLog('PING? PONG!' + word(lingoString(content()), 2));
      this.sendIRCmessage('PONG ' + word(lingoString(content()), 2));
      this.pLastSendTime = the.milliSeconds;
    } else if (eq(word(lingoString(content()), 1), 'ERROR')) {
      this.addLog(concatSpace('ERROR', content()));
    }
  }

  makeAserverConnection(ip: LValue, port: LValue) {
    G.gMultiuserInstanceIRC = new MultiuserXtra();
    let errCode = G.gMultiuserInstanceIRC.setNetMessageHandler(sym('defaultMessageHandler'), this, EMPTY, EMPTY, 1);
    if (errCode !== 0) put('alert: Problem with setNetMessageHandler');
    errCode = G.gMultiuserInstanceIRC.connectToNetServer(lingoString(ip), value(port), propList(sym('userID'), 'Bb', sym('password'), 'MySecret', sym('movieID'), 'Tech Chat'), sym('text'));
    if (errCode !== 0) {
      this.addLog('Problem with connectToNetServer @ ' + lingoString(ip) + ' on port: ' + lingoString(port));
      put(G.gMultiuserInstanceIRC.getNetErrorString(errCode));
    } else {
      this.addLog('Connecting to Server @ ' + lingoString(ip) + ' on port: ' + lingoString(port));
    }
  }

  closeConnection() {
    // Director closes the connection when its last reference goes; JavaScript needs telling.
    G.gMultiuserInstanceIRC?.dispose?.();
    G.gMultiuserInstanceIRC = undefined;
  }

  IRC(_numresponce: LValue, _shor: LValue) {
    // Returns at once; the lookup in member "IRC_NUM_RESPONSES" after it never runs.
    return EMPTY;
  }

  /** One IRC line (only in the lobby). */
  IRCParcer(cline: string) {
    if (G.gGamePlace !== sym('lobby')) return;
    cline = SearchAndReplace(cline, numToChar(10), EMPTY);
    // A local in the original, so the MOTD it collects is lost between lines.
    let servermessage: LValue;
    // repeat while ":@#+" contains cline.word[p].char[1]: delete it, until the word is empty.
    const strip = (p: number) => {
      while (contains(':@#+', char(word(cline, p), 1))) {
        cline = deleteChunk(cline, ['word', p], ['char', 1]);
        if (word(cline, p) === EMPTY) break;
      }
    };
    const nick = () => lingoString(chars(word(cline, 1), 2, offset('!', cline) - 1));
    if (char(cline, 1) === ':') {
      const cmd = lingoString(word(cline, 2));
      if (eq(cmd, 'PRIVMSG')) {
        const receiver = word(cline, 3);
        let objreceiver = word(cline, 4);
        const subject = word(cline, 5);
        let message: LValue = word(cline, 6, wordCount(cline));
        objreceiver = deleteChunk(objreceiver, ['char', 1]);
        const sender = nick();
        if (char(receiver, 1) === '#') {
          call('message', G.gRoom, sender, receiver, objreceiver, subject, message);
        } else {
          const is = (s: string) => eq(objreceiver, s);
          if (is('SMUS_SendIP')) {
            sendSprite(0, 'SendIp', sender, message);
            this.sendMessage(sender, 'SMUS_GetIP', 0, lingoString(dot(G.gUserData, 'Userip')) + '_' + Num2Hex(dot(G.gUserData, 'robotid')));
          } else if (is('SMUS_GetIP')) sendSprite(0, 'GetIp', sender, message);
          else if (is('SMUS_ReverseP2P')) sendSprite(0, 'ReverseConnection', sender);
          else if (is('SMUS_DeclineChallenge')) sendSprite(0, 'ChallengeDecline', sender);
          else if (is('SMUS_AcceptChallenge')) sendSprite(0, 'AcceptChallenge', sender);
          else if (is('SMUS_AddChallenge_Busy')) sendSprite(0, 'Challenge_Busy', sender);
          else if (is('SMUS_ConnectToMe')) sendSprite(0, 'ConnectToMe', sender);
          else if (is('SMUS_AbortP2P')) sendSprite(0, 'abortChallenge', sender);
          else if (is('Challenge')) {
            if (the.frame !== 15) {
              put("I'm busy... *******************");
              this.sendMessage(sender, 'SMUS_AddChallenge_Busy');
            } else {
              const L = value(message);
              (G.ChallengeList as LList).add(
                propList(sym('ircrobotname'), sender, sym('start'), the.milliSeconds, sym('server'), dot(L, 'server'), sym('ip'), dot(L, 'ip'), sym('robotid'), dot(L, 'id'), sym('rank'), L instanceof LPropList ? L.getaProp(sym('rank')) : undefined),
              );
            }
          } else if (is('G')) {
            const mess = value(message);
            if (!voidp(mess)) message = mess;
            return;
          } else if (is('B')) {
            // An empty branch in the original: "B" (getinfo) messages are ignored.
          } else if (is('P')) {
            call('receiveIRCMessage', G.gP2P, sender, receiver, subject, value(message));
          } else if (is('T')) {
            call('receiveMessage', G.gTournament, sender, receiver, subject, message);
          } else if (is('i')) {
            if (eq(subject, 'areyouawake')) {
              if (eq(dot(G.gMatch, 'opponentName'), sender) && (dot(G.gMatch, 'playerList')?.count ?? 0) > 0) this.sendMessage(sender, 'i', 'yesimawake', new LPropList());
            } else if (eq(subject, 'yesimawake')) {
              this.checkWO.prop('state', 0);
            }
          } else if (is('auth')) {
            const z = createChecksum(value(subject) as number);
            put(concatSpace(concatSpace(concatSpace('PRIVMSG', 'authserv'), ':'), z));
            const txt = concatSpace(concatSpace(concatSpace('PRIVMSG', 'authserv'), ':'), z);
            this.sendIRCmessage(txt);
          }
        }
      } else if (eq(cmd, '001')) {
        let m = word(cline, 1);
        m = deleteChunk(m, ['char', 1]);
        this.pPrefix = lingoString(m);
        const tDelimiter = itemDelimiter();
        setItemDelimiter('@');
        this.Userip = item(cline, itemCount(cline));
        put('userip: ' + this.Userip);
        setItemDelimiter(tDelimiter);
      } else if (eq(cmd, '265')) {
        G.gOnline = integer(word(cline, 7));
        put(concatSpace(concatSpace(concatSpace('online', G.gOnline), ' max:'), integer(word(cline, 9))));
        this.checkConnection.prop('state', sym('online'));
      } else if (eq(cmd, '303')) {
        const users = new LList();
        this.users = users;
        for (let p = 3; p <= wordCount(cline); p++) {
          strip(p);
          if (word(cline, p) !== EMPTY) users.add(lingoString(word(cline, p)));
        }
        sendAllSprites('OnlineList', users);
      } else if (eq(cmd, '322')) {
        const tRoom = chars(word(cline, 4), 2, 64);
        this.pRoomList.setaProp(tRoom, integer(word(cline, 5)));
      } else if (eq(cmd, '323')) {
        call('ReceiveRoomList', G.gRoom, this.pRoomList);
        sendAllSprites('UpdateUserCount');
      } else if (eq(cmd, '353')) {
        const users = new LList();
        this.users = users;
        for (let p = 6; p <= wordCount(cline); p++) {
          strip(p);
          users.add(lingoString(word(cline, p)));
        }
        call('RoomUsers', G.gRoom, word(cline, 5), users);
      } else if (eq(cmd, '366')) {
        call('doupdate', G.gRoom);
        sendSprite(0, 'ReceiveCompletedUserList');
      } else if (eq(cmd, '372')) {
        let mess = word(cline, 4, wordCount(cline));
        mess = deleteChunk(mess, ['char', 1]);
        servermessage = concat(servermessage, mess);
      } else if (eq(cmd, '375')) {
        servermessage = EMPTY;
      } else if (eq(cmd, '376')) {
        sendSprite(0, 'Welcome');
        sendAllSprites('IRCwelcome');
        call('Welcome', G.gRoom, this.pPrefix, servermessage);
      } else if (eq(cmd, '433')) {
        put('irc name already in use');
        const mess = word(cline, 4, wordCount(cline));
        servermessage = concat(servermessage, mess);
      } else if (['600', '601', '602', '603', '604', '605', '606'].some((n) => eq(cmd, n))) {
        // Only "606" has the body; 600-605 are empty branches. `users` is whatever list the
        // last 303/353 left (a script error while it is still VOID).
        if (eq(cmd, '606')) {
          for (let p = 4; p <= wordCount(cline); p++) {
            strip(p);
            (this.users as LList).add(lingoString(word(cline, p)));
          }
        }
      } else if (eq(cmd, 'JOIN')) {
        let roomname = word(cline, 3);
        roomname = deleteChunk(roomname, ['char', 1]);
        call('RoomJoin', G.gRoom, roomname, nick());
      } else if (eq(cmd, 'PART')) {
        let roomname = word(cline, 3);
        roomname = deleteChunk(roomname, ['char', 1]);
        call('RoomLeave', G.gRoom, roomname, nick());
      } else if (eq(cmd, 'QUIT')) {
        call('RoomLeave', G.gRoom, EMPTY, nick());
      }
      // 002, 004, 005, 321, 401, 607, MODE: nothing.
    } else {
      if (eq(word(cline, 1), 'PING')) {
        this.addLog('PING? PONG!' + word(cline, 2));
        this.sendIRCmessage('PONG ' + word(cline, 2));
        this.pLastSendTime = the.milliSeconds;
        put(concatSpace(the.longTime, 'send pong!!!'));
      }
    }
  }

  logoutnow() {
    if (voidp(dot(G.gP2P, 'pMUI'))) JumpMovie('main', 'exit');
  }

  logoutyes() {
    AddDebugLog('IRC caused trouble, logged out.');
    JumpMovie('main', 'exit');
  }

  createChecksum(n: number) {
    return createChecksum(n);
  }

  sendIRCmessage(message: string) {
    this.addLog(concatSpace('send IRC:', message));
    if (voidp(G.gMultiuserInstanceIRC)) return;
    const errCode = G.gMultiuserInstanceIRC.sendNetMessage('system', 'IRC', message + numToChar(10) + numToChar(13));
    this.pStat.prop('sent', (this.pStat.prop('sent') as number) + 1);
    if (errCode !== 0) {
      this.addLog(concatSpace('Error in IRC', errCode));
      AddDebugLog(concatSpace('Error in IRC', errCode));
      this.pIsLost = this.pIsLost + 1;
    } else {
      this.pIsLost = 0;
    }
  }

  Trim(message: string) {
    let fix = 1;
    let pFront = 0;
    let pBack = 0;
    while (fix) {
      if (char(message, message.length) === SPACE) message = deleteChunk(message, ['char', message.length]);
      else pFront = 1;
      if (char(message, 1) === SPACE) message = deleteChunk(message, ['char', 1]);
      else pBack = 1;
      if (pBack && pFront) fix = 0;
    }
    return message;
  }

  clearChars(tchars: string, message: string) {
    let s = EMPTY;
    for (let i = 1; i <= message.length; i++) {
      if (contains(tchars, char(message, i))) continue;
      s = s + char(message, i);
    }
    return s;
  }

  BuildWatchlist(tchars: string, useridList: string) {
    useridList = this.clearChars('[,]' + QUOTE, useridList);
    useridList = putBefore(useridList, tchars);
    // The length is read once, and each insert shifts the rest, as in the original.
    const n = useridList.length;
    for (let i = 1; i <= n; i++) if (char(useridList, i) === SPACE) useridList = putAfter(useridList, tchars, ['char', i]);
    return useridList;
  }

  ConnectIRC(serverip: LValue, port: LValue, tUsername: string, password: LValue, _tID?: LValue) {
    let ExternalIP: LValue = '193.150.228.134';
    if (eq(the.runMode, 'plugin')) ExternalIP = externalParamValue('sw1');
    if (isBehindRouter()) {
      this.ipcode = makeCheckSum(lingoString(ExternalIP));
      put('This computer is behind router');
      put(concatSpace('with external ip:', ExternalIP));
      put(concatSpace('ipcode:', this.ipcode));
    } else if (G.gBehindFW) {
      this.ipcode = Num2Hex(random(65536), 4);
      put('is not behind router but FW');
    } else {
      this.ipcode = '0000';
      put('is not behind router');
    }
    sendSprite(1, 'usedoktor');
    (G.gUserData as LPropList).setaProp(sym('FWuserip'), this.ipcode);
    sendSprite(1, 'makedoktor');
    put('***');
    this.pIRCUserName = tUsername;
    tUsername = '_R' + lingoString(callMovie('getrankingindex', dot(G.gUserData, 'score'))) + chars(tUsername, 3, tUsername.length);
    this.pIRCUserID = tUsername + this.ipcode;
    this.pIRCUserPassword = password;
    this.pIRCip = serverip;
    this.pIRCport = port;
    this.addLog(concatSpace(concatSpace(concatSpace('Connect to IRC', lingoString(this.pIRCip) + ':'), this.pIRCport), this.pIRCUserID));
    put(concatSpace(concatSpace(concatSpace('Connect to IRC', lingoString(this.pIRCip) + ':'), this.pIRCport), this.pIRCUserID));
    this.makeAserverConnection(this.pIRCip, this.pIRCport);
  }

  GetServerInfo() {
    this.sendIRCmessage('LUSERS');
    this.pLastSendTime = the.milliSeconds;
  }

  /** PRIVMSG <receiver> :<rID> <subject> <message>, at most one every ircwait ms. */
  sendMessage(receiver: LValue, rID: LValue, subject?: LValue, message?: LValue) {
    const txt = concatSpace(concatSpace(concatSpace('PRIVMSG', receiver), ':' + lingoString(rID)), subject) + ' ' + lingoString(message);
    const ircwait = Number(dot(G.gShockplay, 'server', 'ircwait') ?? 0);
    if (the.milliSeconds >= this.pLastSendTime + ircwait && this.pOutGoingList.count === 0) {
      this.sendIRCmessage(txt);
      this.pLastSendTime = the.milliSeconds;
    } else if (this.pOutGoingList.count === 0) {
      this.addToOutList(txt, this.pLastSendTime + ircwait);
    } else {
      this.addToOutList(txt, ((this.pOutGoingList.getAt(this.pOutGoingList.count) as LPropList).prop('timeStamp') as number) + ircwait);
    }
  }

  IsOnlineList(useridList: LValue) {
    let s = lingoString(useridList);
    s = this.clearChars('[,]' + QUOTE, s);
    this.sendIRCmessage(concatSpace('ISON', s));
    this.pLastSendTime = the.milliSeconds;
  }

  IrcPing() {
    this.sendIRCmessage(concatSpace('PING', this.pIRCip));
    this.pLastSendTime = the.milliSeconds;
  }

  BuddyList(tcommand: string, useridList: LValue) {
    const s = lingoString(useridList);
    let CommandList: LValue;
    if (eq(tcommand, '+')) CommandList = this.BuildWatchlist('+', s);
    else if (eq(tcommand, '-')) CommandList = this.BuildWatchlist('-', s);
    else if (eq(tcommand, 'P')) CommandList = 'l';
    else if (eq(tcommand, 'L')) CommandList = 'L';
    else if (eq(tcommand, 'C')) CommandList = 'c';
    else if (eq(tcommand, 'S')) CommandList = 's';
    this.sendIRCmessage(concatSpace('WATCH', CommandList));
    this.pLastSendTime = the.milliSeconds;
  }

  setMode(name: LValue, s: LValue) {
    this.sendIRCmessage(concatSpace(concatSpace('MODE', name), s));
  }

  JoinRoom(room: LValue) {
    let r = lingoString(room);
    if (char(r, 1) !== '#') r = '#' + r;
    r = this.clearChars('[,] ' + QUOTE, r);
    this.sendIRCmessage(concatSpace('JOIN', r));
    this.pLastSendTime = the.milliSeconds;
  }

  LeaveRoom(room: LValue) {
    let r = lingoString(room);
    if (char(r, 1) !== '#') r = '#' + r;
    r = this.clearChars('[,] ' + QUOTE, r);
    this.sendIRCmessage(concatSpace('PART', r));
    this.pLastSendTime = the.milliSeconds;
  }

  GetRoomList(room: LValue, Astr?: LValue, _forceGet?: LValue) {
    this.pRoomList = new LPropList();
    this.pGetRoomListTime = the.milliSeconds;
    let r = lingoString(room);
    if (!contains(this.anyprefix, char(r, 1))) r = this.Prefix + r;
    r = this.clearChars('[,] ' + QUOTE, r);
    if (eq(Astr, 1)) r = r + '*';
    this.sendIRCmessage(concatSpace('LIST', r));
    this.pLastSendTime = the.milliSeconds;
  }

  GetRoomUsers(room: LValue) {
    let r = lingoString(room);
    if (!contains(this.anyprefix, char(r, 1))) r = this.Prefix + r;
    r = this.clearChars('[,] ' + QUOTE, r);
    this.sendIRCmessage(concatSpace('NAMES', r));
    this.pLastSendTime = the.milliSeconds;
  }
}

/** The answer to the server's "auth" challenge. */
export function createChecksum(n: number) {
  const a = n % 207455;
  return (13 * (n % 27) * (n % 123) + 253 * a + 53231) % 97243;
}

