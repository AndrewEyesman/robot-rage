// arena104 behavior 247 "vapen v35": the minigun. Holding the key spins the barrels
// up; at full speed every 60 degrees of spin fires a shot (200 rounds) along the gun,
// with sparks where the ray hits, and v35's damage when that is the other robot.

import { G, SoundMember, dot, member, put, sendAllSprites, sendSprite, sound } from '../../director';
import type { Model, ModelResource } from '../../director/s3d';
import { LList, LPropList, add, contains, lingoString, mul, neg, num, rgb, sym, vector, type LSymbol, type LValue, type LVector } from '../../lingo';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber

/** sound(ch).play([#member: member(name) {, #rateShift: r}]) */
function playOn(ch: number, name: string, rateShift?: number) {
  const m = member(name);
  if (m instanceof SoundMember) sound(ch).play(m, rateShift === undefined ? {} : { rateShift });
}

export class VapenV35 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol | undefined = undefined;
  pSPeed: number;
  pangle: number;
  pGun: Model | undefined;
  pFlame: Model;
  suffix: string;
  pr: ModelResource;
  m: Model;
  amLeft: string;
  pOffset: number | undefined = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.weaponNumber = n;
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
    const tamleft = 200;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.pGun = world().model('Railgun' + this.suffix).child[2] as Model;
    this.pFlame = world().model('Railgun' + this.suffix).child[1] as Model;
    this.pSPeed = 0;
    this.pangle = 0;
    const pr = (this.pr = world().newModelResource('mini-gun' + this.sp, sym('particle')));
    const ttexture = world().texture('laser1');
    if (!ttexture) {
      pr.texture = world().newTexture('laser1', sym('fromImageObject'), member('smoke').image);
    } else {
      pr.texture = world().texture('laser1');
    }
    this.m = world().newModel('mini-gun' + this.sp);
    this.m.transform.position.y = -10000;
    this.m.resource = pr;
    pr.emitter.numParticles = 50;
    pr.lifeTime = 1000;
    pr.colorRange.start = rgb(255, 255, 255);
    pr.colorRange.end = rgb(0, 0, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 20;
    pr.sizeRange.end = 1;
    pr.blendRange.start = 100;
    pr.blendRange.end = 100;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 0;
    pr.emitter.angle = 90;
    pr.emitter.minSpeed = 300.0;
    pr.emitter.maxSpeed = 600.0;
    pr.emitter.distribution = sym('gaussian');
    pr.gravity = vector(0.0, -40, 0.0);
    const tpappa = this.pGun.parent!.parent!.child[2].name;
    if (contains(tpappa, 'liten')) {
      this.pOffset = -300;
    }
    if (contains(tpappa, 'mellan')) {
      this.pOffset = -100;
    }
    if (contains(tpappa, 'stor')) {
      this.pOffset = 0;
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      this.state = sym('on');
    } else {
      this.state = sym('off');
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('on'):
        this.pSPeed = this.pSPeed + 0.75;
        if (this.pSPeed > 25) {
          this.pSPeed = 25;
        }
        break;
      case sym('off'):
        this.pSPeed = this.pSPeed - 0.75;
        if (this.pSPeed < 0) {
          this.state = sym('idle');
          this.pSPeed = 0;
        }
        break;
    }
    if (this.pSPeed > 0) {
      // `2 + suffix` is channel 3 or 4 (the string counts as a number), and `3 + suffix`
      // 4 or 5: inside playsound's channels 3-8, so the two can cut each other off.
      // The spin sound restarts every frame.
      playOn(2 + Number(this.suffix), 'minigun', this.pSPeed - 20);
      sound(2 + Number(this.suffix)).volume = (this.pSPeed * 255) / 20;
      this.pangle = this.pangle + this.pSPeed;
      if (this.pangle >= 60) {
        if (this.pSPeed === 25) {
          const tamleft = num(rocket_decrypt(this.amLeft));
          if (tamleft > 0) {
            playOn(3 + Number(this.suffix), 'gunshot');
            this.pr.emitter.loop = 1;
            this.shoot();
            sendAllSprites(sym('lightup'), this.robotNumber);
          } else {
            playOn(3 + Number(this.suffix), 'nomini');
          }
        }
        this.pangle = 0;
      } else {
        this.pr.emitter.loop = 0;
        this.pFlame.visibility = sym('none');
      }
      if (this.pGun !== undefined) {
        this.pGun.transform.rotation.z = this.pangle;
      }
    }
  }

  shoot() {
    let tamleft = num(rocket_decrypt(this.amLeft));
    tamleft = tamleft - 1;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.m.transform.position.y = 0;
    this.pFlame.visibility = sym('both');
    const TRN = this.pGun!.getWorldTransform();
    // pOffset stays VOID for a gun on none of the three bodies (VOID * vector).
    const pos = add(TRN.position, mul(this.pOffset, TRN.zAxis)) as LVector;
    const list = world().modelsUnderRay(pos, neg(TRN.zAxis) as LVector, 5, sym('detailed')) as LList;
    for (let i = 1; i <= list.count; i++) {
      const hit = list.getAt(i) as LPropList;
      const model = hit.getaProp(sym('model')) as Model;
      const name = model.name;
      if (!(contains(name, 'barrels') || contains(name, 'dummy') || contains(name, '-') || contains(name, 'ray') || contains(name, '_sphere') || contains(name, 'emphit'))) {
        put(name);
        const hitpos = hit.getaProp(sym('isectPosition')) as LVector;
        this.pr.emitter.region = new LList([hitpos]);
        this.pr.emitter.direction = hit.getaProp(sym('isectNormal')) as LVector;
        if (contains(model.parent!.name, 'robot')) {
          sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v35', 'skada'), sym('torn'));
        }
        break;
      }
    }
  }

  stopshoot() {
    if (this.state !== sym('init')) {
      this.state = sym('off');
    }
  }

  endSprite() {
    sound(2 + Number(this.suffix)).volume = 255;
  }
}
