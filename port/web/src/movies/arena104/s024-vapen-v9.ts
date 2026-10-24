// arena104 behavior 24 "vapen v9": the claw. Holding the key closes the two jaws; if
// they close on the other robot (in a match) it is held fast 40 px ahead (fasten)
// while this robot slows, until the key is let go or 10 s pass. The player's side
// decides and tells the opponent ("fastiklo" / "lossiklo" with both robots' places).

import { G, dot, intersects, member, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { type Model } from '../../director/s3d';
import { LList, lingoString, num, point, sym, vector, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { GetAngle, getDist } from '../robotwars/s007-jump-movie';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { eq, sendToOpponent, sp, world } from './weapon-util';

// global gPartDescription, world, gUseUDP, gOpponent, gGamePlace, muInstance

export class VapenV9 {
  m1: Model;
  m2: Model;
  state: LSymbol;
  n: LValue = undefined;
  angle: number;
  dangle: number;
  suffix: string;
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  pTime: number | undefined = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    switch (this.robotSp) {
      case 10:
        this.robot2Sp = 20;
        break;
      default:
        this.robot2Sp = 10;
    }
    this.suffix = '1';
    if (rn === 2) {
      this.suffix = '2';
    }
    sprite(this.sp).ink = 8;
    const models = dot(G.gPartDescription, 'v9', 'model') as LList;
    this.m1 = world().model(lingoString(models.getAt(1)) + this.suffix);
    this.m2 = world().model(lingoString(models.getAt(2)) + this.suffix);
    this.weaponNumber = n;
    this.angle = 0;
    this.m1.transform.rotation = vector(0, -this.angle, 0);
    this.m2.transform.rotation = vector(0, this.angle, 0);
    this.dangle = 5;
    this.state = sym('init');
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        this.pTime = the.milliSeconds;
        this.state = sym('press');
      }
    } else {
      if (this.state === sym('fast')) {
        sendSprite(this.robot2Sp, 'release');
        sendSprite(this.robotSp, 'makenormal');
        if (this.robotNumber === 1) {
          this.releaseklo();
        }
        sprite(this.robotSp).member = member('rob1');
      }
      this.state = sym('release');
    }
  }

  /** The claw caught the other robot (here, or the opponent's claw: the "fastiklo" message). */
  hakafast() {
    playsound('klosound', 255);
    const dx = sprite(this.robot2Sp).locH - sprite(this.robotSp).locH;
    const dy = sprite(this.robot2Sp).locV - sprite(this.robotSp).locV;
    let dist = num(getDist(dx, dy));
    dist = 40;
    sendSprite(this.robot2Sp, 'fasten', dist, GetAngle(dx, dy));
    sendSprite(this.robotSp, 'makeslow');
    sprite(this.robotSp).member = member('robclaw');
    this.state = sym('fast');
  }

  prepareFrame() {
    const angle1 = sprite(this.robotSp).rotation;
    sprite(this.sp).loc = sprite(this.robotSp).loc;
    sprite(this.sp).rotation = angle1 + 90;
    const hitrobot = intersects(this.sp, this.robot2Sp);
    switch (this.state) {
      case sym('init'):
        if (eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v9')), sym('f'))) {
          sprite(this.sp).member = member('v12 f', 1);
        } else {
          sprite(this.sp).member = member('v12 b', 1);
        }
        this.state = sym('idle');
        break;
      case sym('press'):
        if (this.angle < 45) {
          this.angle = this.angle + this.dangle;
          if (!eq(G.gGamePlace, sym('backyard'))) {
            if (hitrobot && this.angle > 20) {
              if (!eq(sp(this.robotSp, 'state'), sym('slow'))) {
                this.angle = 45;
                if (this.robotNumber === 1) {
                  this.hakafast();
                  const r1pos = point(num(sp(10, 'x')), num(sp(10, 'y')));
                  const r1rot = sp(10, 'angle');
                  const r2pos = point(num(sp(20, 'x')), num(sp(20, 'y')));
                  const r2rot = sp(20, 'angle');
                  sendToOpponent('fastiklo', sym('sp'), this.sp, sym('r1pos'), r1pos, sym('r1rot'), r1rot, sym('r2pos'), r2pos, sym('r2rot'), r2rot);
                }
              }
            }
          }
          this.m1.transform.rotation = vector(0, -this.angle, 0);
          this.m2.transform.rotation = vector(0, this.angle, 0);
        }
        break;
      case sym('fast'):
        sendAllSprites('lightup', this.robotNumber);
        if (this.robotNumber === 1) {
          if (the.milliSeconds > this.pTime! + 10000) {
            this.releaseklo();
            sendSprite(this.robot2Sp, 'release');
            sendSprite(this.robotSp, 'makenormal');
            sprite(this.robotSp).member = member('rob1');
            this.state = sym('release');
          }
        }
        break;
      case sym('release'):
        if (this.angle > 0) {
          this.angle = this.angle - this.dangle;
          this.m1.transform.rotation = vector(0, -this.angle, 0);
          this.m2.transform.rotation = vector(0, this.angle, 0);
        } else {
          this.state = sym('idle');
        }
        break;
    }
  }

  releaseklo() {
    const r1pos = point(num(sp(10, 'x')), num(sp(10, 'y')));
    const r1rot = sp(10, 'angle');
    const r2pos = point(num(sp(20, 'x')), num(sp(20, 'y')));
    const r2rot = sp(20, 'angle');
    sendToOpponent('lossiklo', sym('sp'), this.sp, sym('r1pos'), r1pos, sym('r1rot'), r1rot, sym('r2pos'), r2pos, sym('r2rot'), r2rot);
  }
}
