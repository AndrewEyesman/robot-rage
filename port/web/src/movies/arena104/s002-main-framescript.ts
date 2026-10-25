// arena104 behavior 2 "main framescript", the frame script of the match frame (10):
// start sync with the opponent (ready / ready ok), the 3-2-1-RAGE countdown, the
// player's keys and position sent to the opponent, robot-on-robot collisions, the
// opponent's messages (#Received), winning, losing, ties, surrender (walkover), the
// result overlay, reporting the score (setrobotscore), revenge and draw offers, and the
// sprites shots and sparkles borrow (createSprite / createSparkle).

import { SILENCE_MS, arenaFixes, pageAway, takeTabSwitch } from './enhancements';
import {
  G, dot, externalParamValue, go, intersects, keyPressed, member, netDone, netError, pass, puppetSprite, put, script, sendAllSprites, sendSprite,
  sound, sprite, the, type MultiuserXtra, type SoundMember,
} from '../../director';
import type { Shockwave3dMember } from '../../director/s3d';
import {
  LList, LPoint, LPropList, TAB, abs, add, contains, div, integer, lingoString, mod, mul, point, propList, random, sub, sym, voidp,
  type LSymbol, type LValue,
} from '../../lingo';
import { FilterBadLanguage, FilterBadLanguage2 } from '../robotwars/s065-badlanguage';
import { RobotWarsReceive, RobotWarsSend } from '../robotwars/s019-net-lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { CameraScript } from './s007-camera-script';
import { UpdateBatteryHeight, UpdatePansarWidth, VectorToPoint, rankatspel, theOVerlay } from './s006-arena-3d';
import { eq, n, pget, pset, setSp, sp, world } from './util';

// global gDelay, gTimeDiff, gBatt, gFrame, gGamePlace, gCamera, gLastReceivedTime,
// gWatcher, gLobbydata, gUserData, gopponentdata, world, gRobot1, gRobot2, muInstance,
// gPlayer, gOpponent, gPlayerNumber, gpingtime, gUseUDP, gOpponentReady, gWinnerName,
// gWinnerID, gMatchResult, gMatchscore, gLastHitTime, gGameGlobals, gMyIP, gOpIP,
// gWonGames, gLostGames, gVersionList, gArenaStartTime, gRev, gCHat, gdraw

const s = (name: string) => sym(name);
const mu = (): MultiuserXtra => G.muInstance;
const camera1 = () => (G.world as Shockwave3dMember).camera(1);
/** world.camera[1].overlay[theOVerlay(name)] */
const overlay = (name: string) => camera1().overlay(theOVerlay(name)!);

/** sendNetMessage([#recipients: gOpponent, #subject:, #content:, <udpKey>: udp]): the original writes #upd for #udp in places. */
function send(subject: string, content: LValue, udpKey: 'udp' | 'upd', udp: LValue): number {
  const msg = propList(s('recipients'), G.gOpponent, s('subject'), subject);
  if (content !== undefined) msg.addProp(s('content'), content);
  msg.addProp(s(udpKey), udp);
  return mu().sendNetMessage(msg);
}

export class MainFramescript {
  state: LSymbol | undefined = undefined;
  keyQueue: LValue = undefined;
  lastMap: string = undefined as unknown as string;
  pCounter: LValue = undefined;
  pstartTime: number = undefined as unknown as number;
  pCounter2: number = undefined as unknown as number;
  wait: LValue = undefined;
  playerSp: number = undefined as unknown as number;
  opponentSp: number = undefined as unknown as number;
  pPongCount: number = undefined as unknown as number;
  freeSpriteList: LList = undefined as unknown as LList;
  removeSpriteList: LList = undefined as unknown as LList;
  overlaySize: number = undefined as unknown as number;
  lastMap2: LValue = undefined;
  pnetId: number | undefined = undefined;
  pPong: LValue = undefined;
  pCounterTime: LValue = undefined;
  pFrameCounter: LValue = undefined;
  pt: LPoint = undefined as unknown as LPoint;
  norevenge: number = undefined as unknown as number;
  pwait: number = undefined as unknown as number;
  pSeconds: number = undefined as unknown as number;
  pTime: number = undefined as unknown as number;
  pSend: number = undefined as unknown as number;
  /** arenaFixes.awayLoss: when the last frame ran, and whether the page was away too long to play on. */
  pLastFrame = 0;
  pAway = false;
  /** The relay said the opponent left (before this page found its own connection gone). */
  pOpponentLeft = false;

