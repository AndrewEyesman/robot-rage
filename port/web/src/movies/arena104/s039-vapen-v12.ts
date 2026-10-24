// arena104 behavior 39 "vapen v12": the spiked roller. Like the drill (v10): holding
// the key spins the roller up about its axle ("sag_kavel_snurr"), spinning into the
// other robot bounces both and, fast enough, does v12's damage; sparks fly from the
// spikes while they touch something.

import { G, dot, intersects, member, sendSprite, sound, sprite, the } from '../../director';
import { type Model, type ModelResource } from '../../director/s3d';
import { LList, lingoString, num, rgb, sym, vector, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { eq, sp, world } from './weapon-util';

// global gPartDescription, world, gRobot1, gRobot2, gLastHitTime

export class VapenV12 {
  m: Model | undefined = undefined;
  state: LSymbol;
  n: LValue = undefined;
  middlepoint: LVector;
  dangle: number | undefined = undefined;
  suffix: string;
  pr: ModelResource | undefined = undefined;
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  counter: number;
  soundCh: number | undefined = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
      this.suffix = '1';
    } else {
      this.suffix = '2';
    }
    this.weaponNumber = n;
    sprite(this.sp).ink = 8;
    this.middlepoint = vector(5.56, -44.72, -5.0);
    this.counter = 0;
    // m is the sparks' model until #init makes it the roller's.
    if (world().model('gnist' + this.sp) === undefined) {
      this.m = world().newModel('gnist' + this.sp);
      this.m.parent = world().group('world');
      const pr = (this.pr = world().newModelResource('gnist' + this.sp, sym('particle')));
      const ttexture = world().texture('gnist1');
      if (!ttexture) {
        pr.texture = world().newTexture('gnist1', sym('fromImageObject'), member('span').image);
      } else {
        pr.texture = world().texture('gnist1');
        pr.texture.renderFormat = sym('rgba8888');
      }
      this.m.resource = pr;
      pr.emitter.numParticles = 40;
      pr.lifeTime = 500;
      pr.colorRange.start = rgb(170, 212, 153);
      pr.colorRange.end = rgb(0, 0, 0);
      pr.tweenMode = sym('age');
      pr.sizeRange.start = 20;
      pr.sizeRange.end = 1;
      pr.blendRange.start = 100;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('stream');
      pr.emitter.loop = 0;
      pr.emitter.angle = 90;
      pr.emitter.minSpeed = 800.0;
      pr.emitter.maxSpeed = 1000.0;
      pr.emitter.direction = vector(0, 1, 0);
      pr.emitter.distribution = sym('gaussian');
      pr.drag = 0.0;
      pr.gravity = vector(0.0, -100, 0.0);
      pr.wind = vector(0.0, 0.0, 0.0);
    }
    this.state = sym('init');
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      const angle = 0;
      void angle;
      this.dangle = 1;
      sendSprite(this.robotSp, 'spendEnergy', 1);
      this.soundCh = playsound('sag_kavel_snurr', 0);
      if (this.soundCh <= 8) {
        sound(this.soundCh).fadeTo(255, 800);
      }
      this.state = sym('spin');
    } else {
      // A release with no press before it: VOID <= 8 holds in Lingo (VOID is 0).
      if (num(this.soundCh) <= 8) {
        sound(num(this.soundCh)).fadeOut(1200);
      }
      this.state = sym('idle');
    }
  }

  prepareFrame() {
    let hitrobot: boolean | undefined;
    let gnista: number | undefined;
    const angle = sprite(this.robotSp).rotation;
    sprite(this.sp).loc = sprite(this.robotSp).loc;
    sprite(this.sp).rotation = angle + 90;
    switch (this.state) {
      case sym('init'):
        this.suffix = '1';
        if (this.robotNumber === 2) {
          this.suffix = '2';
        }
        this.m = world().model(lingoString((dot(G.gPartDescription, 'v12', 'model') as LList).getAt(2)) + this.suffix);
        if (eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v12')), sym('f'))) {
          sprite(this.sp).member = member('v12 f', 1);
        } else {
          sprite(this.sp).member = member('v12 b', 1);
        }
        this.state = sym('idle');
        break;
      case sym('spin'):
        hitrobot = intersects(this.sp, this.robot2Sp);
        if (this.dangle! < 20) {
          this.dangle = this.dangle! + 2;
        }
        for (let i = 15; i <= 18; i++) {
          if (intersects(this.sp, i)) {
            gnista = 1;
          }
        }
        for (let i = 25; i <= 26; i++) {
          if (intersects(this.sp, i)) {
            gnista = 1;
          }
        }
        break;
      case sym('idle'):
        if (num(this.dangle) > 0) {
          this.dangle = this.dangle! - 1;
        }
        break;
    }
    if (num(this.dangle) > 0) {
      this.m!.rotate(this.middlepoint, vector(0, 0, 1), this.dangle!);
    }
    if (hitrobot) {
      if (!eq(sp(this.robot2Sp, 'state'), sym('slow'))) {
        gnista = 1;
        const dx10 = sp(this.robotSp, 'dx');
        const dy10 = sp(this.robotSp, 'dy');
        const angle10 = sp(this.robotSp, 'angle');
        const speed10 = sp(this.robotSp, 'speed');
        sendSprite(this.robotSp, 'hit', sp(this.robot2Sp, 'dx'), sp(this.robot2Sp, 'dy'), sp(this.robot2Sp, 'angle'), sp(this.robot2Sp, 'speed'));
        sendSprite(this.robot2Sp, 'hit', dx10, dy10, angle10, speed10);
        if (the.milliSeconds > G.gLastHitTime + 500 && this.dangle! > 10) {
          sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v12', 'skada'), sym('nothing'));
          G.gLastHitTime = the.milliSeconds;
        }
      }
    }
    if (gnista) {
      // pr is VOID when a "gnist<sp>" model was left over (a script error, as in the original).
      this.pr!.emitter.loop = 1;
      this.pr!.emitter.region = new LList([world().model('taggar' + this.suffix).child[1].worldPosition]);
      if (the.milliSeconds > G.gLastHitTime + 500 && this.dangle! > 10) {
        playsound('kavel_hit', 255);
        G.gLastHitTime = the.milliSeconds;
      }
    } else {
      if (this.pr !== undefined) {
        this.pr.emitter.loop = 0;
      }
    }
  }

  stopshoot() {
    if (this.state !== sym('init')) {
      this.state = sym('idle');
    }
  }
}
