// login013_ parent script "ASP communication object" (gCom): posts requests to the
// server's main.asp and hands each reply, parsed with value(), to the object that
// asked (or to the frame script).

import { G, call, callGlobal, getNetText, handler, netDone, netError, netTextResult, postNetText, sendAllSprites, sendSprite, the } from '../../director';
import {
  EMPTY, LList, LPropList, bitAnd, bitXor, charToNum, concat, concatSpace, ilk, integerp, line, lineCount, lingoEquals, lingoString,
  objectp, propList, random, randomSeed, setRandomSeed, starts, stringp, sym, value, voidp, type LValue,
} from '../../lingo';
import { CreateIndicator, RemoveIndicator, SearchAndReplace } from './s032-movie-behavior';
import { formatIncomingText, formatOutgoingText } from './s029-mac-pc';

export function getStringSum2(s: string): number {
  let n = 0;
  let w = 76;
  for (let i = 1; i <= s.length; i++) {
    n = n + bitXor(bitAnd(charToNum(s[i - 1]), 127), w);
    n = n % 1234;
    w = w + ((268 * n) % 842);
  }
  return n;
}

export class AspCommunicationObject {
  pURL: string;
  pNetList: LList;
  pLastSendTime: number;
  pLog: string;
  lpnr: number;

  constructor(pupurl: string) {
    this.pURL = pupurl;
    this.pNetList = new LList();
    this.pLog = EMPTY;
    this.pLastSendTime = the.milliSeconds;
    this.lpnr = 0;
  }

  addLog(txt: string) {
    if (lineCount(this.pLog) >= 15) this.pLog = line(this.pLog, 5, lineCount(this.pLog));
    this.pLog = this.pLog + concatSpace(the.longTime, txt) + '\r';
  }

  cleanUpQueue() {
    const tGlobals = [G.gBuddy, G.gP2P, G.gIRC, G.gRoom, G.gMatch, G.gTournament, G.gPlayerInfo, G.gGame, G.gMessageWindow];
    for (let i = this.pNetList.count; i >= 1; i--) {
      const q = this.pNetList.getAt(i) as LPropList;
      const tFound = tGlobals.some((g) => q.prop('receiver') === g);
      if (!tFound) {
        if (integerp(q.prop('indicatorID'))) RemoveIndicator(q.prop('indicatorID') as number);
        this.pNetList.deleteAt(i);
      }
    }
    G.gAllowSpec = undefined;
    G.gAllowChat = undefined;
  }

  clearEvents(_o?: unknown) {
    // `if q = q` is always true: every request is dropped.
    for (let i = this.pNetList.count; i >= 1; i--) {
      const q = this.pNetList.getAt(i) as LPropList;
      if (integerp(q.prop('indicatorID'))) RemoveIndicator(q.prop('indicatorID') as number);
      this.pNetList.deleteAt(i);
    }
  }

  DoMemberPing() {
    if (the.milliSeconds > this.pLastSendTime + 10 * 60 * 1000) {
      if (G.gUser.vip) {
        this.send('main.asp', propList(sym('action'), 'PingPayMember', sym('paycode'), G.gUser.paycode, sym('uniqueCode'), G.gUser.uniqueCode), sym('receivedping'), this);
      }
    }
  }

  receivedping(_L: LValue) {}

  createChecksum(ln: number, L: LList | LPropList): number {
    let z = 0;
    for (const q of L) {
      switch (ilk(q)) {
        case sym('string'):
          z = z + getStringSum2(q as string);
          break;
        case sym('list'):
        case sym('propList'):
        case sym('integer'):
          z = z + getStringSum2(lingoString(q));
          break;
      }
    }
    const Keys = [14502, 80291, 81957, 3018, 19602, 22567, 60334, 9836, 96077, 48210, 99364, 44632, 98700, 12261, 67941, 47497, 38707, 42930, 98165, 62392, 43318, 84772, 55322, 90944, 66027, 44812, 59627, 33797, 27103, 28650, 63030, 71351, 67817, 68749, 47983, 60536, 54691];
    const n = (ln % Keys.length) + 1;
    return bitXor(Keys[n - 1], z);
  }