  beginSprite() {
    this.pLastFrame = the.milliSeconds;
    this.pAway = false;
    this.pOpponentLeft = false;
    sendSprite(1, s('usedoktor'));
    G.gFrame = this;
    this.pPongCount = 0;
    this.norevenge = 0;
    G.gMatchResult = s('nada');
    this.pCounterTime = the.milliSeconds;
    this.keyQueue = new LList();
    G.gWatcher = new LPropList();
    this.lastMap = '00000000';
    this.playerSp = 10;
    this.opponentSp = 20;
    G.gLastHitTime = the.milliSeconds;
    if (eq(G.gPlayerNumber, 2)) {
      this.playerSp = 20;
      this.opponentSp = 10;
    }
    this.pPong = 0;
    this.wait = 0;
    this.freeSpriteList = new LList();
    this.removeSpriteList = new LList();
    for (let i = 100; i <= 130; i++) {
      this.freeSpriteList.add(i);
    }
    this.state = s('init');
    this.pFrameCounter = 0;
    this.pstartTime = the.milliSeconds;
    G.gMyIP = '193.150.228.134';
    if (eq(the.runMode, 'plugin')) {
      G.gMyIP = externalParam('sw1');
    }
    G.gRev = undefined;
    G.gdraw = undefined;
    this.pSeconds = the.systemDate.seconds;
    this.pwait = 0;
    this.pSend = 0;
    this.pTime = the.milliSeconds;
    G.gLastReceivedTime = this.pSeconds;
  }

  sendRev(str: string) {
    const s1 = lingoString(pget(G.gUserData, 'robotname')) + ':' + TAB + str;
    // the machineType is 256 (Windows): no Mac character conversion.
    if (contains(str, 'PLAY AGAIN')) {
      send('revenge1', propList(s('text'), s1), 'upd', 0);
      sendSprite(211, s('addChatLine'), s1, 1);
      G.gRev = G.gPlayer;
    } else {
      if (contains(str, 'OK')) {
        send('revenge2', propList(s('text'), s1), 'upd', 0);
        sendSprite(211, s('addChatLine'), s1, 0);
        G.gRev = undefined;
        this.state = s('gorevenge');
      }
    }
  }

  sendDRAW(str: string) {
    put('senddraw', str);
    const s1 = lingoString(pget(G.gUserData, 'robotname')) + ':' + TAB + str;
    if (contains(str, 'DRAW')) {
      send('draw1', propList(s('text'), s1), 'upd', 0);
      sendSprite(211, s('addChatLine'), s1, 1);
      G.gdraw = G.gPlayer;
    } else {
      if (contains(str, 'OK')) {
        send('draw2', propList(s('text'), s1), 'upd', 0);
        sendSprite(211, s('addChatLine'), s1, 0);
        G.gdraw = undefined;
        this.state = s('gorevenge');
      }
    }
  }

  godraw() {
    this.state = s('godraw');
  }

  gorevenge() {
    this.state = s('gorevenge');
  }

  walkover() {
    sendAllSprites(s('stopshoot'));
    send('walkover', new LList(), 'udp', G.gUseUDP);
    G.gWinnerID = pget(G.gopponentdata, 'robotid');
    G.gWinnerName = pget(G.gopponentdata, 'robotname');
    G.gMatchResult = s('lost');
    G.gLostGames = n(G.gLostGames) + 1;
    if (rankatspel()) {
      if (n(G.gWonGames) < n(G.gLostGames)) {
        const diff = abs(sub(pget(G.gopponentdata, 'score'), pget(G.gUserData, 'score')));
        if (n(pget(G.gopponentdata, 'score')) < n(pget(G.gUserData, 'score'))) {
          const mresult = integer(sub(mul(-0.25, diff), 10));
          G.gMatchscore = mresult;
        } else {
          G.gMatchscore = -10;
        }
      }
    } else {
      G.gMatchscore = 0;
    }
    G.gMatchResult = s('walkover');
    this.gameover();
  }

  sendChatMessage(str: string) {
    const s1 = lingoString(pget(G.gUserData, 'robotname')) + ':' + TAB + FilterBadLanguage(str);
    if (eq(G.gPlayerNumber, 1)) {
      if (!FilterBadLanguage2(str)) {
        mu().sendNetMessage(propList(s('recipients'), mu().getPeerConnectionList(), s('subject'), 'chat2', s('content'), propList(s('text'), s1), s('upd'), 0));
      }
    } else {
      if (!FilterBadLanguage2(str)) {
        send('chat1', propList(s('text'), s1), 'upd', 0);
      }
    }
    sendSprite(211, s('addChatLine'), s1);
  }

  makeTie() {
    G.gMatchResult = s('tie');
    this.gameover();
    sendSprite(211, s('addChatLine'), score());
  }

  makeWinner(smokearg?: LValue) {
    sendAllSprites(s('stopshoot'));
    if (G.gMatchResult !== s('nada')) {
      return;
    }
    G.gWinnerID = pget(G.gUserData, 'robotid');
    G.gWinnerName = pget(G.gUserData, 'robotname');
    G.gMatchResult = s('won');
    G.gWonGames = n(G.gWonGames) + 1;
    if (rankatspel()) {
      if (n(G.gWonGames) > n(G.gLostGames)) {
        const diff = abs(sub(pget(G.gopponentdata, 'score'), pget(G.gUserData, 'score')));
        if (n(pget(G.gopponentdata, 'score')) > n(pget(G.gUserData, 'score'))) {
          G.gMatchscore = integer(add(mul(0.25, diff), 10));
        } else {
          G.gMatchscore = 10;
        }
      }
    } else {
      G.gMatchscore = 0;
    }
    if (smokearg === s('smoke')) {
      sendSprite(this.opponentSp, s('breakdown'));
    }
    this.gameover();
    sendSprite(211, s('addChatLine'), score());
  }

