// arena104 behavior 36 "vapen v8": the hammer. A press swings the hammer model down
// over the front (its map sprite reaching 34 px ahead of the robot); at the end of the
// swing a hit on the other robot dents its paint map where it struck and does v8's
// damage, and sparks fly where it hit a robot, wall or fence.

import { G, dot, intersects, member, sendSprite, sprite } from '../../director';
import { type Model, type ModelResource } from '../../director/s3d';
import { LList, add, lingoString, mul, num, point, rgb, sym, vector, type LPoint, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { GetAngle, getDist } from '../robotwars/s007-jump-movie';
import { PointToVector } from './s006-arena-3d';
import { DEG, eq, sp, world } from './weapon-util';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { arenaFixes } from './enhancements';

// global gPartDescription, world

export class VapenV8 {
  m: Model;
  state: LSymbol;
  n: LValue = undefined;
  angle: number;
  dangle: number;
  pr: ModelResource | undefined = undefined;
  gnista: number | undefined = undefined;
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  /** Which way the swing turns the model: the original's 1, -1 for the fix in fire(); 0 until the first swing. */
  swing = 0;

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
    let suffix = '1';
    if (rn === 2) {
      suffix = '2';
    }
    sprite(this.sp).ink = 8;
    this.m = world().model(lingoString((dot(G.gPartDescription, 'v8', 'model') as LList).getAt(1)) + suffix);
    this.weaponNumber = n;
    this.angle = 0;
    this.dangle = 2;
    // The sparks' resource is only made the first time; with a "gnist<sp>" model left
    // over, pr stays VOID (and a hit's sparks are a script error, as in the original).
    if (world().model('gnist' + this.sp) === undefined) {
      const pm = world().newModel('gnist' + this.sp);
      pm.parent = world().group('world');
      const pr = (this.pr = world().newModelResource('gnist' + this.sp, sym('particle')));
      const ttexture = world().texture('gnist1');
      if (!ttexture) {
        pr.texture = world().newTexture('gnist1', sym('fromCastMember'), member('span'));
      } else {
        pr.texture = world().texture('gnist1');
        pr.texture.renderFormat = sym('rgba8888');
      }
      pm.resource = pr;
      pr.emitter.numParticles = 1;
      pr.lifeTime = 500;
      pr.colorRange.start = rgb(170, 212, 153);
      pr.colorRange.end = rgb(0, 0, 0);
      pr.tweenMode = sym('age');
      pr.sizeRange.start = 20;
      pr.sizeRange.end = 1;
      pr.blendRange.start = 100;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('burst');
      pr.emitter.loop = 0;
      pr.emitter.angle = 60;
      pr.emitter.minSpeed = 800.0;
      pr.emitter.maxSpeed = 1000.0;
      pr.emitter.direction = vector(0, 1, 0);
      pr.gravity = vector(0.0, -100, 0.0);
    }
    sprite(this.sp).member = member('v1');
    sprite(this.sp).ink = 8;
    this.state = sym('idle');
  }

  /** No buttondown argument: releasing the key swings too, if the last swing is over. */
  fire(_buttondown?: LValue) {
    if (this.state === sym('idle')) {
      // Enhancement (enhancements.ts, ?quirks=axe): the axe is modelled to sit at the
      // back and swing forward over the robot. Mounted anywhere else it isn't turned
      // round, so the original swung it backwards, over its own robot, while the hit is
      // checked in front; the fix swings it the other way, forward. (The robot's parts
      // are only known once it's built, after this behavior's constructor.)
      if (!this.swing) this.swing = arenaFixes.axeForward && !eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v8')), sym('b')) ? -1 : 1;
      this.angle = 0;
      this.dangle = 1;
      this.state = sym('hit');
      playsound('miss1', 255);
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('hit'):
        this.angle = this.angle + this.dangle;
        this.dangle = this.dangle + 4.2;
        this.m.rotate(vector(0, 0, 100), vector(1, 0, 0), this.swing * this.dangle);
        {
          const ra = num(sp(this.robotSp, 'angle'));
          sprite(this.sp).loc = add(sprite(this.robotSp).loc, point(34 * Math.cos(ra * DEG), 34 * Math.sin(ra * DEG))) as LPoint;
        }
        for (let i = 15; i <= 18; i++) {
          if (intersects(this.sp, i)) {
            this.gnista = 1;
          }
        }
        for (let i = 25; i <= 26; i++) {
          if (intersects(this.sp, i)) {
            this.gnista = 2;
          }
        }
        if (this.angle > 140) {
          if (intersects(this.sp, this.robot2Sp)) {
            let alpha = num(GetAngle(sprite(this.robot2Sp).locH - sprite(this.sp).locH, sprite(this.robot2Sp).locV - sprite(this.sp).locV));
            const dist = 5 * num(getDist(sprite(this.robot2Sp).locH - sprite(this.sp).locH, sprite(this.robot2Sp).locV - sprite(this.sp).locV));
            alpha = alpha - num(sp(this.robot2Sp, 'angle')) + 90;
            sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v8', 'skada'), sym('buckle'), point(dist * Math.cos(alpha * DEG), dist * Math.sin(alpha * DEG)));
            this.gnista = 1;
          }
          this.state = sym('done');
        }
        break;
      case sym('done'):
        this.state = sym('moveBack');
        if (num(this.gnista) > 0) {
          if (this.gnista === 1) {
            playsound('hit_33', 255);
          }
          if (this.gnista === 2) {
            playsound('fence_krock', 255);
          }
          this.pr!.emitter.numParticles = 10;
          const pos = mul(5, PointToVector(sprite(this.sp).loc, -50));
          this.pr!.emitter.region = new LList([pos]);
          this.gnista = 0;
        }
        break;
      case sym('moveBack'):
        this.m.rotate(vector(0, 0, 100), vector(1, 0, 0), -this.swing * this.dangle);
        this.dangle = this.dangle - 4.2;
        this.angle = this.angle - this.dangle;
        sprite(this.sp).loc = point(-1000, -1000);
        if (this.angle <= 0) {
          this.state = sym('idle');
        }
        break;
    }
  }
}
