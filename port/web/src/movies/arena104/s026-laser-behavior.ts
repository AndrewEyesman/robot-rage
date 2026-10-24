// arena104 behavior 26 "laser behavior": one laser shot (vapen v3). For 1.2 s the beam
// model "laserray<n>" is cast along the robot's heading, stretched to the first thing
// it meets (a barrel, the city, a plane, a robot), with sparks there; the first frame
// it meets the other robot does v3's damage.

import { G, dot, member, put, sendSprite, sprite, the } from '../../director';
import { transform, vector, type Model, type ModelResource } from '../../director/s3d';
import { LList, LPropList, contains, rgb, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { world } from './weapon-util';

// global world, gRobot1, gRobot2, gPartDescription, gPlayerNumber

export class LaserBehavior {
  sp: number;
  x: number;
  y: number;
  z: number;
  m: Model | undefined = undefined;
  col: LValue = undefined;
  robotSp: number;
  robot2Sp: number | undefined = undefined;
  pr: ModelResource | undefined = undefined;
  parent: LValue = undefined;
  rnum: LValue = undefined;
  pstartTime: number;
  state: LSymbol;
  angle: number | undefined = undefined;
  suffix: string | undefined = undefined;
  pHit: number;

  constructor(sp0: number, _name0: string, v0: LVector, _rnum: number, rsp: number, angle0: number) {
    this.sp = sp0;
    this.robotSp = rsp;
    this.x = v0.x;
    this.y = v0.y;
    this.z = v0.z;
    this.pHit = 0;
    this.pstartTime = the.milliSeconds;
    if (world().model('fire' + this.sp) === undefined) {
      this.m = world().newModel('fire' + this.sp);
      this.m.parent = world().group('world');
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
      const pr = (this.pr = world().newModelResource('laserhit' + this.sp, sym('particle')));
      const ttexture = world().texture('laser1');
      if (!ttexture) {
        pr.texture = world().newTexture('laser1', sym('fromImageObject'), member('laser').image);
      } else {
        pr.texture = world().texture('laser1');
      }
      this.m.resource = pr;
      pr.emitter.numParticles = 50;
      pr.lifeTime = 1000;
      pr.colorRange.start = rgb(255, 255, 255);
      pr.colorRange.end = rgb(0, 0, 0);
      pr.tweenMode = sym('age');
      pr.sizeRange.start = 60;
      pr.sizeRange.end = 1;
      pr.blendRange.start = 100;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('stream');
      pr.emitter.loop = 0;
      pr.emitter.angle = 90;
      pr.emitter.minSpeed = 100.0;
      pr.emitter.maxSpeed = 200.0;
      pr.emitter.distribution = sym('gaussian');
      pr.emitter.path = new LList([]);
      pr.emitter.pathStrength = 0.0;
      pr.drag = 0.0;
      pr.gravity = vector(0.0, -20, 0.0);
      pr.wind = vector(0.0, 0.0, 0.0);
    }
    this.state = sym('explode');
  }

  InitLaser() {}

  prepareFrame() {
    switch (this.state) {
      case sym('explode'): {
        const pr = this.pr;
        if (pr !== undefined) {
          pr.emitter.loop = 1;
          const TRN = transform();
          TRN.rotate(5, 0, 0);
          TRN.rotation.y = 90 - sprite(this.robotSp).rotation;
          const pos = world().model('laserray' + this.suffix).worldPosition;
          world().model('laserray' + this.suffix).visibility = sym('both');
          const list = world().modelsUnderRay(pos, TRN.zAxis, 10, sym('detailed'));
          for (let i = 1; i <= list.count; i++) {
            const hit = list.getAt(i) as LPropList;
            const model = hit.getaProp(sym('model')) as Model;
            const parentName = model.parent!.name;
            if (
              !contains(model.name, 'laserkanon' + this.suffix) &&
              (contains(model.name, 'barrel') || contains(model.name, 'stad') || contains(model.name, 'plan') || contains(parentName, 'robot') || contains(parentName, '_sphere') || contains(parentName, 'emphit'))
            ) {
              put(model.name);
              const hitpos = hit.getaProp(sym('isectPosition')) as LVector;
              const laspos = world().model('laserray' + this.suffix).worldPosition;
              const dist = hitpos.distanceTo(laspos) / 20.0;
              world().model('laserray' + this.suffix).transform.scale.z = dist;
              world().model('laserray' + this.suffix).pointAt(hitpos);
              pr.emitter.region = new LList([hitpos]);
              pr.emitter.direction = hit.getaProp(sym('isectNormal')) as LVector;
              if (contains(parentName, 'robot') && this.pHit === 0) {
                playsound('laserhit', 255);
                sendSprite(this.robot2Sp!, 'damage', dot(G.gPartDescription, 'v3', 'skada'), sym('torn'));
                this.pHit = 1;
              }
              break;
            }
          }
        }
        if (the.milliSeconds > this.pstartTime + 1200) {
          world().model('laserray' + this.suffix).visibility = sym('none');
          if (this.pr !== undefined) {
            this.pr.emitter.loop = 0;
          }
        }
        if (the.milliSeconds > this.pstartTime + 2000) {
          this.state = sym('Remove');
        }
        break;
      }
      case sym('Remove'):
        this.pHit = 0;
        if (this.pr !== undefined) {
          this.pr.emitter.loop = 0;
        }
        sendSprite(0, 'removeSprite', this.sp);
        this.state = sym('doneMine');
        if (this.m === undefined) {
          return;
        }
        if (world().model(this.m.name) !== undefined) {
          world().deleteModel(this.m.name);
          world().deleteModelResource('laserhit' + this.sp);
          this.m = undefined;
        }
        break;
    }
  }

  endSprite() {
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('laserhit' + this.sp);
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
      world().deleteModelResource('laserhit' + this.sp);
      this.m = undefined;
    }
  }
}