  goLobby() {
    send('norevenge', undefined, 'upd', 0);
    this.state = s('gameover');
  }

  checkCollision() {
    if (intersects(10, 20)) {
      if (sp(10, 'state') === s('fast') || sp(20, 'state') === s('fast')) {
        return;
      }
      const dx10 = sp(10, 'dx');
      const dy10 = sp(10, 'dy');
      const angle10 = sp(10, 'angle');
      const speed10 = sp(10, 'speed');
      if (the.milliSeconds > n(G.gLastHitTime) + 400) {
        playsound('regular_krock', 255);
        sendSprite(this.playerSp, s('damage'), 1, s('no'));
        sendSprite(this.opponentSp, s('damage'), 1, s('no'));
        G.gLastHitTime = the.milliSeconds;
      }
      sendSprite(10, s('hit'), sp(20, 'dx'), sp(20, 'dy'), sp(20, 'angle'), sp(20, 'speed'));
      sendSprite(20, s('hit'), dx10, dy10, angle10, speed10);
    }
    if (intersects(this.playerSp, 6)) {
      if (sp(this.playerSp, 'state') === s('move')) {
        sendSprite(this.playerSp, s('tip'));
        send('tip', propList(s('sp'), this.playerSp), 'upd', 0);
      }
    }
  }

  ping() {
    mu().sendNetMessage(propList(s('recipients'), G.gOpponent, s('subject'), 'p2p_ping', s('upd'), 1));
    // Quirk: the original stamps the ping in seconds since midnight but times the pong
    // in milliseconds, so the measured delay always comes out at the 300 ms cap (see
    // #Received). The port times it in milliseconds unless ?quirks=ping (enhancements.ts).
    G.gpingtime = arenaFixes.pingDelay ? the.milliSeconds : this.pSeconds;
  }

  ShowOverlay(txt: string, f1?: LValue, f2?: LValue) {
    void f1;
    void f2;
    const w = world();
    let t1 = w.texture('Rough');
    if (t1 === undefined) {
      t1 = w.newTexture('Rough', s('fromCastMember'), member('skylt' + txt));
    }
    this.pt = point(member('skylt' + txt).width, member('skylt' + txt).height);
    t1.quality = s('high');
    t1.renderFormat = s('rgba8888');
    camera1().addOverlay(t1, sub(point(374, 200), div(this.pt, 2)) as LPoint, 0);
    overlay('Rough').blend = 100;
    overlay('Rough').scale = 0.001;
    return undefined;
  }

  hideOverlay() {
    camera1().removeOverlay(theOVerlay('Rough')!);
    world().deleteTexture('Rough');
  }

  CheckPing() {
    if (this.pSeconds > n(G.gLastReceivedTime) + 20) {
      this.noConnection();
    }
  }

  /**
   * The port's fix (arenaFixes.awayLoss, enhancements.ts): no frame for the opponent's
   * 20 s of silence means the browser froze the page (in the background), and the
   * opponent has taken the round as a walkover. Once the round can be given up (not
   * while a result is being shown or sent), give it up.
   */
  checkAway() {
    const now = the.milliSeconds;
    if (now - this.pLastFrame >= SILENCE_MS && this.state !== s('gameover')) this.pAway = true;
    this.pLastFrame = now;
    if (this.pAway && this.canGiveUp()) this.awayLost();
  }

  /** Whether the round is on (or about to be, or between rounds): what a walkover ends. */
  canGiveUp() {
    const st = this.state;
    return !!st && !['init', 'showResult', 'scaleText', 'doneScale', 'sendResult', 'waitNet', 'done', 'gameover', 'gorevenge', 'godraw', 'problem'].includes(st.name);
  }

  /** arenaFixes.awayLoss: the page was away too long, or lost its connection away: give the round up as SURRENDER does. */
  awayLost() {
    this.pAway = false;
    sendSprite(211, s('addChatLine'), 'Robot Rage:' + TAB + 'You were away too long and lost the connection: the round goes to ' + lingoString(G.gOpponent) + '.');
    this.hideOverlay();
    this.walkover();
  }

  /**
   * The match connection reported a problem (ArenaMessageHandler). The original asks
   * the server whether it can still be reached (noConnection) and, if so, takes the
   * round. With arenaFixes.awayLoss, its own connection gone while the page was in the
   * background (or just back from it), before any word that the opponent left, means
   * the relay saw this player leave: the round is given up instead.
   */
  connectionLost(own: boolean) {
    if (!own) this.pOpponentLeft = true;
    if (arenaFixes.awayLoss && own && !this.pOpponentLeft && pageAway() && this.canGiveUp()) return this.awayLost();
    if (this.state === s('idle') || this.state === s('waitOpponent')) this.noConnection();
  }

  noConnection() {
    const infoList = new LPropList();
    infoList.addProp('action', 'PING');
    this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
    this.state = s('waitforpong');
  }

