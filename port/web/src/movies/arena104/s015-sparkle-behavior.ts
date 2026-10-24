// arena104 behavior 15 "sparkle behavior": a burst of sparks at a point (the frame
// script's createSparkle), gone after 1.2 s.

import { member, sendSprite, the } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, rgb, sym, type LSymbol, type LVector } from '../../lingo';
import { world } from './weapon-util';

// global world

export class SparkleBehavior {
  sp: number;
  m: Model;
  pstartTime: number;
  state: LSymbol;

  constructor(sp0: number, v0: LVector) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    this.m = world().newModel('sparkle' + this.sp);
    this.m.parent = world().group('world');
    this.m.worldPosition = v0;
    this.InitSmoke();
    this.state = sym('explode');
  }

  InitSmoke() {
    const pr = world().newModelResource('sparkle' + this.sp, sym('particle'));
    const ttexture = world().texture('sparkle_1');
    if (!ttexture) {
      pr.texture = world().newTexture('sparkle_1', sym('fromImageObject'), member('sparkle texture').image);
    } else {
      pr.texture = world().texture('sparkle_1');
    }
    this.m.resource = pr;
    pr.lifeTime = 500;
    pr.colorRange.start = rgb(100, 100, 100);
    pr.colorRange.end = rgb(255, 255, 255);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 10;
    pr.sizeRange.end = 10.0;
    pr.blendRange.start = 100.0;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0, -1, 0);
    pr.emitter.region = new LList([vector(0.0, 0.0, 0.0)]);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.angle = 45.0;
    pr.emitter.path = new LList([]);
    pr.emitter.pathStrength = 0.0;
    pr.emitter.minSpeed = 800.0;
    pr.emitter.maxSpeed = 1200.0;
    pr.drag = 0.0;
    pr.gravity = vector(0.0, 0, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    pr.emitter.numParticles = 50;
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
        world().deleteModel(this.m.name);
        world().deleteModelResource('sparkle' + this.sp);
        this.state = sym('doneMine');
        break;
    }
  }

  endSprite() {
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('sparkle' + this.sp);
    }
  }
}
