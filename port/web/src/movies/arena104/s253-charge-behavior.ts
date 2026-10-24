// arena104 behavior 253 "charge behavior": one remote charge (vapen v32), a copy of the
// RCMine model on the floor. Anything in gPlog (ploughs) shoves it along the hidden map
// until it stops or falls off; #charges from its own robot's v32 blows it up, hurting
// and throwing either robot within 1000 units.

import { G, dot, member, put, sendSprite, sprite, the, intersects } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, LPropList, mul, point, rgb, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { GetAngle } from '../robotwars/s007-jump-movie';
import { playsound } from '../robotwars/s030-soundscript';
import { PointToVector } from './s006-arena-3d';
import { DEG, eq, sendToOpponent, sp, world } from './weapon-util';

// global world, gPlog, gPartDescription, gGamePlace, muInstance, gOpponent, gUseUDP, gPlayerNumber

export class ChargeBehavior {
  sp: number;
  m: Model | undefined;
  V: LVector;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: number;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  dz: number;
  pstartTime: number;
  state: LSymbol;
  robotSp: number;
  robot2Sp: number;

  constructor(sp0: number, _name: string, v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    this.V = v0;
    this.z = -530;
    this.dz = 0;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    let suffix: string;
    if (rsp === 10) {
      this.robot2Sp = 20;
      suffix = '1';
    } else {
      this.robot2Sp = 10;
      suffix = '2';
    }
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        suffix = '2';
      } else {
        suffix = '1';
      }
    }
    this.m = world().newModel('charge' + this.sp);
    this.m.resource = world().modelResource('RCMine');
    this.m.parent = world().group('world');
    this.m.shader = world().model('RCMine' + suffix).shader;
    this.m.worldPosition = mul(this.V, 5) as LVector;
    this.m.scale(2);
    this.state = sym('tick');
  }

  prepareFrame() {
    switch (this.state) {
      case sym('tick'):
        for (const q of G.gPlog as LList) {
          const qsp = (q as LPropList).getaProp(sym('sp')) as number;
          if (intersects(qsp, this.sp)) {
            const angle = GetAngle(sprite(qsp).locH - sprite(this.sp).locH, sprite(qsp).locV - sprite(this.sp).locV) as number;
            this.x = sprite(this.sp).locH;
            this.y = sprite(this.sp).locV;
            const qrsp = (q as LPropList).getaProp(sym('robotSp')) as number;
            this.dx = -(0.4 * sp(qrsp, 'fart') + 1.2) * Math.cos(angle * DEG);
            this.dy = -(0.4 * sp(qrsp, 'fart') + 1.2) * Math.sin(angle * DEG);
            playsound('hitsmall', 255);
            this.state = sym('slide');
            return;
          }
        }
        break;
      case sym('slide'): {
        const lastx = this.x!;
        const lasty = this.y!;
        this.x = this.x! + this.dx!;
        this.y = this.y! + this.dy!;
        for (let i = 15; i <= 18; i++) {
          if (intersects(this.sp, i)) {
            this.x = lastx;
            this.y = lasty;
          }
        }
        if (this.x > 1580 || this.x < 820 || intersects(this.sp, 6)) {
          this.state = sym('fall');
        }
        if (this.dx! > 0.3) {
          this.dx = this.dx! - 0.3;
        }
        if (this.dx! < -0.3) {
          this.dx = this.dx! + 0.3;
        }
        if (this.dy! > 0.3) {
          this.dy = this.dy! - 0.3;
        }
        if (this.dy! < -0.3) {
          this.dy = this.dy! + 0.3;
        }
        if (Math.abs(this.dx!) + Math.abs(this.dy!) < 0.8) {
          this.state = sym('tick');
        }
        this.m!.worldPosition = mul(5, PointToVector(point(this.x, this.y), -100)) as LVector;
        sprite(this.sp).loc = point(this.x, this.y);
        break;
      }
      case sym('fall'):
        this.dz = this.dz + 1;
        this.z = this.z - this.dz;
        this.m!.worldPosition.y = this.z;
        if (this.z < -2000) {
          this.state = sym('Remove');
        }
        break;
      case sym('explode'): {
        const m = this.m!;
        let dist: number;
        let del: number;
        let damageamount: number;
        if (!eq(G.gGamePlace, sym('backyard'))) {
          dist = m.worldPosition.distanceTo(sp(this.robot2Sp, 'pRobot').worldPosition);
          if (dist < 1000) {
            del = (1500 - dist) / 1000;
            if (del > 1) {
              del = 1;
            }
            damageamount = dot(G.gPartDescription, 'v32', 'skada') * del;
            sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
            sendSprite(this.robot2Sp, 'hopp', m.name, damageamount);
            sendSprite(this.robot2Sp, 'damage', damageamount, sym('splitter'));
          }
          sendToOpponent('explode', sym('sp'), this.sp);
        }
        dist = m.worldPosition.distanceTo(sp(this.robotSp, 'pRobot').worldPosition);
        if (dist < 1000) {
          del = (1500 - dist) / 1000;
          if (del > 1) {
            del = 1;
          }
          damageamount = dot(G.gPartDescription, 'v32', 'skada') * del;
          sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
          sendSprite(this.robotSp, 'hopp', m.name, damageamount);
          sendSprite(this.robotSp, 'damage', damageamount, sym('splitter'));
          put('hit');
        }
        this.state = sym('explode2');
        break;
      }
      case sym('explode2'):
        if (the.milliSeconds > this.pstartTime + 5000) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        world().deleteModel(this.m!.name);
        world().deleteModelResource('explosion' + this.sp);
        this.state = sym('nada');
        this.doneSprite();
        break;
    }
  }

  endSprite() {
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
    }
  }

  doneSprite() {
    this.state = sym('nada');
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
    }
  }

  InitSmoke() {
    const pr = world().newModelResource('explosion' + this.sp, sym('particle'));
    const ttexture = world().texture('fire1');
    if (!ttexture) {
      pr.texture = world().newTexture('fire1', sym('fromImageObject'), member('fire').image);
    } else {
      pr.texture = world().texture('fire1');
    }
    this.m!.resource = pr;
    pr.lifeTime = 500;
    pr.colorRange.start = rgb(255, 200, 80);
    pr.colorRange.end = rgb(0, 0, 0);
    pr.sizeRange.start = 75;
    pr.sizeRange.end = 100;
    pr.blendRange.start = 75.0;
    pr.blendRange.end = 0;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.angle = 40.0;
    pr.emitter.minSpeed = 200.0;
    pr.emitter.maxSpeed = 800.0;
    pr.emitter.numParticles = 50;
  }

  charges(rob: LValue) {
    if (this.state !== sym('nada') && this.state !== sym('Remove') && this.state !== sym('explode2')) {
      if (eq(rob, this.robotSp)) {
        this.InitSmoke();
        this.state = sym('explode');
        this.pstartTime = the.milliSeconds;
      }
    }
  }
}