  /** The countdown's numbers grow, turn and fade in over a second (t ms). */
  private growOverlay(t: number) {
    overlay('rough').blend = t / 10.0;
    overlay('rough').rotation = t * 0.36;
    overlay('rough').loc = sub(point(374, 200), div(mul(div(this.pt, 2), t), 1000.0)) as LPoint;
    overlay('rough').scale = t / 1000.0;
  }

  /** The "!" message: the player's robot's position, keys and damage. */
  private sendPosition(keymap: string) {
    const ps = this.playerSp;
    send(
      '!',
      propList(
        s('x'), sp(ps, 'x'), s('y'), sp(ps, 'y'), s('dx'), sp(ps, 'dx'), s('dy'), sp(ps, 'dy'), s('angle'), sp(ps, 'angle'), s('speed'), sp(ps, 'speed'),
        s('keymap'), keymap, s('ds'), sp(ps, 'damageStatus'), s('SL'), 0, s('sp'), ps,
      ),
      'udp',
      G.gUseUDP,
    );
  }

  prepareFrame() {
    if (arenaFixes.awayLoss) this.checkAway();
    mu().checkNetMessages(20);
    this.pCounter = add(this.pCounter, 1);
    this.checkTempo();
    if (eq(G.gBatt, 2)) {
      G.gMatchResult = s('tie');
      this.makeTie();
      G.gBatt = 0;
    }
    const st = this.state;
    if (st === s('init')) {
      this.pCounter = 0;
      this.pCounterTime = the.milliSeconds;
      this.updateBattery();
      this.state = s('sendready');
      G.gCamera = new CameraScript();
      the.actorList.push(G.gCamera);
      this.pstartTime = the.milliSeconds;
      G.gLastReceivedTime = this.pSeconds;
    } else if (st === s('sendready')) {
      const ps = this.playerSp;
      send(
        'ready',
        propList(
          s('x'), sp(ps, 'x'), s('y'), sp(ps, 'y'), s('dx'), sp(ps, 'dx'), s('dy'), sp(ps, 'dy'), s('angle'), sp(ps, 'angle'), s('speed'), sp(ps, 'speed'),
          s('keymap'), this.getKeyMap(), s('ip'), G.gMyIP,
        ),
        'udp',
        G.gUseUDP,
      );
      this.state = s('waitOpponent');
    } else if (st === s('waitOpponent')) {
      if (n(G.gOpponentReady)) {
        this.state = s('ping');
      } else {
        if (this.pSend === 0) {
          this.ShowOverlay('wait', 100);
          overlay('rough').blend = 100;
          overlay('rough').loc = point(234, 130);
          overlay('rough').scale = 1;
          this.pSend = 1;
        }
        if (this.pSeconds > n(G.gLastReceivedTime) + 20) {
          this.noConnection();
        } else {
          this.state = s('sendready');
        }
      }
    } else if (st === s('ping')) {
      G.gRev = undefined;
      G.gTimeDiff = undefined;
      this.ping();
      this.pstartTime = the.milliSeconds;
      this.state = s('three');
    } else if (st === s('three')) {
      this.hideOverlay();
      this.ShowOverlay('3', 100);
      this.state = s('wait3');
      this.pstartTime = the.milliSeconds;
    } else if (st === s('wait3')) {
      let t = the.milliSeconds - this.pstartTime;
      if (t >= 1000) {
        this.state = s('two');
        playsound('blipp1', 255);
        t = 1000;
      }
      this.growOverlay(t);
    } else if (st === s('two')) {
      this.hideOverlay();
      this.ShowOverlay('2', 100);
      this.state = s('wait2');
      this.pstartTime = the.milliSeconds;
    } else if (st === s('wait2')) {
      let t = the.milliSeconds - this.pstartTime;
      if (t >= 1000) {
        this.state = s('one');
        playsound('blipp1', 255);
        t = 1000;
      }
      this.growOverlay(t);
    } else if (st === s('one')) {
      this.hideOverlay();
      this.ShowOverlay('1', 100);
      this.pstartTime = the.milliSeconds;
      this.state = s('wait1');
    } else if (st === s('wait1')) {
      let t = the.milliSeconds - this.pstartTime;
      if (t >= 1000) {
        this.state = s('Run');
        playsound('blipp1', 255);
        t = 1000;
      }
      this.growOverlay(t);
    } else if (st === s('Run')) {
      this.hideOverlay();
      this.pstartTime = the.milliSeconds;
      this.ShowOverlay('rage', 100);
      this.state = s('initfadeout');
    } else if (st === s('initfadeout')) {
      let t = the.milliSeconds - this.pstartTime;
      if (t >= 1000) {
        playsound('blipp2', 255);
        sprite(204).locV = sprite(204).locV - 100;
        sprite(205).locV = sprite(205).locV - 100;
        sprite(214).locV = sprite(214).locV - 100;
        sprite(215).locV = sprite(215).locV - 100;
        this.pCounter2 = 100;
        this.state = s('fadeOut');
        t = 1000;
      }
      this.growOverlay(t);
    } else if (st === s('fadeOut')) {
      this.checkKeys();
      this.checkCollision();
      this.pCounter2 = this.pCounter2 - 5;
      if (this.pCounter2 > 0) {
        overlay('rough').blend = this.pCounter2;
      } else {
        this.hideOverlay();
        this.state = s('Activate');
      }
    } else if (st === s('Activate')) {
      this.checkKeys();
      this.checkCollision();
      this.hideOverlay();
      this.ping();
      sound(1).setPlayList([]);
      sound(1).queue({ member: member('ambient sound') as SoundMember, loopCount: 9999 });
      sound(1).play();
      sound(1).fadeTo(20, 2000);
      this.pFrameCounter = 0;
      this.pstartTime = the.milliSeconds;
      G.gArenaStartTime = the.milliSeconds;
      G.gLastReceivedTime = this.pSeconds;
      this.state = s('idle');
      this.pCounter = 1;
    } else if (st === s('idle')) {
      this.checkKeys();
      this.checkCollision();
      this.CheckPing();
      if (mod(this.pCounter, 15) === 0) {
        this.sendPosition(this.getKeyMap());
        this.updateBattery();
      }
    } else if (st === s('showResult')) {
      const r = G.gMatchResult;
      if (r === s('walkover')) {
        this.ShowOverlay('wo', 40, 70);
      } else if (r === s('won')) {
        this.ShowOverlay('vic', 40, 70);
      } else if (r === s('lost')) {
        this.ShowOverlay('def', 40, 70);
      } else if (r === s('tie')) {
        this.ShowOverlay('tie', 40, 70);
      } else {
        put('inget bra gMatchResult');
        this.ShowOverlay('tie', 40, 70);
      }
      this.pCounter2 = 0;
      this.overlaySize = 0.0001;
      this.state = s('scaleText');
    } else if (st === s('scaleText')) {
      this.checkCollision();
      if (mod(this.pCounter, 16) === 0) {
        this.sendPosition(this.getKeyMap());
        this.updateBattery();
      }
      this.pCounter2 = this.pCounter2 + 1;
      if (this.pCounter2 > 20) {
        this.pCounter2 = 20;
      }
      this.overlaySize = this.overlaySize + 0.05;
      if (this.overlaySize > 1) {
        this.state = s('doneScale');
        this.overlaySize = 1;
      }
      overlay('rough').blend = this.pCounter2 * 5;
      overlay('rough').rotation = this.pCounter2 * 18;
      overlay('rough').loc = sub(point(374, 200), mul(div(this.pt, 2), this.overlaySize)) as LPoint;
      overlay('rough').scale = this.overlaySize;
    } else if (st === s('doneScale')) {
      this.pstartTime = the.milliSeconds;
      this.state = s('sendResult');
      // The port's fix (arenaFixes.bothReport): the loser reports too, for the server
      // to count only results both players agree on.
      if (G.gMatchResult === s('lost') && !arenaFixes.bothReport) {
        this.state = s('done');
        put('lost, dont send');
      }
      if (!rankatspel()) {
        this.state = s('done');
        put('not ranked, dont send');
      }
      if (this.pPongCount > 150) {
        this.state = s('done');
        put('pong is too high, dont send');
      }
    } else if (st === s('sendResult')) {
      const infoList = new LPropList();
      if (G.gWinnerID === undefined) {
        G.gWinnerID = 0;
      }
      infoList.addProp('action', 'setrobotscore');
      infoList.addProp(s('user1id'), pget(G.gUserData, 'robotid'));
      infoList.addProp(s('user2id'), pget(G.gopponentdata, 'robotid'));
      infoList.addProp(s('winner'), G.gWinnerID);
      infoList.addProp(s('checksum'), random(2000));
      const asp = lingoString(dot(G.gVersionList, 'mainasp', 'version'));
      if (eq(G.gWinnerID, 0)) {
        // A tie: the host's report only, or both with arenaFixes.bothReport.
        if (eq(pget(G.gUserData, 'server'), 1) || arenaFixes.bothReport) {
          this.pnetId = RobotWarsSend(asp, infoList);
        }
      } else {
        this.pnetId = RobotWarsSend(asp, infoList);
      }
      put('send result,  winner is ' + lingoString(G.gWinnerID));
      G.gWinnerID = undefined;
      this.state = s('waitNet');
    } else if (st === s('waitNet')) {
      const r = RobotWarsReceive(this.pnetId!);
      if (r === s('waiting')) {
        // nothing
      } else if (r === s('error')) {
        this.state = s('done');
      } else {
        this.state = s('done');
      }
    } else if (st === s('done')) {
      if (n(G.gWonGames) >= 3 || n(G.gLostGames) >= 3 || G.gMatchResult === s('walkover') || this.norevenge === 1) {
        this.state = s('gameover');
      } else {
        sprite(206).locV = sprite(206).locV - 100;
        sprite(207).locV = sprite(207).locV - 100;
        sprite(208).locV = sprite(208).locV - 100;
        sprite(209).locV = sprite(209).locV - 100;
        sprite(214).locV = sprite(214).locV + 100;
        sprite(215).locV = sprite(215).locV + 100;
        this.state = s('wait');
      }
    } else if (st === s('wait')) {
      if (this.norevenge === 1) {
        this.goLobby();
      }
      this.CheckPing();
      this.checkCollision();
    } else if (st === s('waitforpong')) {
      this.pPongCount = this.pPongCount + 1;
      if (netDone(this.pnetId)) {
        const err = netError(this.pnetId);
        if (eq(err, 'OK')) {
          G.gWinnerID = pget(G.gUserData, 'robotid');
          G.gWinnerName = pget(G.gUserData, 'robotname');
          sendSprite(0, s('makeWinner'), s('nosmoke'));
          G.gMatchResult = s('walkover');
        }
      }
      if (this.pPongCount > 150) {
        G.gLostGames = n(G.gLostGames) + 1;
        G.gMatchResult = s('walkover');
        this.gameover();
      }
    }
    this.RecycleSprites();
  }

