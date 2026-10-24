// arena104 behavior 11 "smash behavior": a burst of fire particles at a point (grenade
// and rocket hits create one through the frame script's createSprite), gone after 1.2 s.

import { member, sendSprite, the } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, rgb, sym, type LColor, type LSymbol, type LValue, type LVector } from '../../lingo';
import { world } from './weapon-util';

// global world

export class SmashBehavior {
  sp: number;
  x: number;
  y: number;
  z: number;
  m: Model | undefined;
  col: LValue;
  pstartTime: number;
  state: LSymbol;

  constructor(sp0: number, _name0: string, v0: LVector, _rsp?: LValue, col0?: LValue) {
    this.sp = sp0;
    this.x = v0.x;
    this.y = v0.y;
    this.z = v0.z;
    this.col = col0;
    this.pstartTime = the.milliSeconds;
    this.m = world().newModel('smash' + this.sp);
    this.InitSmoke();
    this.m.parent = world().group('world');
    this.m.worldPosition = v0;
    this.state = sym('explode');
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
    pr.lifeTime = 800;
    pr.colorRange.start = this.col as LColor;
    pr.colorRange.end = rgb(170, 255, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 25.5;
    pr.sizeRange.end = 200.0;
    pr.blendRange.start = 100.0;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.region = new LList([vector(0.0, 0.0, 0.0)]);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.angle = 180.0;
    pr.emitter.path = new LList([vector(0, 0, 0), vector(0, 0, 112)]);
    pr.emitter.pathStrength = 0.0;
    pr.emitter.minSpeed = 400.0;
    pr.emitter.maxSpeed = 670.0;
    pr.drag = 0.0;
    pr.gravity = vector(0.0, -8, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    pr.emitter.numParticles = 60;
  }

  prepareFrame() {
    switch (this.state) {
      case sym('explode'):
        if (the.milliSeconds > this.pstartTime + 1200) {
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
    if (world().model(this.m.name)) {
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
    if (world().model(this.m.name)) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
    }
  }
}
