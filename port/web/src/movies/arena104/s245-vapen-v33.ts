// arena104 behavior 245 "vapen v33": the force field. A press toggles it (while the
// battery lasts): a green particle swirl and a translucent sphere around the robot,
// and gShield = 1, which the robot behavior's damage reads to take 20% off each hit.

import { G, member, sendSprite, the } from '../../director';
import type { Group3D, Model, ModelResource, Shader } from '../../director/s3d';
import { add, mul, rgb, sym, vector, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq, sp, world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber, gShield

export class VapenV33 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol;
  pr: ModelResource | undefined;
  m: Model;
  m2: Model;
  pPArent: Group3D;
  spinn: number;
  theShader: Shader;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
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
    G.gShield = 0;
    this.weaponNumber = n;
    this.state = sym('forceoff');
    this.pPArent = world().group('robot' + suffix);
    const pr = (this.pr = world().newModelResource('force' + this.sp, sym('particle')));
    const ttexture = world().texture('laser1');
    if (!ttexture) {
      pr.texture = world().newTexture('laser1', sym('fromImageObject'), member('laser').image);
    } else {
      pr.texture = world().texture('laser1');
    }
    pr.texture!.renderFormat = sym('rgba8888');
    this.m = world().newModel('force' + this.sp);
    this.m.transform.position.y = -10000;
    this.m.resource = pr;
    pr.emitter.numParticles = 100;
    pr.lifeTime = 2000;
    pr.colorRange.start = rgb(255, 255, 255);
    pr.colorRange.end = rgb(0, 255, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 20;
    pr.sizeRange.end = 10;
    pr.blendRange.start = 100;
    pr.blendRange.end = 50;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 0;
    pr.emitter.angle = 180;
    pr.emitter.minSpeed = 1000;
    pr.emitter.maxSpeed = 2000;
    pr.emitter.direction = vector(0, 1, 0);
    pr.emitter.distribution = sym('gaussian');
    pr.drag = 15;
    pr.gravity = vector(0.0, 0, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    this.spinn = 0;
    this.m.transform.position.y = -10000;
    const r2 = world().newModelResource('forcesphere' + this.sp, sym('sphere'));
    this.m2 = world().newModel('force_sphere' + this.sp, r2);
    this.m2.visibility = sym('both');
    this.theShader = world().newShader('force_shd' + this.sp, sym('standard'));
    this.theShader.emissive = rgb(0, 255, 0);
    this.theShader.blend = 50.0;
    this.theShader.specular = rgb(0, 0, 0);
    this.theShader.texture = world().texture('walltopp.png');
    this.theShader.ambient = rgb(0, 0, 0);
    this.theShader.diffuse = rgb(255, 255, 255);
    this.theShader.blend = 25.0;
    this.m2.shaderList = this.theShader;
    this.m2.transform.scale = vector(1, 1, 1);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = 'OFF';
    }
  }

  fire(buttondown: LValue) {
    if (!eq(sp(this.robotSp, 'state'), sym('battery'))) {
      if (buttondown) {
        if (this.state === sym('forceon')) {
          this.state = sym('forceoff');
          playsound('forceoff_sound', 255);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'OFF';
            G.gShield = 0;
          }
        } else {
          this.state = sym('forceon');
          playsound('forceon_sound', 255);
          // One more particle each time, which also restarts the system.
          this.pr!.emitter.numParticles = this.pr!.emitter.numParticles + 1;
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'ON';
            G.gShield = 1;
          }
        }
      }
    } else {
      this.state = sym('forceoff');
      // "forcekoff_sound" (sic): not a member of the arena cast.
      playsound('forcekoff_sound', 255);
      if (this.robotNumber === 1) {
        member('weapon' + this.weaponNumber + ' num').text = 'OFF';
        G.gShield = 0;
      }
    }
  }

  prepareFrame() {
    if (the.frame === 10 || the.frame === 20) {
      if (this.state === sym('forceon') && eq(sp(this.robotSp, 'state'), sym('battery'))) {
        this.state = sym('forceoff');
        playsound('forcekoff_sound', 255);
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = 'OFF';
          G.gShield = 0;
        }
      }
    }
    switch (this.state) {
      case sym('forceon'):
        sendSprite(this.robotSp, 'spendEnergy', 0.05);
        this.pr!.emitter.loop = 1;
        this.spinn = this.spinn + 0.5;
        if (this.spinn > 10) {
          this.spinn = 10;
        }
        break;
      case sym('forceoff'):
        if (this.pr !== undefined) {
          this.pr.emitter.loop = 0;
          this.spinn = this.spinn - 0.3;
          if (this.spinn < 0) {
            this.spinn = 0;
            this.m2.worldPosition.y = -10000;
            this.m.worldPosition.y = -10000;
          }
        }
        break;
    }
    if (this.spinn > 0) {
      this.m.rotate(0, this.spinn, 0);
      this.theShader.textureTransformList[1].position = add(this.theShader.textureTransformList[1].position, vector(0.01, 0.0, 0.0)) as LVector;
      this.m2.worldPosition = this.pPArent.worldPosition;
      this.m.worldPosition = this.pPArent.worldPosition;
      this.m2.transform.scale = mul(vector(2.2, 2.2, 2.2), this.spinn + 0.001) as LVector;
    }
  }

  endSprite() {
    G.gShield = undefined;
  }
}