  updateBattery() {
    let ds = sp(this.playerSp, 'damageStatus');
    let h = n(pget(ds, 'energy')) / 2.0;
    sprite(70).height = h;
    sprite(70).locV = 469 + 89 - h;
    sprite(71).locH = (145 * n(pget(ds, 'pansar'))) / 249.0 - 36;
    UpdateBatteryHeight(70, h);
    UpdatePansarWidth(71, (145 * n(pget(ds, 'pansar'))) / 249.0 - 36);
    ds = sp(this.opponentSp, 'damageStatus');
    h = n(pget(ds, 'energy')) / 2.0;
    sprite(80).height = h;
    sprite(80).locV = 469 + 89 - h;
    sprite(81).locH = (145 * n(pget(ds, 'pansar'))) / 249.0 + 421;
    UpdateBatteryHeight(80, h);
    UpdatePansarWidth(81, (145 * n(pget(ds, 'pansar'))) / 249.0 + 421);
  }

  checkTempo() {
    checkTempo(this);
  }

  Resize3DSprite() {
    const w = 0.8 * sprite(21).width;
    const h = 0.8 * sprite(21).height;
    if (w > 300) {
      sprite(21).rect = { left: 375 - w / 2, top: 220 - h / 2, right: 375 + w / 2, bottom: 220 + h / 2 };
      sprite(19).width = sprite(19).width + 1;
    }
  }

