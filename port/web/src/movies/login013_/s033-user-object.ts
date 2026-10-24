// login013_ parent script "user object" (gUser): the player's session details and
// locally saved statistics (kept encrypted in a preference with a checksum).

import { G, callGlobal, getPref, setPref, put, the, timeout } from '../../director';
import { EMPTY, LList, LPropList, concat, max, num, propList, stringp, sym, voidp, type LSymbol, type LValue } from '../../lingo';
import { formatIncomingText, formatOutgoingText } from './s029-mac-pc';
import { correctChecksum, getStringSum, updateChecksum } from './s030-net-lingo';

export class UserObject {
  status: LSymbol | undefined;
  vip: number | undefined;
  ip: string | undefined;
  paycode: LValue;
  uniqueCode: LValue;
  irc_ip: string | undefined;
  info!: LPropList;
  logintype: string | undefined;
  prefsfile: string | undefined;
  loginTime: number | undefined;
  nexttime: number | undefined;
  opponentScore: number | undefined;
  timeleft = 0;
  password: string | undefined;
  memberName: string | undefined;

  constructor() {
    this.initIdle(10);
    this.irc_ip = EMPTY;
    this.status = sym('idle');
    this.vip = 0;
    this.prefsfile = 'cn' + '_RW' + '1';
    this.clearInfo();
    this.ip = EMPTY;
    this.nexttime = 0;
    this.opponentScore = 0;
    this.timeleft = 0;
    this.logintype = 'manual';
    this.password = EMPTY;
    this.memberName = EMPTY;
  }

  clearInfo() {
    put('clear score');
    const s = sym;
    this.info = propList(s('uniqueCode'), 0, s('lpnr'), 0, s('won'), 0, s('played'), 0, s('lost'), 0, s('wo'), 0, s('unfinished'), 0, s('score'), 0,
      s('sweep'), 0, s('doubles'), 0, s('streek'), 0, s('bstreek'), 0, s('age'), 0, s('sex'), '-', s('loc'), EMPTY, s('comment'), EMPTY,
      s('nicelogout'), 1, s('ms'), 0, s('triples'), 0, s('quadruples'), 0, s('checksum'), 0);
  }

  startDemoUser() {
    this.loginTime = the.milliSeconds;
  }

  getPayedTimeLeft() {
    return callGlobal('formatPayedTimeLeft', max(0, this.timeleft + Math.trunc(((this.loginTime ?? 0) - the.milliSeconds) / 60000)));
  }

  checkinfo() {
    const info = this.info;
    if (info.prop('unfinished')) {
      info.prop('wo', num(info.prop('wo')) + 1);
      if (num(info.prop('streek')) > num(info.prop('bstreek'))) info.prop('bstreek', info.prop('streek'));
      info.prop('streek', 0);
      info.prop('score', max(0, num(info.prop('score')) - 50));
      info.prop('unfinished', 0);
      this.SavePrefs();
    }
  }

  receivedPrefs(L: LValue) {
    const txt = getPref(this.prefsfile!);
    if (!voidp(txt)) {
      put('has a saved prefsfile');
      let info = callGlobal('rocket_decrypt', txt) as LValue;
      if (stringp(info)) this.clearInfo();
      if (voidp(info) || stringp(info)) {
        put('was not able to decrypt');
        if (L === 0 || L === EMPTY) this.clearInfo();
        else this.info = this.decompressInfo(L as LList);
        return;
      }
      this.info = info as LPropList;
      if (!correctChecksum(this.info, 1333)) {
        put('bad checksum');
        this.clearInfo();
      }
      if (num(this.info.prop('uniqueCode')) !== getStringSum(callGlobal('rocket_encrypt', this.paycode))) {
        put('another vip code');
        if (L === 0 || L === EMPTY) this.clearInfo();
        else this.info = this.decompressInfo(L as LList);
        return;
      }
      info = undefined;
    }
    if (L !== 0 && L !== undefined) {
      if (stringp(L)) {
        callGlobal('AddDebugLog', `received invalid prefs ${L}`);
        this.clearInfo();
        return;
      }
      const R = this.decompressInfo(L as LList);
      if (num(R.prop('won')) > num(this.info.prop('won')) || num(R.prop('lost')) > num(this.info.prop('lost'))) this.info = R;
    }
    if (!this.info.prop('nicelogout') && !voidp(this.info.prop('nicelogout'))) {
      G.gDialog.open(G.gText.get('badlogout'), new LList([propList(sym('name'), 'OK button', sym('event'), sym('nada'), sym('receiver'), this as never)]));
      this.info.prop('nicelogout', 0);
      this.SavePrefs();
    }
  }

  compressUserInfo(): LList {
    const L = new LList();
    for (let i = 1; i <= this.info.count; i++) {
      if (this.info.getPropAt(i) !== sym('checksum')) {
        const v = this.info.getAt(i);
        L.add(stringp(v) ? formatOutgoingText(v) : v);
      }
    }
    return L;
  }

  decompressInfo(d: LList): LPropList {
    const L = new LPropList();
    for (let i = 1; i <= d.count; i++) {
      if (i > this.info.count) break;
      if (this.info.getPropAt(i) !== sym('checksum')) {
        const v = d.getAt(i);
        L.addProp(this.info.getPropAt(i), stringp(v) ? formatIncomingText(v) : v);
      }
    }
    return L;
  }

  SavePrefs() {
    if (this.prefsfile === EMPTY) return;
    this.info.prop('uniqueCode', getStringSum(callGlobal('rocket_encrypt', this.paycode)));
    this.info.prop('lpnr', num(this.info.prop('lpnr')) + 1);
    this.info.prop('ms', the.milliSeconds);
    updateChecksum(this.info, 1333);
    setPref(this.prefsfile!, callGlobal('rocket_encrypt', this.info));
  }

  idleTimeout() {
    timeout('idleTimeout').forget();
    if (G.gMultiuserInstanceIRC && typeof G.gMultiuserInstanceIRC === 'object') callGlobal('JumpMovie', 'main', 'logout');
  }

  initIdle(tMinutes: number) {
    timeout('idleTimeout').forget();
    timeout('idleTimeout').new(tMinutes * 60 * 1000, 'idleTimeout', this);
    timeout('idleTimeout').persistent = 1;
  }

  stopMovie() {}
  prepareMovie() {}

  getUniqueCode(): string {
    return concat(concat(this.findInternalIp(), 'r'), this.ip);
  }

  /**
   * The machine's address from the Multiuser Xtra's getNetAddressCookie(1, i), word 2.
   * A browser has no such address (dirplayer answers "" too), so this is VOID.
   */
  findInternalIp(_n?: unknown): string | undefined {
    return undefined;
  }

  ReceivedIp(s: string) {
    this.ip = s;
    this.uniqueCode = this.getUniqueCode();
  }
}
