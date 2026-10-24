// arena104 behavior 28 "mine behavior": a mine dropped by vapen v1. Armed once its
// layer has driven off it (after 300 ms); a plough or other sweeper in gPlog pushes it
// sliding away (into the pit or off the roof, it falls); a robot driving onto it is
// thrown up (hopp) and takes v1's damage, and the mine becomes a burst of fire.

import { G, dot, intersects, member, sendSprite, sprite, the } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, mul, num, point, rgb, sym, type LSymbol, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { GetAngle } from '../robotwars/s007-jump-movie';
import { PointToVector } from './s006-arena-3d';
import { DEG, sp, world } from './weapon-util';

// global world, gPlog, gPartDescription, gPlayerNumber

export class MineBehavior {
  sp: number;
  m: Model | undefined;
  robotSprite: number;
  V: LVector;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: number;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  dz: number;
  pstartTime: number;
  state: LSymbol;

  constructor(sp0: number, _name: string, v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    this.V = v0;
    this.z = -530;
    this.dz = 0;
    this.robotSprite = rsp;
    this.state = sym('place');
    const robotSp = rsp;
    void robotSp;
    let robot2Sp: number;
    let suffix: string;
    if (rsp === 10) {
      robot2Sp = 20;
      suffix = '1';
    } else {
      robot2Sp = 10;
      suffix = '2';
    }
    void robot2Sp;
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        suffix = '2';
      } else {
        suffix = '1';
      }
    }
    this.m = world().newModel('mine' + this.sp);
    this.m.resource = world().modelResource('Mina');
    this.m.parent = world().group('world');
    this.m.shader = world().model('mina' + suffix).shader;
    this.m.worldPosition = mul(this.V, 5) as LVector;
    this.m.scale(2);
  }

  prepareFrame() {
    switch (this.state) {
      case sym('place'): {
        const t = the.milliSeconds - this.pstartTime;
        if (t > 300 && !intersects(this.robotSprite, this.sp)) {
          this.state = sym('tick');
        }
        break;
      }
      case sym('tick'):
        for (const q of G.gPlog as LList) {
          const qsp = num(dot(q, 'sp'));
          if (intersects(qsp, this.sp)) {
            const angle = num(GetAngle(sprite(qsp).locH - sprite(this.sp).locH, sprite(qsp).locV - sprite(this.sp).locV));
            this.x = sprite(this.sp).locH;
            this.y = sprite(this.sp).locV;
            const fart = num(sp(num(dot(q, 'robotSp')), 'fart'));
            this.dx = -(0.4 * fart + 1.2) * Math.cos(angle * DEG);
            this.dy = -(0.4 * fart + 1.2) * Math.sin(angle * DEG);
            playsound('hitsmall', 255);
            this.state = sym('slide');
            // `exit`: the rest of prepareFrame (the robot checks) waits for the next frame.
            return;
          }
        }
        if (intersects(this.sp, 10)) {
          playsound('explode_12', 255);
          sendSprite(10, 'hopp', 'mine' + this.sp, 0);
          sendSprite(10, 'damage', dot(G.gPartDescription, 'v1', 'skada'), sym('splitter'));
          this.pstartTime = the.milliSeconds;
          this.InitSmoke();
          this.state = sym('explode');
        }
        if (intersects(this.sp, 20)) {
          playsound('explode_12', 255);
          sendSprite(20, 'hopp', 'mine' + this.sp, 0);
          sendSprite(20, 'damage', dot(G.gPartDescription, 'v1', 'skada'), sym('splitter'));
          this.pstartTime = the.milliSeconds;
          this.InitSmoke();
          this.state = sym('explode');
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
      case sym('explode'):
        if (the.milliSeconds > this.pstartTime + 5000) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        world().deleteModel(this.m!.name);
        world().deleteModelResource('explosion' + this.sp);
        this.state = sym('doneMine');
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
    pr.blendRange.start = 60.0;
    pr.blendRange.end = 0;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.angle = 40.0;
    pr.emitter.minSpeed = 100.0;
    pr.emitter.maxSpeed = 500.0;
    pr.emitter.numParticles = 50;
  }
}