  getKeyMap(): string {
    if (sp(211, 'state') === s('hidden')) {
      if (n(pget(sp(this.playerSp, 'damageStatus'), 'energy')) > 0) {
        return keyMap();
      } else {
        return '00000000';
      }
    } else {
      return '00000000';
    }
  }

  getKeyMap2(): string {
    return keyMap2();
  }

  checkKeys() {
    const map = this.getKeyMap();
    if (map !== this.lastMap) {
      this.sendPosition(map);
      sendSprite(this.playerSp, s('keyPressed'), map, G.gDelay);
      this.lastMap = map;
    }
  }

  keyUp() {
    if (sp(211, 'state') === s('hidden') && sp(this.playerSp, 'state') !== s('mini')) {
      const key = the.key;
      if (['0', '1', '2', '3', 'v', 'b'].some((k) => eq(key, k))) {
        if (eq(key, 'v')) {
          if (vapen().getOne(s('v37')) > 0) {
            (G.gCamera as CameraScript).SetView(key);
          }
        } else {
          if (eq(key, 'b')) {
            if (vapen().getOne(s('v23')) > 0) {
              (G.gCamera as CameraScript).SetView(key);
            }
          } else {
            (G.gCamera as CameraScript).SetView(key);
          }
        }
      } else if (eq(key, 'T')) {
        if (eq(G.gCHat, 1)) {
          sendSprite(211, s('ChatLineStart'));
        }
      }
      return passEvent();
    }
  }

  endSprite() {
    for (let i = 30; i <= 50; i++) {
      puppetSprite(i, 0);
    }
    the.actorList = [];
  }

  gameover() {
    sprite(204).locV = sprite(204).locV + 100;
    sprite(205).locV = sprite(205).locV + 100;
    sprite(214).locV = sprite(214).locV + 100;
    sprite(215).locV = sprite(215).locV + 100;
    this.state = s('showResult');
  }

