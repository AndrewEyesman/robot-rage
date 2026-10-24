// arena104 behavior 27 "rocketsmoke behavior": a rocket's exhaust trail. A stream of
// fire particles that follows the rocket model it was given, 150 units behind it,
// for 1.2 s.

import { member, sendSprite, the } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, rgb, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { world } from './weapon-util';

// global world, gRobot1, gRobot2

export class RocketsmokeBehavior {
  sp: number;
  x: number;
  y: number;
  z: number;
  m: Model | undefined;
  col: LValue;
  pstartTime: number;
  state: LSymbol;
  angle: number;
  raketmember: Model;

  constructor(sp0: number, _name0: string, v0: LVector, _rnum: LValue, col0: LValue, m0: Model) {
    this.sp = sp0;
    this.x = v0.x;
    this.y = v0.y;
    this.z = v0.z;
    this.col = col0;
    this.pstartTime = the.milliSeconds;
    this.m = world().newModel('fire' + this.sp);
    this.m.parent = world().group('world');
    this.m.worldPosition = m0.worldPosition;
    this.raketmember = m0;
    this.angle = 0;
    this.InitSmoke(this.m.transform.rotation);
    this.m.transform.rotation = m0.transform.rotation;
    this.state = sym('go');
  }

  InitSmoke(_rv?: LVector) {
    const pr = world().newModelResource('rsmoke' + this.sp, sym('particle'));
    const ttexture = world().texture('fire');
    if (!ttexture) {
      // Made from the laser's image if InitFirePit hasn't made "fire" (it always has).
      pr.texture = world().newTexture('fire', sym('fromImageObject'), member('laser').image);
      pr.texture.renderFormat = sym('rgba8888');
    } else {
      pr.texture = world().texture('fire');
    }
    this.m!.resource = pr;
    pr.emitter.numParticles = 25;
    pr.lifeTime = 1040;
    pr.colorRange.start = rgb(255, 255, 230);
    pr.colorRange.end = rgb(200, 150, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 40.5;
    pr.sizeRange.end = 40.0;
    pr.blendRange.start = 50.0;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 0;
    pr.emitter.angle = 4.0;
    pr.emitter.minSpeed = 500.0;
    pr.emitter.maxSpeed = 550.0;
    pr.emitter.direction = vector(0, 0.0, -1);
    pr.emitter.region = new LList([vector(0.0, 0.0, 0.0)]);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.path = new LList([]);
    pr.emitter.pathStrength = 0.0;
    pr.drag = 0.0;
    pr.gravity = vector(0.0, 1, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
  }

  prepareFrame() {
    switch (this.state) {
      case sym('go'):
        this.m!.worldPosition = this.raketmember.worldPosition;
        this.m!.transform.rotation = this.raketmember.transform.rotation;
        this.m!.translate(0, 0, -150);
        if (the.milliSeconds > this.pstartTime + 1200) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        world().deleteModel(this.m!.name);
        world().deleteModelResource('rsmoke' + this.sp);
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
      world().deleteModelResource('rsmoke' + this.sp);
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
      world().deleteModelResource('rsmoke' + this.sp);
      this.m = undefined;
    }
  }
}
