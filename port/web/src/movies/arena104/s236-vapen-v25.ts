// arena104 behavior 236 "vapen v25": the flash bang. Five charges; each blows a small
// fire ball off the robot and whites out the camera with the FLASH.PNG overlay: for a
// second fading in, then (for the opponent's flash) six seconds white, then three
// seconds fading out; the player's own flash fades at once and waits six seconds.

import { member, sendSprite, the } from '../../director';
import { vector, type Camera3D, type Model, type ModelResource } from '../../director/s3d';
import { LList, add, lingoString, num, point, rgb, sym, voidp, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { theOVerlay } from './s006-arena-3d';
import { sp, world } from './weapon-util';

// global gPartDescription, world, gOpponent, muInstance, gUseUDP, gGamePlace

export class VapenV25 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  pr: ModelResource | undefined = undefined;
  pm: Model | undefined = undefined;
  pstartTime: number | undefined = undefined;
  pTime: number | undefined = undefined;
  overs: LValue = undefined;
  suffix: string;
  state: LSymbol;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: LValue = undefined;
  dx: LValue = undefined;
  dy: LValue = undefined;
  dz: LValue = undefined;
  m: Model;
  speed: LValue = undefined;
  rx: LValue = undefined;
  ry: LValue = undefined;
  rz: LValue = undefined;
  pipa: LValue = undefined;
  counter: LValue = undefined;
  src: LValue = undefined;
  radie: number | undefined = undefined;
  theCamera: Camera3D;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    switch (this.robotSp) {
      case 10:
        this.robot2Sp = 20;
        break;
      default:
        this.robot2Sp = 10;
    }
    this.suffix = '1';
    if (rn === 2) {
      this.suffix = '2';
    }
    const tamleft = 5;
    this.amLeft = rocket_encrypt(tamleft);
    this.weaponNumber = n;
    this.state = sym('idle');
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.m = world().newModel('KAMIKAZE' + this.sp);
    this.state = sym('idle');
    this.theCamera = world().camera('DefaultView');
    let theTexture = world().texture('FLASH.PNG' + this.suffix);
    if (voidp(theTexture)) {
      theTexture = world().newTexture('FLASH.PNG' + this.suffix);
      theTexture.image = member('FLASH.PNG').image;
      theTexture.renderFormat = sym('rgba8888');
      this.theCamera.addOverlay(theTexture, point(0, 0), 0);
      this.overlay().blend = 0.0;
    }
  }

  /** theCamera.overlay[theOVerlay("FLASH.PNG" & suffix)] */
  private overlay() {
    return this.theCamera.overlay(theOVerlay('FLASH.PNG' + this.suffix)!);
  }

  InitSmoke() {
    this.pstartTime = the.milliSeconds;
    if (this.pm === undefined) {
      // No texture: the particles draw untextured.
      const pr = (this.pr = world().newModelResource('granatex' + this.sp, sym('particle')));
      this.pm = world().newModel('grexplo' + this.sp, pr);
      pr.lifeTime = 2000;
      pr.colorRange.start = rgb(250, 250, 80);
      pr.colorRange.end = rgb(80, 0, 0);
      pr.sizeRange.start = 50;
      pr.sizeRange.end = 5;
      pr.blendRange.start = 100.0;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('burst');
      pr.emitter.loop = 0;
      pr.emitter.angle = 90.0;
      pr.emitter.minSpeed = 1500.0;
      pr.emitter.maxSpeed = 2000.0;
      pr.emitter.direction = vector(0.0, 1.0, 0.0);
      pr.gravity = vector(0.0, -95, 0.0);
      pr.emitter.numParticles = 50;
    }
    this.pr!.lifeTime = this.pr!.lifeTime - 1;
    this.pr!.emitter.region = new LList([this.m.worldPosition]);
  }

  endSprite() {
    if (this.pm === undefined) {
      return;
    }
    if (world().model(this.pm.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('granatex' + this.sp);
      this.pm = undefined;
    }
  }

  doneSprite() {
    this.state = sym('nada');
    if (this.pm === undefined) {
      return;
    }
    if (world().model(this.pm.name) !== undefined) {
      world().deleteModel(this.pm.name);
      world().deleteModelResource('granatex' + this.sp);
      this.pm = undefined;
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        let tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
          this.state = sym('initFLASH');
        }
      }
    }
  }

  prepareFrame() {
    const m = this.m;
    switch (this.state) {
      case sym('initFLASH'):
        m.resource = world().modelResource('pang');
        m.shader = world().model('pang').shader;
        m.worldPosition = add(sp(this.robotSp, 'pRobot').worldPosition, vector(0, 200, 0)) as LVector;
        m.transform.scale = vector(1, 1, 1);
        sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
        this.InitSmoke();
        this.x = 1.6;
        this.y = 100;
        this.radie = 20.0;
        playsound('FLASH', 255);
        this.pTime = the.milliSeconds;
        this.state = sym('fadeIn');
        break;
      case sym('fadeIn'):
        m.scale(this.x!);
        this.x = this.x! - 0.01;
        this.y = this.y! - 5;
        if (this.y < 0) {
          this.y = 0;
        }
        m.shader.blend = this.y;
        if (this.x < 1.0) {
          m.worldPosition.y = -100000;
        }
        this.overlay().blend = (100 * (the.milliSeconds - this.pTime!)) / 1000.0;
        if (the.milliSeconds >= this.pTime! + 1000) {
          this.pTime = the.milliSeconds;
          this.overlay().blend = 100;
          if (this.robotNumber === 1) {
            this.state = sym('fadeOut');
          } else {
            this.state = sym('white');
          }
        }
        break;
      case sym('white'):
        if (the.milliSeconds >= this.pTime! + 6000) {
          this.pTime = the.milliSeconds;
          this.state = sym('fadeOut');
        }
        break;
      case sym('fadeOut'):
        this.overlay().blend = 100 - (100 * (the.milliSeconds - this.pTime!)) / 3000.0;
        if (the.milliSeconds >= this.pTime! + 3000) {
          this.pTime = the.milliSeconds;
          this.overlay().blend = 0;
          if (this.robotNumber === 1) {
            this.state = sym('wait');
            m.worldPosition.y = -100000;
            this.pTime = the.milliSeconds;
          } else {
            this.state = sym('idle');
            m.worldPosition.y = -100000;
          }
        }
        break;
      case sym('wait'):
        if (the.milliSeconds >= this.pTime! + 6000) {
          this.state = sym('idle');
          m.worldPosition.y = -100000;
        }
        break;
      case sym('done'):
        break;
    }
  }
}
