// arena104 behavior 4 "backyard framescript", the frame script of Training (frame 20,
// the garage's Testdrive door): builds the world and the player's robot, starts the
// camera, passes the keys to the robot behavior, checks the pit, keeps the battery and
// armour readings up to date, and lends sprites to shots and sparkles. There is no
// opponent: sprite 20 is empty.

import { G, dot, go, intersects, member, puppetSprite, sendSprite, sprite, the } from '../../director';
import { type Group3D, type Shockwave3dMember } from '../../director/s3d';
import { LList, LPoint, LPropList, add, lineCount, mod, point, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { BuildRobot } from '../robotwars/s006-3d-scripts';
import { CameraScript } from './s007-camera-script';
import { BuildWorld, UpdateBatteryHeight, UpdatePansarWidth, initWeapons, initWheels, theOVerlay } from './s006-arena-3d';
import { RecycleSprites, checkTempo, createSparkle, createSprite, keyMap, keyMap2, removeSprite } from './s002-main-framescript';
import { eq, n, pget, setLinesFontSize, sp, world } from './util';

// global gDelay, gTimeDiff, gGamePlace, gCamera, gLastReceivedTime, gWatcher,
// gLobbydata, gUserData, gopponentdata, world, gRobot1, gRobot2, gLastHitTime,
// gWonGames, gLostGames, gVersionList

const s = (name: string) => sym(name);

export class BackyardFramescript {
  state: LSymbol | undefined = undefined;
  keyQueue: LValue = undefined;
  lastMap: string = undefined as unknown as string;
  pCounter: LValue = undefined;
  pstartTime: number = undefined as unknown as number;
  pCounter2: LValue = undefined;
  wait: LValue = undefined;
  playerSp: number = undefined as unknown as number;
  opponentSp: number = undefined as unknown as number;
  freeSpriteList: LList = undefined as unknown as LList;
  removeSpriteList: LList = undefined as unknown as LList;
  overlaySize: LValue = undefined;
  lastMap2: LValue = undefined;
  pnetId: LValue = undefined;
  pPong: LValue = undefined;
  pCounterTime: LValue = undefined;
  pFrameCounter: LValue = undefined;
  pLastFrame: LValue = undefined;
  pSeconds: number = undefined as unknown as number;
  pOldTempo: LValue = undefined;
  pwait: number = undefined as unknown as number;
  pTime: number = undefined as unknown as number;

  beginSprite() {
    sendSprite(1, s('usedoktor'));
    BuildWorld();
    this.pCounterTime = the.milliSeconds;
    this.keyQueue = new LList();
    G.gWatcher = new LPropList();
    this.lastMap = '00000000';
    this.playerSp = 10;
    this.opponentSp = 20;
    G.gLastHitTime = the.milliSeconds;
    // The frames wait 60 ms each until checkTempo's first check, about a second in.
    this.pwait = 60;
    this.pPong = 0;
    this.BuildRobots();
    this.wait = 0;
    this.freeSpriteList = new LList();
    this.removeSpriteList = new LList();
    for (let i = 100; i <= 130; i++) {
      this.freeSpriteList.add(i);
    }
    this.pFrameCounter = 0;
    this.pLastFrame = 0;
    this.pSeconds = the.systemDate.seconds;
    this.pstartTime = the.milliSeconds;
    this.pTime = the.milliSeconds;
    this.state = s('init');
    // gMatchResult isn't declared global here: this sets a local.
    const gMatchResult = s('nada');
    void gMatchResult;
    G.gLastReceivedTime = this.pSeconds;
  }

  makeWinner(smokearg?: LValue) {
    if (smokearg === s('smoke')) {
      sendSprite(this.opponentSp, s('breakdown'));
    }
    this.gameover();
  }

  goLobby() {
    this.state = s('gameover');
  }

  BuildRobots() {
    // global gPlog
    G.gPlog = new LList();
    const rd = dot(G.gUserData, 'propertyList', 'robotDescription') as LPropList;
    let srcRobot: Shockwave3dMember | undefined;
    const ram = (pget(rd, 'ram') as LList).getAt(1);
    if (ram === s('r1')) srcRobot = member('robot1');
    else if (ram === s('r2')) srcRobot = member('robot2');
    else if (ram === s('r3')) srcRobot = member('robot3');
    G.gRobot1 = BuildRobot('robot1', rd, world(), srcRobot);
    (G.gRobot1 as Group3D).scale(2.0);
    initWeapons(G.gRobot1, rd, 1, this.playerSp);
    initWheels(G.gRobot1, rd, 1, this.playerSp);
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
      }
    }
  }

  ShowOverlay(txt: string, f1: LValue, f2?: LValue) {
    const m = member('overlay text');
    m.text = txt;
    setLinesFontSize(m, 1, 1, n(f1));
    if (lineCount(txt) > 1) {
      setLinesFontSize(m, 2, 2, n(f2));
    }
    let t1 = world().texture('Rough');
    if (t1 === undefined) {
      t1 = world().newTexture('Rough', s('fromCastMember'), member('overlay text'));
    }
    t1.quality = s('high');
    const cam = world().camera(1);
    cam.addOverlay(t1, point(375, 200), 0);
    if (f2 === undefined) {
      cam.overlay(theOVerlay('rough')!).loc = point(-440, 100);
      cam.overlay(theOVerlay('rough')!).scale = 2.2;
    } else {
      cam.overlay(theOVerlay('rough')!).regPoint = point(-215, -128) as LPoint;
    }
  }

  hideOverlay() {
    world().camera(1).removeOverlay(theOVerlay('rough')!);
    world().deleteTexture('Rough');
  }

  prepareFrame() {
    this.pCounter = add(this.pCounter, 1);
    this.checkTempo();
    const st = this.state;
    if (st === s('init')) {
      this.pCounter = 0;
      this.pCounterTime = the.milliSeconds;
      this.updateBattery();
      G.gCamera = new CameraScript();
      the.actorList.push(G.gCamera);
      this.state = s('init2');
    } else if (st === s('init2')) {
      this.pstartTime = the.milliSeconds;
      this.pFrameCounter = 0;
      this.state = s('idle');
    } else if (st === s('idle')) {
      this.checkKeys();
      this.checkCollision();
      if (mod(this.pCounter, 16) === 0) {
        this.updateBattery();
      }
    } else if (st === s('showResult')) {
      this.state = s('stopped');
    }
    this.RecycleSprites();
  }

  updateBattery() {
    const ds = sp(this.playerSp, 'damageStatus');
    const h = n(pget(ds, 'energy')) / 2.1;
    sprite(70).height = h;
    sprite(70).locV = 469 + 89 - h;
    sprite(71).locH = (145 * n(pget(ds, 'pansar'))) / 249.0 - 36;
    UpdateBatteryHeight(70, h);
    UpdatePansarWidth(71, (145 * n(pget(ds, 'pansar'))) / 249.0 - 36);
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
      return keyMap();
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
      sendSprite(this.playerSp, s('keyPressed'), map, G.gDelay);
      this.lastMap = map;
    }
  }

  keyUp() {
    const key = the.key;
    if (['0', '1', '2', '3', 'v', 'b'].some((k) => eq(key, k))) {
      const vapen = dot(G.gUserData, 'propertyList', 'robotDescription', 'vapen') as LList;
      if (eq(key, 'v')) {
        if (vapen.getOne(s('v37')) > 0) {
          (G.gCamera as CameraScript).SetView(key);
        }
      } else {
        if (eq(key, 'b')) {
          if (vapen.getOne(s('v23')) > 0) {
            (G.gCamera as CameraScript).SetView(key);
          }
        } else {
          (G.gCamera as CameraScript).SetView(key);
        }
      }
    }
  }

  endSprite() {
    for (let i = 30; i <= 50; i++) {
      puppetSprite(i, 0);
    }
    the.actorList = [];
  }

  gameover() {
    this.state = s('showResult');
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
      // There is no "goback" marker: go() to a missing marker does nothing.
      go('goback');
    } else {
      go(the.frame);
    }
  }
}

