// arena104 behavior 25 "throwfire behavior": one flame-thrower shot (vapen v2). A
// stream of fire particles from the nozzle along the robot's heading for 1.2 s, while
// a map sprite travels ahead; touching the other robot does v2's damage once.

import { G, dot, intersects, member, sendSprite, sprite, the } from '../../director';
import { transform, vector, type Group3D, type Model, type ModelResource } from '../../director/s3d';
import { LList, point, rgb, sym, type LSymbol, type LVector } from '../../lingo';
import { VectorToPoint } from './s006-arena-3d';
import { DEG, world } from './weapon-util';

// global world, gRobot1, gRobot2, gPartDescription, gPlayerNumber

export class ThrowfireBehavior {
  sp: number;
  x: number;
  y: number;
  z: number | undefined = undefined;
  m: Model | undefined;
  pr: ModelResource | undefined = undefined;
  suffix: string;
  grp: Group3D | undefined = undefined;
  pstartTime: number;
  state: LSymbol;
  angle: number;
  robot2Sp: number;
  robotSp: number;

  constructor(sp0: number, _name0: string, v0: LVector, _rnum: number, rsp: number, angle0: number) {
    this.sp = sp0;
    this.robotSp = rsp;
    const pt = VectorToPoint(v0);
    this.x = pt.locH as number;
    this.y = pt.locV as number;
    this.pstartTime = the.milliSeconds;
    this.m = world().newModel('fire' + this.sp);
    this.m.worldPosition = vector(0, 0, 0);
    if (rsp === 10) {
      this.robot2Sp = 20;
      this.suffix = '1';
    } else {
      this.robot2Sp = 10;
      this.suffix = '2';
    }
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        this.suffix = '2';
      } else {
        this.suffix = '1';
      }
    }
    this.angle = angle0;
    this.x = this.x + 12 * Math.cos(this.angle * DEG);
    this.y = this.y + 12 * Math.sin(this.angle * DEG);
    if (this.grp === undefined) {
      this.grp = world().newGroup('eldgrp' + this.sp);
      this.grp.parent = world().model('eldkastare' + this.suffix);
      this.grp.transform.position = vector(0, 0, -183);
    }
    this.InitSmoke();
    this.state = sym('explode');
  }

  InitSmoke() {
    const pr = (this.pr = world().newModelResource('explosion' + this.sp, sym('particle')));
    const ttexture = world().texture('fire1');
    if (!ttexture) {
      pr.texture = world().newTexture('fire1', sym('fromImageObject'), member('fire').image);
      pr.texture.renderFormat = sym('rgba8888');
    } else {
      pr.texture = world().texture('fire1');
    }
    this.m!.resource = pr;
    pr.emitter.numParticles = 50;
    pr.lifeTime = 1200;
    pr.colorRange.start = rgb(255, 255, 230);
    pr.colorRange.end = rgb(200, 150, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 80.5;
    pr.sizeRange.end = 500.0;
    pr.blendRange.start = 99.0;
    pr.blendRange.end = 15.0;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 0;
    pr.emitter.angle = 7.0;
    pr.emitter.minSpeed = 1200.0;
    pr.emitter.maxSpeed = 2000.0;
    pr.emitter.distribution = sym('gaussian');
    pr.drag = 0.0;
    pr.gravity = vector(0.0, 10, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
  }

  prepareFrame() {
    switch (this.state) {
      case sym('explode'): {
        this.angle = sprite(this.robotSp).rotation;
        const TRN = transform();
        TRN.rotation.y = this.angle;
        this.pr!.emitter.direction = TRN.xAxis;
        this.pr!.emitter.loop = 1;
        const pos = this.grp!.worldPosition;
        this.pr!.emitter.region = new LList([pos]);
        this.x = this.x + 3 * Math.cos(this.angle * DEG);
        this.y = this.y + 3 * Math.sin(this.angle * DEG);
        sprite(this.sp).loc = point(this.x, this.y);
        if (intersects(this.sp, this.robot2Sp)) {
          this.x = -10000;
          sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v2', 'skada'), sym('dirt'));
        }
        if (the.milliSeconds > this.pstartTime + 2000) {
          this.state = sym('Remove');
        }
        if (the.milliSeconds > this.pstartTime + 1200) {
          this.pr!.emitter.loop = 0;
        }
        break;
      }
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        world().deleteModel(this.m!.name);
        world().deleteGroup(this.grp!.name);
        this.grp = undefined;
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
      world().deleteGroup(this.grp!.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
      this.grp = undefined;
    }
  }

  doneSprite() {
    this.state = sym('nada');
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteGroup(this.grp!.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
      this.grp = undefined;
    }
  }
}
