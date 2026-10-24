// arena104 behavior 3 "robot behavior", on sprites 10 and 20: a robot's driving,
// collisions, battery, damage, falling off the roof, tipping into the pit, and its
// part in a match (losing, the opponent's position updates). The robot moves as a
// rotated sprite over the hidden 2D collision map (docs/collision.md); its 3D model
// follows (UpdateRobot). Sprite 10 is the player in Training and player 1's robot in a
// match; sprite(sp + 1) carries the wheel behavior, sp + 2..4 the weapons.
//
// The driving was first ported in src/robot.ts and checked against dirplayer tick by
// tick; port/tools/physics-trace.mjs now checks this translation the same way.

import { Behavior, G, dot, intersects, member, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { DImage, rectOf, type DRect } from '../../director/image';
import { vector, type Group3D, type Vector } from '../../director/s3d';
import {
  LList, LPropList, LSymbol, PI, abs, add, char, chars, div, duplicate, integer, lf, lingoString, mul, propList, random, rgb, sub, sym, value, voidp,
  type LValue,
} from '../../lingo';
import { calculateMaxSpeed } from '../robotwars/s013-robot-descriptions';
import { playsound } from '../robotwars/s030-soundscript';
import { updateRobotTexture } from '../robotwars/s006-3d-scripts';
import { FindLineIntersection, PointToVector, VectorToPoint, getOrtoDist, rankatspel } from './s006-arena-3d';
import { eq, n, pget, pset, sp as spProp, setSp, world } from './util';

// global gRobot1, gRobot2, gCamera, gPlayerNumber, muInstance, gUseUDP, gWinnerID,
// gWinnerName, dt, world, gUserData, gopponentdata, gMatchResult, gOpponent,
// gMatchscore, gPlayer, gPlayer1Data, gPlayer2Data, gPartDescription, gGamePlace,
// gWonGames, gLostGames, gPlayer1map, gPlayer2map, gBatt, gShield

const s = (name: string) => sym(name);
const rad = (deg: number) => (deg * PI) / 180;

export class RobotBehavior extends Behavior {
  sp: number = undefined as unknown as number;
  sp2: number = undefined as unknown as number;
  state: LSymbol | undefined = undefined;
  grav: number = undefined as unknown as number;
  gir: LValue = undefined;
  prestate: LValue = undefined;
  robotNumber: number = undefined as unknown as number;
  x: number = undefined as unknown as number;
  y: number = undefined as unknown as number;
  dx: number = undefined as unknown as number;
  dy: number = undefined as unknown as number;
  z: number = undefined as unknown as number;
  dz: number = undefined as unknown as number;
  Dir: number = undefined as unknown as number;
  rikt: Vector | undefined = undefined;
  lastx: number = undefined as unknown as number;
  lasty: number = undefined as unknown as number;
  lastangle: number = undefined as unknown as number;
  dangle: number = undefined as unknown as number;
  speed: number = undefined as unknown as number;
  angle: number = undefined as unknown as number;
  anglex: number = undefined as unknown as number;
  fart: number = undefined as unknown as number;
  anglez: number = undefined as unknown as number;
  damageStatus: LPropList | undefined = undefined;
  suffix: string = undefined as unknown as string;
  acceleration: number = undefined as unknown as number;
  slip: number = undefined as unknown as number;
  turnRadius: number = undefined as unknown as number;
  friction: number = undefined as unknown as number;
  battkonst: number = undefined as unknown as number;
  motorkonst: number = undefined as unknown as number;
  keymap: string = undefined as unknown as string;
  lastKeymap: string | undefined = undefined;
  pRobot: Group3D = undefined as unknown as Group3D;
  robotRD: LPropList = undefined as unknown as LPropList;
  bomb: number = undefined as unknown as number;
  keyQueue: LList = undefined as unknown as LList;
  torque: number = undefined as unknown as number;
  mapA: DImage = undefined as unknown as DImage;
  mapB: DImage = undefined as unknown as DImage;
  vikt: number = undefined as unknown as number;
  pFireTime: number = undefined as unknown as number;
  counter: number = undefined as unknown as number;
  krockNum: number = undefined as unknown as number;
  fastdist: number = undefined as unknown as number;
  fastangle: number = undefined as unknown as number;
  fastangle2: number = undefined as unknown as number;
  pFire: number = undefined as unknown as number;
  hoppmove: number = undefined as unknown as number;
  minisp: number = undefined as unknown as number;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.grav = 0.5;
    this.state = s('init');
    this.speed = 0;
    G.gBatt = 0;
    G.gShield = 0;
    this.bomb = 0;
  }

  InitRobot() {
    sendAllSprites('stopshoot');
    this.x = -1200;
    this.y = 0.0;
    this.z = -530;
    this.dx = 0.0;
    this.dy = 0.0;
    this.dz = 0.0;
    G.dt = 2.0;
    this.speed = 0.0;
    this.krockNum = 0;
    this.fart = 0.0;
    this.angle = 0.0;
    this.anglex = 0.0;
    this.anglez = 0;
    this.acceleration = 0.6;
    this.slip = 0.9;
    this.slip = spProp(this.sp + 1, 'slip');
    this.friction = 0.95;
    this.turnRadius = 2.5;
    this.turnRadius = spProp(this.sp + 1, 'turnRadius');
    this.dangle = 0.0;
    this.torque = 0.0;
    this.counter = 0;
    this.pFireTime = the.milliSeconds;
    this.keymap = '00000000';
    this.lastKeymap = this.keymap;
    this.pRobot = G.gRobot1;
    if (this.sp === 10) {
      this.suffix = '1';
      this.x = 1200;
      this.sp2 = 20;
      this.sp = 10;
      this.angle = 270;
      this.y = 1200;
      this.pRobot = G.gRobot1;
      this.robotNumber = 1;
    } else {
      this.suffix = '2';
      this.x = -1200;
      this.sp2 = 10;
      this.sp = 20;
      this.angle = 90;
      this.y = -1200;
      this.pRobot = G.gRobot2;
      this.robotNumber = 2;
    }
    if (eq(G.gPlayerNumber, 2)) {
      this.robotNumber = 2;
      this.pRobot = G.gRobot2;
      if (this.sp === 20) {
        this.robotNumber = 1;
        this.pRobot = G.gRobot1;
      }
    }
    this.suffix = '1';
    if (this.robotNumber === 2) {
      this.suffix = '2';
    }
    let srcMap: DImage = memberImage('map' + this.robotNumber + 'A');
    this.mapA = new DImage(srcMap.width, srcMap.height, 8);
    this.mapA.copyPixels(srcMap, srcMap.rect, srcMap.rect);
    srcMap = memberImage('map' + this.robotNumber + 'B');
    this.mapB = new DImage(srcMap.width, srcMap.height, 8);
    this.mapB.copyPixels(srcMap, srcMap.rect, srcMap.rect);
    let pansar: LValue;
    if (this.robotNumber === 1) {
      this.robotRD = dot(G.gUserData, 'propertyList', 'robotDescription');
      pansar = dot(G.gUserData, 'propertyList', 'pansar');
      this.damageStatus = propList(s('energy'), lf(100.0), s('pansar'), dot(G.gUserData, 'propertyList', 'pansar'));
    }
    if (this.robotNumber === 2) {
      this.robotRD = dot(G.gopponentdata, 'propertyList', 'robotDescription');
      pansar = dot(G.gopponentdata, 'propertyList', 'pansar');
      this.damageStatus = propList(s('energy'), lf(100.0), s('pansar'), dot(G.gopponentdata, 'propertyList', 'pansar'));
    }
    this.vikt = n(this.calculateUsedWeight2(this.robotRD, pansar));
    const motor = pget(this.robotRD, 'motor') as LList;
    const kw = n(calculateMaxSpeed(this.vikt, motor.getAt(1)));
    this.friction = (0.935 + 0.09 * kw) * this.friction;
    let battpart = 0;
    const batteri = pget(this.robotRD, 'batteri') as LList;
    for (let b = 1; b <= batteri.count; b++) {
      const q = batteri.getAt(b);
      if (q === s('b1')) battpart = battpart + 2.0;
      else if (q === s('b2')) battpart = battpart + 4.0;
      else if (q === s('b3')) battpart = battpart + 8.0;
    }
    put('battpart', battpart);
    this.battkonst = 5.0 / battpart;
    const ram = (pget(this.robotRD, 'ram') as LList).getAt(1);
    if (ram === s('r1')) this.battkonst = 0.7 * this.battkonst;
    else if (ram === s('r2')) this.battkonst = 1.2 * this.battkonst;
    else if (ram === s('r3')) this.battkonst = 1.7 * this.battkonst;
    this.motorkonst = 0.001 * n(pget((G.gPartDescription as LPropList).getProp(motor.getAt(1)), 'kwh'));
    updateRobotTexture(world(), this.pRobot, 'map' + this.robotNumber + 'A', this.robotRD, 1, this.robotNumber, this.mapA);
    if ((pget(this.robotRD, 'torn') as LList).count > 0) {
      updateRobotTexture(world(), this.pRobot, 'map' + this.robotNumber + 'B', this.robotRD, 2, this.robotNumber, this.mapB);
    }
    this.keyQueue = new LList();
    this.pRobot.parent!.worldPosition = vector(this.x * 5, this.z, this.y * 5);
    this.pRobot.transform.rotation = vector(this.anglex, 0, 0);
    this.pRobot.parent!.transform.rotation = vector(0, -this.angle + 90, this.anglez);
    this.state = s('move');
  }

  calculateUsedWeight2(rd: LPropList, pa: LValue): LValue {
    let usedWeight: LValue = 0;
    for (const q of rd) {
      if (eq(pget(rd, 'wpnPos'), q)) {
        continue;
      }
      for (const part of q as LList) {
        const r = (G.gPartDescription as LPropList).getaProp(part);
        if (r !== undefined) {
          const t = pget(r, 'vikt');
          if (t !== undefined) {
            usedWeight = add(usedWeight, t);
          }
          continue;
        }
        put(' ' + String(part) + ' har ingen vikt');
      }
    }
    const p = div(pa, lf(1.5));
    usedWeight = add(usedWeight, p);
    return usedWeight;
  }

  spendEnergy(Amount: number) {
    const ds = this.damageStatus!;
    pset(ds, 'energy', lf(n(pget(ds, 'energy')) - Amount * this.battkonst));
    if (n(pget(ds, 'energy')) < 0) {
      if (this.robotNumber === 1) {
        pset(ds, 'energy', 0);
        this.state = s('battery');
        G.gBatt = n(G.gBatt) + 1;
        if (G.gGamePlace !== s('backyard')) {
          G.muInstance.sendNetMessage(
            propList(s('recipients'), G.gOpponent, s('subject'), 'nobatt', s('content'), propList(s('checksum'), random(10000)), s('udp'), G.gUseUDP),
          );
        }
      } else {
        pset(ds, 'energy', random(4));
      }
    }
  }

  damage(Amount: LValue, how?: LValue, pt?: LValue) {
    sendAllSprites('lightup', this.robotNumber);
    const ds = this.damageStatus!;
    if (this.robotNumber === 1) {
      if (eq(G.gShield, 1)) {
        Amount = mul(Amount, 0.8);
      }
      pset(ds, 'pansar', sub(pget(ds, 'pansar'), Amount));
      if (n(pget(ds, 'pansar')) <= 0) {
        pset(ds, 'pansar', 0);
      }
      if (how !== s('kami') && this.bomb === 0) {
        if (n(pget(ds, 'pansar')) <= 0) {
          pset(ds, 'pansar', 0);
          this.MakeLoser();
          if (G.gGamePlace !== s('backyard')) {
            setSp(this.sp2, 'state', s('over'));
            sendAllSprites('stopshoot');
          } else {
            setSp(this.sp, 'state', s('broken'));
          }
        }
      } else {
        this.bomb = 1;
      }
    }
    const ink39 = propList(s('ink'), 39);
    const name = 'map' + this.robotNumber;
    if (how === s('buckle')) {
      let dstRect = duplicate(this.mapA.rect);
      const p = pt as { locH: LValue; locV: LValue };
      dstRect = offsetDRect(dstRect, 90 - n(p.locH), 100 + n(p.locV));
      copyInk(this.mapA, 'bucklaB', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'A', this.robotRD, 1, this.robotNumber, this.mapA);
    } else if (how === s('torn')) {
      let dstRect = duplicate(this.mapB.rect);
      dstRect = offsetDRect(dstRect, random(120) - 40, random(180) - 40);
      copyInk(this.mapB, 'bucklaA', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'B', this.robotRD, 2, this.robotNumber, this.mapB);
    } else if (how === s('dirt')) {
      let dstRect = duplicate(this.mapA.rect);
      dstRect = offsetDRect(dstRect, random(120) - 20, random(200) - 40);
      copyInk(this.mapA, 'bucklaA', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'A', this.robotRD, 1, this.robotNumber, this.mapA);
      dstRect = duplicate(this.mapB.rect);
      dstRect = offsetDRect(dstRect, random(120) - 20, random(200) - 40);
      copyInk(this.mapB, 'bucklaA', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'B', this.robotRD, 2, this.robotNumber, this.mapB);
    } else if (how === s('splitter')) {
      let dstRect = duplicate(this.mapA.rect);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapA, 'splitter', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'A', this.robotRD, 1, this.robotNumber, this.mapA);
      dstRect = duplicate(this.mapB.rect);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapB, 'splitter', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'B', this.robotRD, 2, this.robotNumber, this.mapB);
    } else if (how === s('bomb')) {
      let dstRect = duplicate(this.mapA.rect);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapA, 'bomb', dstRect, ink39);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapA, 'bomb', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'A', this.robotRD, 1, this.robotNumber, this.mapA);
      dstRect = duplicate(this.mapB.rect);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapB, 'bomb', dstRect, ink39);
      dstRect = offsetDRect(dstRect, random(80) - 40, random(100));
      copyInk(this.mapB, 'bomb', dstRect, ink39);
      updateRobotTexture(world(), this.pRobot, name + 'B', this.robotRD, 2, this.robotNumber, this.mapB);
    }
  }

  slippery(k: number) {
    this.slip = k + (1.0 - k) * n(spProp(this.sp + 1, 'slip'));
  }

  /** The frame script hands the keys over (with the network delay) whenever they change. */
  keyPressed(map: string, tdelay: LValue) {
    const st = this.state;
    if (st === s('move') || st === s('slow') || st === s('fast') || st === s('hopp') || st === s('battery') || st === s('mini') || st === s('scrambled')) {
      if (st === s('scrambled')) {
        map = this.scramble(map);
      }
      this.keyQueue.add(propList(s('keymap'), map, s('time'), add(the.milliSeconds, tdelay)));
    }
  }

  CheckKeyQueue() {
    if (this.keyQueue.count > 0) {
      if (the.milliSeconds > n(pget(this.keyQueue.getAt(1), 'time'))) {
        const q = this.keyQueue.getAt(1);
        this.keyQueue.deleteAt(1);
        this.keyEvent(pget(q, 'keymap') as string, pget(q, 'time'));
      }
    }
  }

  keyEvent(map: string, tTime?: LValue) {
    void tTime;
    if (this.lastKeymap === undefined) {
      return;
    }
    this.lastKeymap = this.keymap;
    this.keymap = map;
    if (this.state !== s('stunned')) {
      if (!(this.robotNumber === 1 && spProp(211, 'state') !== s('hidden'))) {
        if (!eq(char(this.keymap, 5), char(this.lastKeymap, 5))) {
          sendSprite(this.sp + 2, 'fire', eq(char(this.keymap, 5), '1') ? 1 : 0);
          sendAllSprites('lightup', this.robotNumber);
        }
        if (!eq(char(this.keymap, 6), char(this.lastKeymap, 6))) {
          sendSprite(this.sp + 3, 'fire', eq(char(this.keymap, 6), '1') ? 1 : 0);
          sendAllSprites('lightup', this.robotNumber);
        }
        if (!eq(char(this.keymap, 7), char(this.lastKeymap, 7))) {
          sendSprite(this.sp + 4, 'fire', eq(char(this.keymap, 7), '1') ? 1 : 0);
          sendAllSprites('lightup', this.robotNumber);
        }
      } else {
        this.keymap = '00000000';
      }
    }
  }

  rekyl(k: number) {
    this.dx = this.dx - k * Math.cos(rad(this.angle));
    this.dy = this.dy - k * Math.sin(rad(this.angle));
  }

  fasten(d: number, a: number) {
    if (this.state === s('mini')) {
      sendSprite(this.minisp, 'leavemini');
    }
    this.fastdist = d;
    this.fastangle = a - n(spProp(this.sp2, 'angle'));
    this.fastangle2 = this.angle - a;
    this.state = s('fast');
  }

  makeslow() {
    this.state = s('slow');
  }

  makenormal() {
    G.dt = 2.0;
    if (this.state !== s('fall') && this.state !== s('stop') && this.state !== s('over')) {
      this.state = s('move');
    }
  }

  handleFast() {
    const beta = n(spProp(this.sp2, 'angle')) + this.fastangle;
    sprite(this.sp).locH = sprite(this.sp2).locH + this.fastdist * Math.cos(rad(beta));
    sprite(this.sp).locV = sprite(this.sp2).locV + this.fastdist * Math.sin(rad(beta));
    this.angle = beta + this.fastangle2;
    sprite(this.sp).rotation = this.angle;
    const V = PointToVector(sprite(this.sp).loc, 0);
    this.x = n(V.x);
    this.y = n(V.z);
  }

  release() {
    if (this.state !== s('fall') && this.state !== s('stop') && this.state !== s('over')) {
      this.state = s('move');
    }
  }

  handleMove() {
    const dt = n(G.dt);
    const ht = 1;
    const spr = sprite(this.sp);
    let krock = 0;
    if (this.state !== s('fall') && this.state !== s('stop')) {
      if (spr.locH < 820 || spr.locH > 1580 || spr.locV < -200 || spr.locV > 600) {
        this.fall();
      }
    }
    if (intersects(this.sp, 25)) {
      if (this.dx < 0) {
        krock = 2;
        this.dx = 0.8 * Math.abs(this.dx);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dy > 0));
        this.speed = -0.5 * this.speed;
      }
    }
    if (intersects(this.sp, 26)) {
      if (this.dx > 0) {
        krock = 2;
        this.dx = -0.8 * Math.abs(this.dx);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dy < 0));
        this.speed = -0.5 * this.speed;
      }
    }
    if (intersects(this.sp, 15)) {
      if (this.dx < 0) {
        krock = 1;
        this.dx = 0.8 * Math.abs(this.dx);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dy > 0));
        this.speed = -0.6 * this.speed;
      }
    }
    if (intersects(this.sp, 16)) {
      if (this.dx > 0) {
        krock = 1;
        this.dx = -0.8 * Math.abs(this.dx);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dy < 0));
        this.speed = -0.6 * this.speed;
      }
    }
    if (intersects(this.sp, 17)) {
      if (this.dy < 0) {
        krock = 1;
        this.dy = 0.8 * Math.abs(this.dy);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dx < 0));
        this.speed = -0.6 * this.speed;
      }
    }
    if (intersects(this.sp, 18)) {
      if (this.dy > 0) {
        krock = 1;
        this.dy = -0.8 * Math.abs(this.dy);
        this.x = this.lastx;
        this.y = this.lasty;
        this.angle = this.lastangle;
        this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * +(this.dx > 0));
        this.speed = -0.6 * this.speed;
      }
    }
    if (krock === 1) {
      playsound('regular_krock', 255);
      sendAllSprites('lightup', this.robotNumber);
    }
    if (krock === 2) {
      playsound('fence_krock', 255);
      sendAllSprites('lightup', this.robotNumber);
    }
    this.x = this.x + this.dx;
    this.y = this.y + this.dy;
    this.z = this.z + this.dz;
    if (this.z < -530) {
      this.z = -530;
      this.dz = 0.0;
    }
    if (this.state !== s('battery')) {
      if (this.state !== s('mini')) {
        const k = this.keymap;
        if (k.charAt(0) === '1') {
          this.dangle = this.dangle - (this.turnRadius * dt) / 6;
          if (this.dangle < -this.turnRadius * dt) {
            this.dangle = -this.turnRadius * dt;
          }
          this.angle = this.angle + ht * this.dangle * (1.0 + Math.abs(this.speed) / 20);
          this.speed = 0.96 * (this.speed + 0.2);
        }
        if (k.charAt(1) === '1') {
          this.dangle = this.dangle + (this.turnRadius * dt) / 6;
          if (this.dangle > this.turnRadius * dt) {
            this.dangle = this.turnRadius * dt;
          }
          this.angle = this.angle + ht * this.dangle * (1.0 + Math.abs(this.speed) / 20);
          this.speed = 0.96 * (this.speed + 0.2);
        }
        this.dangle = this.dangle * 0.7;
        this.angle = this.angle + this.torque;
        this.torque = 0.94 * this.torque;
        if (k.charAt(2) === '1') {
          this.speed = this.speed + this.acceleration * dt;
          this.spendEnergy(this.motorkonst * this.battkonst);
        }
        if (k.charAt(3) === '1') {
          this.speed = this.speed - this.acceleration * dt;
          this.spendEnergy(this.motorkonst * this.battkonst);
        }
      }
    }
    if (this.angle < 0) {
      this.angle = this.angle + 360;
    }
    if (this.angle > 360) {
      this.angle = this.angle - 360;
    }
    // `a` (the angle, negated when reversing) is never used.
    this.dx = this.slip * this.dx + (1 - this.slip) * this.speed * Math.cos(rad(this.angle));
    this.dy = this.slip * this.dy + (1 - this.slip) * this.speed * Math.sin(rad(this.angle));
    this.fart = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    this.speed = this.speed * this.friction;
    spr.loc = VectorToPoint(vector(this.x, 0, this.y));
    spr.rotation = this.angle;
    if (intersects(this.sp, 5)) {
      if (the.milliSeconds > this.pFireTime + 550) {
        this.pFire = 1;
        playsound('flamethrow', 50 + random(155));
        sendAllSprites('initFire');
        if (n(getOrtoDist(spr.loc, sprite(5).loc)) < 40) {
          sendSprite(this.sp, 'damage', 7, s('dirt'));
        }
        this.pFireTime = the.milliSeconds;
      }
    } else {
      if (this.pFire === 1) {
        sendAllSprites('stopFire');
        this.pFire = 0;
      }
    }
    if (this.z > -530) {
      this.x = this.x + this.dx * dt;
      this.y = this.y + this.dy * dt;
      this.dx = n(this.rikt!.x) * this.hoppmove;
      this.dy = n(this.rikt!.z) * this.hoppmove;
      this.grav = this.grav * 1.1;
      this.dz = this.dz - this.grav;
      this.z = this.z + this.dz;
      this.anglex = this.anglex * 0.9;
      this.anglez = this.anglez * 0.9;
      if (this.z <= -530) {
        this.anglex = 0;
        this.anglez = 0;
        this.dx = 0;
        this.dy = 0;
        this.dz = 0;
        this.z = -530;
      }
    } else {
      if (this.anglex !== 0) {
        this.anglex = 0;
      }
      if (this.anglez !== 0) {
        this.anglez = 0;
      }
    }
  }

  hit(dx0: number, dy0: number, angle0: number, speed0: number) {
    this.krockNum = this.krockNum + 1;
    this.x = this.lastx;
    this.y = this.lasty;
    this.angle = this.lastangle;
    const k = (n(spProp(this.sp2, 'vikt')) * 1.0) / (this.vikt + n(spProp(this.sp2, 'vikt')));
    this.dx = -0.2 * this.dx + 2 * k * n(dx0);
    this.dy = -0.2 * this.dy + 2 * k * n(dy0);
    if (this.krockNum % 5 === 0) {
      const drx = sprite(this.sp).locH - sprite(this.sp2).locH;
      const dry = sprite(this.sp).locV - sprite(this.sp2).locV;
      const dr = this.getDist(drx, dry);
      if (dr !== 0) {
        this.dx = this.dx + (0.1 * drx) / Math.sqrt(dr);
        this.dy = this.dy + (0.1 * dry) / Math.sqrt(dr);
      }
    }
    let d = this.angle - n(angle0);
    if (d < -180) {
      d = d + 360;
    }
    if (d > 180) {
      d = d - 360;
    }
    const x2 = n(spProp(this.sp2, 'x'));
    const y2 = n(spProp(this.sp2, 'y'));
    const a2 = n(spProp(this.sp2, 'angle'));
    const t = n(
      FindLineIntersection(
        this.x, this.y, this.x + 10 * Math.cos(rad(this.angle)), this.y + 10 * Math.sin(rad(this.angle)),
        x2, y2, x2 + 10 * Math.cos(rad(a2)), y2 + 10 * Math.sin(rad(a2)),
      ),
    );
    this.torque = -0.005 * d * t * n(speed0) * k;
    this.torque = Math.max(-6, Math.min(6, this.torque));
    this.dangle = 0;
    if (Math.abs(n(speed0)) + Math.abs(this.speed) < 7) {
      this.torque = 0;
    }
    this.speed = 0.0 * this.speed;
  }

  getDist(dx: number, dy: number) {
    return dx * dx + dy * dy;
  }

  tip() {
    put('tip');
    this.dx = 0.45 * (sprite(6).locH - sprite(this.sp).locH);
    this.dy = 0.45 * (sprite(6).locV - sprite(this.sp).locV);
    this.dz = 0.0;
    this.state = s('tip');
  }

  fall() {
    sendAllSprites('release');
    this.state = s('fall');
    this.grav = 0.5;
    if (this.dx > 0) {
      this.Dir = 1;
    } else {
      this.Dir = -1;
    }
    sprite(this.sp).locV = -1000;
  }

  hopp(mina: string, Amount: number) {
    this.grav = 3;
    this.dz = 25;
    const TRN = this.pRobot.getWorldTransform();
    const ROBPOS = TRN.position;
    const MINPOS = world().model(mina).worldPosition;
    this.rikt = sub(ROBPOS, MINPOS) as Vector;
    this.rikt.normalize();
    this.anglex = TRN.zAxis.dot(this.rikt) * 20;
    this.anglez = -TRN.xAxis.dot(this.rikt) * 20;
    this.hoppmove = n(Amount) / 20.0;
    this.z = -520;
  }

  HandleTip() {
    const dt = n(G.dt);
    this.x = this.x + this.dx * dt;
    this.y = this.y + this.dy * dt;
    this.dx = 0.8 * this.dx;
    this.dy = 0.8 * this.dy;
    this.z = this.z + this.dz * dt;
    this.anglex = this.anglex + 5.0;
    this.dz = this.dz - 1.5;
    if (this.dz < -30) {
      this.dz = 0;
      this.MakeLoser();
      this.state = s('stop');
    }
  }

  HandleFall() {
    const dt = n(G.dt);
    this.state = s('fall');
    this.x = this.x + this.dx * dt;
    this.y = this.y + this.dy * dt;
    this.dx = 0.95 * this.dx;
    this.dy = 0.95 * this.dy;
    this.dx = this.dx + this.Dir / 10.0;
    this.z = this.z + this.dz * dt;
    this.anglex = this.anglex + 5.0;
    this.grav = this.grav * 1.02;
    this.dz = this.dz - this.grav;
    sprite(this.sp).locV = -1000 * n(value(this.suffix));
    if (this.z < -70000) {
      world().model('explosion').transform.position = world().group('robot' + this.suffix).worldPosition;
      world().modelResource('explosion').emitter.numParticles = 50;
      this.MakeLoser();
      playsound('krasch11', 255);
      this.state = s('stop');
    }
  }

  setrob(pos0: { locH: LValue; locV: LValue }, rot0: LValue) {
    this.x = n(pos0.locH);
    this.y = n(pos0.locV);
    this.angle = n(rot0);
  }

  MakeLoser() {
    sendAllSprites('stopshoot');
    if (G.gMatchResult !== s('nada')) {
      return;
    }
    if (G.gGamePlace === s('backyard')) {
      this.breakdown();
      sendSprite(0, 'gameover');
      return;
    }
    if (this.state !== s('hopp')) {
      sendAllSprites('stopshoot');
      this.state = s('broken');
    } else {
      this.prestate = s('broken');
    }
    if (this.robotNumber === 1) {
      G.gWinnerID = pget(G.gopponentdata, 'robotid');
      G.gWinnerName = pget(G.gopponentdata, 'robotname');
      G.gMatchResult = s('lost');
      G.gLostGames = n(G.gLostGames) + 1;
      if (rankatspel()) {
        if (n(G.gWonGames) < n(G.gLostGames)) {
          const diff = abs(sub(dot(G.gopponentdata, 'score'), dot(G.gUserData, 'score')));
          if (n(dot(G.gopponentdata, 'score')) < n(dot(G.gUserData, 'score'))) {
            const mresult = integer(sub(mul(-0.25, diff), 10));
            G.gMatchscore = mresult;
          } else {
            G.gMatchscore = -10;
          }
        }
      } else {
        G.gMatchscore = 0;
      }
      if (G.gGamePlace !== s('backyard')) {
        G.muInstance.sendNetMessage(
          propList(s('recipients'), G.gOpponent, s('subject'), 'lost', s('content'), propList(s('checksum'), random(10000), s('sp'), this.sp2), s('udp'), G.gUseUDP),
        );
      }
    } else {
      G.gWinnerID = pget(G.gUserData, 'robotid');
      G.gWinnerName = pget(G.gUserData, 'robotname');
      G.gMatchResult = s('won');
    }
    this.breakdown();
    if (this.robotNumber === 1) {
      sendSprite(0, 'gameover');
      sendSprite(211, 'addChatLine', lingoString(G.gPlayer) + ' (' + lingoString(G.gWonGames) + ') - ' + lingoString(G.gOpponent) + '(' + lingoString(G.gLostGames) + ')');
    }
  }

  updateDamage(ds: LValue) {
    if (voidp(ds)) {
      return;
    }
    if (n(pget(ds, 'pansar')) > 250) {
      return;
    }
    pset(this.damageStatus, 'energy', pget(ds, 'energy'));
    pset(this.damageStatus, 'pansar', pget(ds, 'pansar'));
  }

  receivedEvent(x0: LValue, y0: LValue, dx0: LValue, dy0: LValue, angle0: LValue, speed0: LValue, lag: LValue) {
    let l = (20 * n(lag)) / 1000.0 - 1;
    if (l < 0) {
      l = 0;
    }
    const dstx = n(x0) + l * n(dx0);
    const dsty = n(y0) + l * n(dy0);
    this.dx = n(dx0) + 0.04 * (dstx - this.x);
    this.dy = n(dy0) + 0.04 * (dsty - this.y);
    this.torque = 0;
    if (Math.abs(this.angle - n(angle0)) < 90) {
      this.angle = 0.7 * this.angle + 0.3 * n(angle0);
    } else {
      this.angle = n(angle0);
    }
    this.speed = 0.9 * this.speed + 0.1 * n(speed0);
  }

  UpdateRobot() {
    // thisWorldPosn = gRobot1.worldPosition: unused.
    this.pRobot.parent!.worldPosition = vector(this.x * 5, this.z, this.y * 5);
    this.pRobot.transform.rotation = vector(this.anglex, 0, this.anglez);
    this.pRobot.parent!.transform.rotation = vector(0, -this.angle + 90, 0);
  }

  makeSmokeFromMe() {
    let m = world().model('blacksmoke');
    if (m === undefined) {
      m = world().newModel('blacksmoke');
    }
    m.parent = this.pRobot;
    m.worldPosition = vector(0, 0, 0);
    m.worldPosition = this.pRobot.worldPosition;
    let pr = world().modelResource('blacksmoke');
    if (pr === undefined) {
      pr = world().newModelResource('blacksmoke', s('particle'));
    }
    const ttexture = world().texture('smoke1');
    if (!ttexture) {
      pr.texture = world().newTexture('smoke1', s('fromImageObject'), memberImage('smoke'));
    } else {
      pr.texture = world().texture('smoke1');
      pr.texture.renderFormat = s('rgba8888');
    }
    m.resource = pr;
    pr.lifeTime = 800;
    pr.colorRange.start = rgbOf(100, 100, 100);
    pr.colorRange.end = rgbOf(0, 0, 0);
    pr.sizeRange.start = 80.5;
    pr.sizeRange.end = 200.0;
    pr.blendRange.start = 60.0;
    pr.blendRange.end = 0.0;
    pr.emitter.loop = 1;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.angle = 20.0;
    pr.emitter.minSpeed = 600.0;
    pr.emitter.maxSpeed = 610.0;
    pr.gravity = vector(0.0, -8, 0.0);
    pr.emitter.numParticles = 100;
  }

  breakdown() {
    if (this.state === s('stop')) {
      return;
    }
    if (this.state === s('tip')) {
      return;
    }
    if (this.state === s('fall')) {
      return;
    }
    this.makeSmokeFromMe();
  }

  prepareFrame() {
    this.counter = this.counter + 1;
    this.lastx = this.x;
    this.lasty = this.y;
    this.lastangle = this.angle;
    const st = this.state;
    if (st === s('init')) {
      this.InitRobot();
      this.state = s('move');
    } else if (st === s('move')) {
      this.CheckKeyQueue();
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('fast')) {
      this.CheckKeyQueue();
      this.handleFast();
      this.UpdateRobot();
    } else if (st === s('slow')) {
      G.dt = 1.2;
      this.CheckKeyQueue();
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('broken')) {
      this.CheckKeyQueue();
      this.keymap = '00000000';
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('stop')) {
      // nothing
    } else if (st === s('over')) {
      this.CheckKeyQueue();
      this.keymap = '00000000';
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('tip')) {
      this.HandleTip();
      this.UpdateRobot();
    } else if (st === s('fall')) {
      this.HandleFall();
      this.UpdateRobot();
    } else if (st === s('hopp')) {
      // Handlehopp is defined nowhere (a script error in Director); nothing ever sets
      // the state to #hopp, so this branch never runs.
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('battery')) {
      this.CheckKeyQueue();
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('mini')) {
      this.CheckKeyQueue();
      this.moveMini();
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('stunned')) {
      this.CheckKeyQueue();
      this.keymap = '00000000';
      this.handleMove();
      this.UpdateRobot();
    } else if (st === s('scrambled')) {
      this.CheckKeyQueue();
      this.handleMove();
      this.UpdateRobot();
    }
  }

  startmini(sp0: number) {
    this.state = s('mini');
    this.minisp = sp0;
  }

  stopmini() {
    if (this.state !== s('fall') && this.state !== s('stop') && this.state !== s('over')) {
      this.state = s('move');
    }
  }

  moveMini() {
    const Keys = chars(this.keymap, 1, 4);
    sendSprite(this.minisp, 'steermini', Keys, this.speed);
  }

  emp(typ: LValue) {
    if (this.state !== s('fall') && this.state !== s('stop') && this.state !== s('over')) {
      if (this.state !== s('mini')) {
        if (typ === s('scr')) {
          this.state = s('scrambled');
        } else {
          this.state = s('stunned');
        }
        sendAllSprites('stopshoot');
      }
    }
  }

  noemp() {
    if (this.state !== s('fall') && this.state !== s('stop') && this.state !== s('over')) {
      this.state = s('move');
    }
  }

  scramble(map1: string): string {
    const Keys = map1;
    let key2 = '';
    key2 += char(Keys, 2);
    key2 += char(Keys, 1);
    key2 += char(Keys, 4);
    key2 += char(Keys, 3);
    key2 += '0';
    key2 += '0';
    key2 += '0';
    key2 += '0';
    this.keymap = key2;
    return this.keymap;
  }

  getPropertyDescriptionList() {
    const description = new LPropList();
    description.addProp(s('robotNumber'), propList(s('default'), 1, s('format'), s('integer'), s('comment'), 'Robot number:'));
    return description;
  }
}

// ---------------------------------------------------------------- helpers

/** member(name).image */
function memberImage(name: string): DImage {
  return member(name).image as DImage;
}

const rgbOf = (r: number, g: number, b: number) => rgb(r, g, b);

/** offset(rect, h, v) on a runtime rect (an image's rect). */
function offsetDRect(r: DRect, h: number, v: number): DRect {
  return rectOf(r.left + h, r.top + v, r.right + h, r.bottom + v);
}

/** img.copyPixels(member(name).image, dstRect, img.rect, [#ink: 39]): the source rect is the destination image's rect, as written. */
function copyInk(img: DImage, name: string, dstRect: DRect, props: LPropList) {
  img.copyPixels(memberImage(name), dstRect, img.rect, { ink: n(props.getaProp(sym('ink'))) });
}
