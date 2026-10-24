// arena104 behavior 248 "vapen v36": the EMP. A press (3 charges) sends out a growing
// blue sphere from the robot; if it reaches the other robot while still small it wraps
// it in a sphere for 10 s and stuns it (radius over 10) or scrambles its keys (over 20).

import { G, member, sendSprite, the } from '../../director';
import type { Group3D, Model, ModelResource, Shader } from '../../director/s3d';
import { add, lingoString, mod, mul, num, rgb, sym, vector, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { eq, world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber, gGamePlace

export class VapenV36 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol;
  pHit: number | undefined = undefined;
  pstartTime: number | undefined = undefined;
  pr: ModelResource;
  m: Model;
  m2: Model;
  m3: Model | undefined = undefined;
  pPArent: Group3D;
  size: number;
  amLeft: string;
  theShader: Shader;
  suffix: string;
  opsuffix: number;
  pblend: number | undefined = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
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
    const tamleft = 3;
    this.amLeft = rocket_encrypt(tamleft);
    // The suffix string counts as a number: "1" gives 2, "2" gives 1.
    this.opsuffix = mod(add(this.suffix, 2), 2) + 1;
    this.weaponNumber = n;
    this.state = sym('done');
    this.pPArent = world().group('robot' + this.suffix);
    const pr = (this.pr = world().newModelResource('emp' + this.sp, sym('particle')));
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
    pr.lifeTime = 4000;
    pr.colorRange.start = rgb(255, 255, 255);
    pr.colorRange.end = rgb(0, 0, 255);
    pr.tweenMode = sym('velocity');
    pr.sizeRange.start = 50;
    pr.sizeRange.end = 1;
    pr.blendRange.start = 100;
    pr.blendRange.end = 100;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.angle = 90;
    pr.emitter.minSpeed = 5000;
    pr.emitter.maxSpeed = 10000;
    pr.emitter.direction = vector(0, 1, 0);
    pr.emitter.distribution = sym('gaussian');
    pr.drag = 0;
    pr.gravity = vector(0.0, -80, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    this.size = 0;
    this.m.transform.position.y = -10000;
    const r2 = world().newModelResource('empsphere' + this.sp, sym('sphere'));
    this.m2 = world().newModel('emp_sphere' + this.sp, r2);
    this.m2.visibility = sym('both');
    this.theShader = world().newShader('emp_shd' + this.sp, sym('standard'));
    this.theShader.emissive = rgb(0, 0, 255);
    this.theShader.blend = 50.0;
    this.theShader.specular = rgb(0, 0, 0);
    this.theShader.texture = world().texture('walltopp.png');
    this.theShader.ambient = rgb(0, 0, 0);
    this.theShader.diffuse = rgb(255, 255, 255);
    this.theShader.blend = 50.0;
    this.m2.shaderList = this.theShader;
    this.m2.transform.scale = vector(1, 1, 1);
    this.m2.transform.position.y = -10000;
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      let tamleft = num(rocket_decrypt(this.amLeft));
      if (tamleft > 0) {
        if (this.state === sym('done')) {
          this.state = sym('init');
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
        }
      } else {
        playsound('noammo', 255);
      }
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('init'):
        // One more particle each time, which also fires the burst again.
        this.pr.emitter.numParticles = this.pr.emitter.numParticles + 1;
        this.m.worldPosition = this.pPArent.worldPosition;
        this.m2.worldPosition = this.pPArent.worldPosition;
        this.m2.shaderList.blend = 50;
        this.size = 1;
        this.m2.transform.scale = vector(1, 1, 1);
        this.state = sym('explo');
        this.pHit = 0;
        playsound('emp_sound', 255);
        break;
      case sym('explo'):
        if (!eq(G.gGamePlace, sym('backyard'))) {
          if (this.pHit === 0) {
            if (this.pPArent.worldPosition.distanceTo(world().group('robot' + this.opsuffix).worldPosition) < this.size * 200) {
              if (this.size < 40) {
                const m3 = (this.m3 = this.m2.cloneDeep('emphit' + this.suffix) as Model);
                m3.transform.scale = vector(20, 20, 20);
                m3.shader.blend = 50;
                this.pHit = 1;
                if (this.size > 20) {
                  sendSprite(this.robot2Sp, 'emp', sym('scr'));
                } else {
                  if (this.size > 10) {
                    sendSprite(this.robot2Sp, 'emp', sym('dis'));
                  }
                }
                this.pstartTime = the.milliSeconds;
                this.pblend = 50;
              }
            }
          } else {
            const m3 = this.m3!;
            m3.worldPosition = world().group('robot' + this.opsuffix).worldPosition;
            m3.shader.textureTransformList[1].position = add(m3.shader.textureTransformList[1].position, vector(0, 0.01, 0.0)) as LVector;
            if (the.milliSeconds > 10000 + this.pstartTime!) {
              sendSprite(this.robot2Sp, 'noemp');
              this.state = sym('fadeOut');
            }
          }
        }
        break;
      case sym('fadeOut'):
        this.pblend = this.pblend! - 2;
        if (this.pblend >= 0) {
          this.m3!.shader.blend = this.pblend;
        } else {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        world().deleteModel(this.m3!.name);
        this.state = sym('done');
        break;
    }
    if (this.size > 0) {
      this.theShader.textureTransformList[1].position = add(this.theShader.textureTransformList[1].position, vector(0, 0.01, 0.0)) as LVector;
      this.m2.transform.scale = mul(vector(10, 10, 10), this.size + 0.0001) as LVector;
      this.size = this.size + 2;
      if (this.size > 200) {
        // size is an integer: integer division.
        this.m2.shaderList.blend = Math.trunc((100 - (this.size - 200)) / 2);
      }
      if (this.size > 300) {
        this.size = 0;
        if (this.pHit === 0) {
          this.state = sym('done');
        }
        this.m2.transform.scale = mul(vector(10, 10, 10), this.size + 0.0001) as LVector;
        this.m2.shaderList.blend = 0;
      }
    }
  }
}