  Received(subject: LValue, content: LValue, ts: LValue) {
    // global gpingtime
    G.gLastReceivedTime = this.pSeconds;
    let lag: LValue;
    if (eq(subject, 'p2p_pong')) {
      const t = the.milliSeconds - n(G.gpingtime);
      if (voidp(G.gTimeDiff)) {
        G.gTimeDiff = the.milliSeconds - n(ts);
      }
      const newDelay = Math.trunc(t / 2);
      G.gDelay = add(mul(0.8, G.gDelay), mul(0.2, newDelay));
      if (n(G.gDelay) > 300) {
        G.gDelay = 300;
      }
      this.pPong = 1;
      return;
    } else if (eq(subject, '!')) {
      if (this.state === s('init')) {
        return;
      }
      lag = the.milliSeconds - n(G.gTimeDiff) - n(ts);
      const newDiff = the.milliSeconds - n(ts);
      G.gTimeDiff = 0.9 * n(G.gTimeDiff) + 0.1 * newDiff;
      sendSprite(this.opponentSp, s('receivedEvent'), pget(content, 'x'), pget(content, 'y'), pget(content, 'dx'), pget(content, 'dy'), pget(content, 'angle'), pget(content, 'speed'), lag);
      sendSprite(this.opponentSp, s('keyEvent'), pget(content, 'keymap'), lag);
      sendSprite(this.opponentSp, s('updateDamage'), pget(content, 'ds'));
    } else if (eq(subject, 'ready')) {
      G.gOpIP = pget(content, 'ip');
      // lag is still VOID here.
      sendSprite(this.opponentSp, s('receivedEvent'), pget(content, 'x'), pget(content, 'y'), pget(content, 'dx'), pget(content, 'dy'), pget(content, 'angle'), pget(content, 'speed'), lag);
      if (this.state === s('waitOpponent') || (arenaFixes.startSync && this.state === s('sendready'))) {
        if (eq(G.gPlayerNumber, 2)) {
          send('ready ok', propList(s('ip'), G.gMyIP), 'udp', G.gUseUDP);
          G.gOpponentReady = 1;
        }
      }
    } else if (eq(subject, 'ready ok')) {
      G.gOpIP = pget(content, 'ip');
      G.gOpponentReady = 1;
    } else if (eq(subject, 'lost')) {
      put('lost reported from opponent');
      G.gWinnerID = pget(G.gUserData, 'robotid');
      G.gWinnerName = pget(G.gUserData, 'robotname');
      G.gMatchResult = s('nada');
      this.makeWinner(s('smoke'));
      let andra = 10;
      if (eq(pget(content, 'sp'), 10)) {
        andra = 20;
      }
      pset(sp(andra, 'damageStatus'), 'pansar', 0);
      sendSprite(andra, s('updateBattery'));
      const csp = n(pget(content, 'sp'));
      if (sp(csp, 'state') !== s('fall') && sp(csp, 'state') !== s('hopp')) {
        setSp(csp, 'state', s('over'));
      } else {
        setSp(csp, 'prestate', s('over'));
      }
    } else if (eq(subject, 'nobatt')) {
      G.gBatt = n(G.gBatt) + 1;
      sendSprite(this.opponentSp, s('battery'));
    } else if (eq(subject, 'ConnectionProblem') || eq(subject, 'aborted')) {
      // No case handles #problem: the match just stops updating.
      this.state = s('problem');
    } else if (eq(subject, 'walkover')) {
      G.gWinnerID = pget(G.gUserData, 'robotid');
      G.gWinnerName = pget(G.gUserData, 'robotname');
      this.hideOverlay();
      this.norevenge = 1;
      this.makeWinner(s('nosmoke'));
      G.gMatchResult = s('walkover');
    } else if (eq(subject, 'tip')) {
      sendSprite(this.opponentSp, s('tip'));
    } else if (eq(subject, 'speaker1') || eq(subject, 'speaker2')) {
      playsound(lingoString(subject), 255);
    } else if (eq(subject, 'norevenge')) {
      this.norevenge = 1;
    } else if (eq(subject, 'fastiklo')) {
      sendSprite(n(pget(content, 'sp')), s('hakafast'));
      sendSprite(10, s('setrob'), pget(content, 'r1pos'), pget(content, 'r1rot'));
      sendSprite(20, s('setrob'), pget(content, 'r2pos'), pget(content, 'r2rot'));
    } else if (eq(subject, 'lossiklo')) {
      sendAllSprites(s('makenormal'));
      sendAllSprites(s('release'));
      sendSprite(10, s('setrob'), pget(content, 'r1pos'), pget(content, 'r1rot'));
      sendSprite(20, s('setrob'), pget(content, 'r2pos'), pget(content, 'r2rot'));
    } else if (eq(subject, 'minigo')) {
      sendSprite(n(pget(content, 'sp')), s('minigo'), content);
    } else if (eq(subject, 'miniboom')) {
      sendSprite(n(pget(content, 'sp')), s('miniboom'), content);
    } else if (eq(subject, 'setmini')) {
      sendSprite(n(pget(content, 'sp')), s('setmini'), content);
    } else if (eq(subject, 'explode')) {
      sendSprite(n(pget(content, 'sp')), s('explode'));
    } else if (eq(subject, 'TIE')) {
      this.makeTie();
    } else if (eq(subject, 'NOTIE')) {
      put(pget(content, 'sp'));
      sendSprite(n(pget(content, 'sp')), s('MakeLoser'));
    }
  }

  removeSprite(n0: number) {
    removeSprite(this, n0);
  }

  createSprite(name: string, V: LValue, a1?: LValue, a2?: LValue, a3?: LValue) {
    createSprite(this, name, V, a1, a2, a3);
  }

  RecycleSprites() {
    RecycleSprites(this);
  }

  createSparkle(V: LValue) {
    createSparkle(this, V);
  }