  /** send(script, [prop: value...], #callback, receiver, param, [#loc: point] for a loading indicator, secure) */
  send(scriptName: string, infoList: LPropList, callBackEvent?: LValue, tObject?: unknown, tParam?: LValue, indicator?: LValue, _secure?: LValue): number {
    if (scriptName === 'main.asp') this.pLastSendTime = the.milliSeconds;
    infoList.setaProp('uniquetick', the.milliSeconds);
    if (callBackEvent !== sym('receiveRocketman')) {
      for (let i = 1; i <= infoList.count; i++) {
        const v = infoList.getAt(i);
        if (stringp(v)) infoList.setAt(i, formatOutgoingText(v));
      }
      this.addLog(concatSpace(concatSpace('SEND:', scriptName), infoList));
    }
    const trs = randomSeed();
    setRandomSeed(the.milliSeconds);
    infoList.addProp(sym('UC'), random(100000));
    setRandomSeed(trs);
    const tNetID = postNetText(this.pURL + scriptName, infoList);
    let iid: LValue;
    if (indicator instanceof LPropList) iid = CreateIndicator(indicator.prop('loc') as never, indicator.prop('parent') as never);
    this.pNetList.add(
      propList(sym('id'), tNetID, sym('event'), callBackEvent, sym('receiver'), tObject as LValue, sym('param1'), tParam, sym('sendTime'), the.milliSeconds,
        sym('indicatorID'), iid, sym('type'), sym('propList'), sym('UC'), infoList.prop('UC')),
    );
    return tNetID;
  }

  GetFile(tUrl: string, callBackEvent?: LValue, tObject?: unknown, tParam?: LValue, indicator?: LValue): number {
    if (!starts(tUrl, 'http')) tUrl = this.pURL + '../DswMedia/' + tUrl;
    const tNetID = getNetText(tUrl);
    let iid: LValue;
    if (indicator instanceof LPropList) iid = CreateIndicator(indicator.prop('loc') as never, indicator.prop('parent') as never);
    this.pNetList.add(
      propList(sym('id'), tNetID, sym('event'), callBackEvent, sym('receiver'), tObject as LValue, sym('param1'), tParam, sym('sendTime'), the.milliSeconds,
        sym('indicatorID'), iid, sym('type'), sym('text')),
    );
    return tNetID;
  }

  answer(q: LPropList, data: LValue) {
    const receiver = q.prop('receiver');
    const event = q.prop('event') as LValue;
    if (objectp(receiver)) {
      if (handler(receiver, event as never)) call(event as never, receiver, data, q.prop('param1'));
    } else {
      sendSprite(0, event as never, data, q.prop('param1'));
    }
  }

  checkNetMessages() {
    for (let i = this.pNetList.count; i >= 1; i--) {
      const q = this.pNetList.getAt(i) as LPropList;
      const id = q.prop('id') as number;
      if (netDone(id)) {
        const err = netError(id);
        let txt = netTextResult(id);
        if (integerp(q.prop('indicatorID'))) RemoveIndicator(q.prop('indicatorID') as number);
        if (err === 'OK') {
          if (q.prop('type') === sym('text')) {
            this.addLog(concatSpace('Receive text file', line(txt, 1)) + '...');
            this.answer(q, txt);
          } else if (q.prop('type') === sym('propList')) {
            this.addLog(concatSpace(`RECEIVE [${id}] :`, txt));
            txt = SearchAndReplace(txt, '<void>', '0');
            const L = value(txt);
            if (voidp(L)) {
              this.addLog(concatSpace('Received unexpected message:', txt));
              this.answer(q, propList(sym('err'), 98));
            } else {
              const list = L as LPropList;
              for (let j = 1; j <= list.count; j++) {
                const v = list.getAt(j);
                if (stringp(v)) list.setAt(j, formatIncomingText(v));
              }
              if (lingoEquals(list.getaProp(sym('err')), 18)) {
                callGlobal('AddDebugLog', 'logged out (err 18)');
                sendAllSprites('logoutnow');
              }
              if (lingoEquals(list.getaProp(sym('err')), 181)) callGlobal('AddDebugLog', 'wrong checksum');
              this.answer(q, list);
            }
          }
        } else {
          this.addLog(concat(concat('Could not connect to server. (', err), ')'));
          this.answer(q, propList(sym('err'), err));
        }
        if (i <= this.pNetList.count) this.pNetList.deleteAt(i);
        continue;
      }
      if (the.milliSeconds > (q.prop('sendTime') as number) + 30000) {
        this.addLog(concatSpace('timed out', q.prop('event')));
        if (i <= this.pNetList.count) this.pNetList.deleteAt(i);
      }
    }
  }
}