  exitFrame() {
    if (this.state === s('gameover')) {
      sendAllSprites(s('usedoktor'));
      pset(pget(G.gUserData, 'propertyList'), 'saveMap', 0);
      (G.gGameGlobals as LPropList).setaProp(s('reload'), 1);
      sendAllSprites(s('makedoktor'));
      go('save');
    } else {
      if (this.state === s('gorevenge') || this.state === s('godraw')) {
        go('open');
      } else {
        go(the.frame);
      }
    }
  }
}

// ---------------------------------------------------------------- shared with the backyard frame script

const externalParam = (name: string) => externalParamValue(name);
const passEvent = () => pass();

/** gPlayer (gWonGames) - gOpponent (gLostGames), as the chat shows the score. */
const score = () => lingoString(G.gPlayer) + ' (' + lingoString(G.gWonGames) + ') - ' + lingoString(G.gOpponent) + ' (' + lingoString(G.gLostGames) + ')';

const vapen = (): LList => dot(G.gUserData, 'propertyList', 'robotDescription', 'vapen') as LList;

/** The arrows and Z, X, C as eight "0"/"1" characters (keyPressed's TRUE is 1). */
export function keyMap(): string {
  const k = (x: number | string) => (keyPressed(x) ? '1' : '0');
  return '' + k(123) + k(124) + k(126) + k(125) + k('z') + k('x') + k('c') + '0';
}

export function keyMap2(): string {
  const k = (x: string) => (keyPressed(x) ? '1' : '0');
  return '' + k('h') + k('k') + k('u') + k('n') + k('m') + k(',') + k('.') + '0';
}

interface TempoState {
  pCounter: LValue;
  pSeconds: number;
  pwait: number;
  pTime: number;
}

/**
 * checkTempo: once a second, how long that second really took (in 30ths). Over 500,
 * the clock was tampered with (a speed hack): a #speedgear strike on the robot, and the
 * frame waits that long every frame until the next check.
 */
export function checkTempo(me: TempoState) {
  if (mod(me.pCounter, 5) === 0) {
    const tSeconds = the.systemDate.seconds;
    if (tSeconds > me.pSeconds) {
      me.pSeconds = tSeconds;
      me.pwait = Math.trunc((the.milliSeconds - me.pTime) / 30);
      me.pTime = the.milliSeconds;
      const tabSwitch = takeTabSwitch();
      if (me.pwait > 500 && !(arenaFixes.tabSwitch && tabSwitch)) {
        const pl = pget(G.gUserData, 'propertyList') as LPropList;
        if (voidp(pl.getaProp(s('hacker')))) {
          pl.setaProp(s('speedgear'), 1);
        } else {
          pl.setaProp(s('speedgear'), add(pl.getaProp(s('speedgear')), 1));
        }
        sendSprite(1, s('makedoktor'));
      } else {
        me.pwait = 0;
      }
    }
  }
  if (me.pwait > 0) {
    const time3 = the.milliSeconds + me.pwait;
    while (the.milliSeconds <= time3) {
      // busy wait, as the original
    }
  }
}

interface SpritePool {
  freeSpriteList: LList;
  removeSpriteList: LList;
}

export function removeSprite(me: SpritePool, n0: number) {
  me.removeSpriteList.add(n0);
}

/** A free sprite (100-130) for a shot or mine: its member, matte ink, and its "<name> behavior". */
export function createSprite(me: SpritePool, name: string, V: LValue, a1?: LValue, a2?: LValue, a3?: LValue) {
  if (me.freeSpriteList.count === 0) {
    return;
  }
  const n0 = n(me.freeSpriteList.getAt(1));
  me.freeSpriteList.deleteAt(1);
  const spr = sprite(n0);
  spr.locV = -1000;
  spr.puppet = true;
  spr.member = member(name);
  spr.ink = 8;
  spr.blend = 100;
  spr.loc = VectorToPoint(V as never);
  spr.locZ = 20;
  const Cls = script(name + ' ' + 'behavior');
  spr.scriptInstanceList = Cls ? [new Cls(n0, name, V, a1, a2, a3)] : [];
  spr.foreColor = 255;
  spr.backColor = 0;
}

export function RecycleSprites(me: SpritePool) {
  while (me.removeSpriteList.count > 0) {
    const n0 = n(me.removeSpriteList.getAt(1));
    sprite(n0).scriptInstanceList = [];
    // member(0, 0): no member.
    sprite(n0).member = null;
    puppetSprite(n0, 0);
    me.removeSpriteList.deleteAt(1);
    me.freeSpriteList.add(n0);
  }
}

export function createSparkle(me: SpritePool, V: LValue) {
  if (me.freeSpriteList.count === 0) {
    return;
  }
  const n0 = n(me.freeSpriteList.getAt(1));
  me.freeSpriteList.deleteAt(1);
  const spr = sprite(n0);
  spr.puppet = true;
  spr.member = member('sparkle texture');
  spr.loc = VectorToPoint(V as never);
  const Cls = script('sparkle behavior');
  spr.scriptInstanceList = Cls ? [new Cls(n0, V)] : [];
}
