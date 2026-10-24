// arena104 behavior 32 "vapen v4": the grenade launcher. A press lobs the grenade model
// "granat<sp>" from the barrel (with recoil on the robot and the barrel), bouncing
// it on the hidden map off walls and fences; 35 frames later it explodes, throwing
// robots within 1000 units up (hopp) and damaging them. 10 grenades.

import { G, dot, intersects, member, put, sendSprite, sprite, the } from '../../director';
import { type Model, type ModelResource, type Transform } from '../../director/s3d';
import { LList, abs, lingoString, mul, num, point, rgb, sym, vector, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';
import { DEG, eq, sendToOpponent, sp, world } from './weapon-util';

// global gPartDescription, world, gOpponent, muInstance, gUseUDP, gGamePlace

export class VapenV4 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  pr: ModelResource | undefined = undefined;
  pm: Model | undefined = undefined;
  pstartTime: number | undefined = undefined;
  state: LSymbol;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: number | undefined = undefined;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  dz: number | undefined = undefined;
  m: Model;
  speed: number | undefined = undefined;
  rx: number | undefined = undefined;
  ry: number | undefined = undefined;
  rz: number | undefined = undefined;
  pipa: Model;
  counter: number | undefined = undefined;
  src: Transform | undefined = undefined;
  radie: number | undefined = undefined;

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
    let suffix = '1';
    if (rn === 2) {
      suffix = '2';
    }
    this.weaponNumber = n;
    this.state = sym('idle');
    const tamleft = 10;
    this.amLeft = rocket_encrypt(tamleft);
    this.pipa = world().model(lingoString((dot(G.gPartDescription, 'v4', 'model') as LList).getAt(1)) + suffix);
    this.m = world().newModel('granat' + this.sp);
    sprite(this.sp).member = member('pit');
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.state = sym('init');
  }

  InitSmoke() {
    this.pstartTime = the.milliSeconds;
    if (this.pm === undefined) {
      const pr = (this.pr = world().newModelResource('granatex' + this.sp, sym('particle')));
      this.pm = world().newModel('grexplo' + this.sp, pr);
      const ttexture = world().texture('fire1');
      if (!ttexture) {
        pr.texture = world().newTexture('fire1', sym('fromImageObject'), member('fire').image);
        pr.texture.renderFormat = sym('rgba8888');
      } else {
        pr.texture = world().texture('fire1');
      }
      // The grenade itself takes the particle resource too (pm already has it); the
      // explosion then gives it "pang", except when it went off below the floor
      // (z < -110), when it keeps the particles until the next #init.
      this.m.resource = pr;
      pr.lifeTime = 2000;
      pr.colorRange.start = rgb(255, 250, 80);
      pr.colorRange.end = rgb(0, 0, 0);
      pr.sizeRange.start = 50;
      pr.sizeRange.end = 5;
      pr.blendRange.start = 100.0;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('burst');
      pr.emitter.loop = 0;
      pr.emitter.angle = 180.0;
      pr.emitter.minSpeed = 750.0;
      pr.emitter.maxSpeed = 1500.0;
      pr.emitter.direction = vector(0.0, 1.0, 0.0);
      pr.gravity = vector(0.0, -45, 0.0);
      pr.emitter.numParticles = 50;
    }
    this.pm.worldPosition = this.m.worldPosition;
  }

  endSprite() {
    if (this.pm === undefined) {
      return;
    }
    if (world().model(this.pm.name) !== undefined) {
      // Deletes the grenade, not the explosion model (doneSprite deletes pm).
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

  /** The opponent's grenade went off on its own machine (the frame script's "explode" message). */
  explode() {
    if (this.state === sym('shoot')) {
      this.state = sym('initexplode');
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        let tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          this.speed = 9.0;
          const rangle = num(sp(this.robotSp, 'angle'));
          sprite(this.sp).loc = sprite(this.robotSp).loc;
          this.x = sprite(this.robotSp).locH - 9 * Math.cos(rangle * DEG);
          this.y = sprite(this.robotSp).locV - 9 * Math.sin(rangle * DEG);
          this.z = -25.0;
          this.dx = 0.02 * this.speed * (num(sp(this.robotSp, 'speed')) + 30) * Math.cos(rangle * DEG);
          this.dy = 0.02 * this.speed * (num(sp(this.robotSp, 'speed')) + 30) * Math.sin(rangle * DEG);
          this.dz = 3 * this.speed;
          this.m.transform.rotation = (sp(this.robotSp, 'pRobot') as Model).transform.rotation;
          this.m.rotate(20, 0, 0);
          this.rx = 7.0;
          this.ry = 0.0;
          this.rz = 0.0;
          this.pipa.translate(0, -20, 0);
          sendSprite(this.robotSp, 'rekyl', 13);
          playsound('granat shoot', 255);
          this.counter = 0;
          this.state = sym('rekyl1');
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          // Only the player's own count is shown (the opponent's stays at 10).
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
        } else {
          playsound('noammo', 255);
        }
      }
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('init'):
        this.m.resource = world().modelResource('Granat');
        this.m.parent = world().group('world');
        this.m.shader = world().model('Granat').shader;
        this.m.worldPosition = vector(0, -10000, 0);
        this.src = this.m.transform.duplicate();
        this.state = sym('idle');
        break;
      case sym('rekyl1'):
        this.pipa.translate(0, 0, 0);
        this.moveGranat();
        this.state = sym('rekyl2');
        break;
      case sym('rekyl2'):
        this.pipa.translate(0, 10, 0);
        this.moveGranat();
        this.state = sym('rekyl3');
        break;
      case sym('rekyl3'):
        this.pipa.translate(0, 10, 0);
        this.moveGranat();
        this.state = sym('shoot');
        break;
      case sym('shoot'):
        this.moveGranat();
        break;
      case sym('initexplode'):
        this.InitSmoke();
        if (this.z! < -110) {
          this.state = sym('idle');
        } else {
          this.m.resource = world().modelResource('pang');
          this.m.shader = world().model('pang').shader;
          this.m.transform.rotation = vector(0, 0, 0);
          // x and y are reused as the blast's growth factor and opacity.
          this.x = 1.2;
          this.y = 100;
          this.radie = 20.0;
          playsound('granat explode', 255);
          if (!eq(G.gGamePlace, sym('backyard'))) {
            const dist = this.m.worldPosition.distanceTo((sp(this.robot2Sp, 'pRobot') as Model).worldPosition);
            if (dist < 1000) {
              let del = (1500 - dist) / 1000;
              if (del > 1) {
                del = 1;
              }
              const damageamount = num(dot(G.gPartDescription, 'v4', 'skada')) * del;
              sendSprite(0, 'createSprite', 'smash', this.m.worldPosition, 0, rgb(255, 255, 100));
              sendSprite(this.robot2Sp, 'hopp', this.m.name, damageamount);
              sendSprite(this.robot2Sp, 'damage', damageamount, sym('splitter'));
            }
            sendToOpponent('explode', sym('sp'), this.sp);
          }
          const dist = this.m.worldPosition.distanceTo((sp(this.robotSp, 'pRobot') as Model).worldPosition);
          if (dist < 1000) {
            let del = (1500 - dist) / 1000;
            if (del > 1) {
              del = 1;
            }
            const damageamount = num(dot(G.gPartDescription, 'v4', 'skada')) * del;
            sendSprite(0, 'createSprite', 'smash', this.m.worldPosition, 0, rgb(255, 255, 100));
            sendSprite(this.robotSp, 'hopp', this.m.name, damageamount);
            sendSprite(this.robotSp, 'damage', damageamount, sym('splitter'));
          }
          this.state = sym('explode');
        }
        break;
      case sym('explode'):
        this.m.scale(this.x!);
        this.radie = this.radie! * this.x!;
        this.x = this.x! - 0.01;
        this.y = this.y! - 5;
        if (this.y < 0) {
          this.y = 0;
        }
        // The shader is the "pang" model's own, so every grenade's blast shares it.
        this.m.shader.blend = this.y;
        if (this.x < 1.0) {
          this.m.transform = this.src!;
          this.state = sym('done');
        }
        break;
      case sym('done'):
        if (the.milliSeconds > this.pstartTime! + 2000) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        if (this.pm !== undefined) {
          world().deleteModel(this.pm.name);
          world().deleteModelResource('granatex' + this.sp);
          this.pm = undefined;
        }
        this.state = sym('init');
        break;
    }
  }

  moveGranat() {
    this.counter = this.counter! + 1;
    const tx = this.dx!;
    const ty = this.dy!;
    if (intersects(this.sp, 15)) {
      this.dx = -this.dx!;
    }
    if (intersects(this.sp, 16)) {
      this.dx = -this.dx!;
    }
    if (intersects(this.sp, 17)) {
      this.dy = -this.dy!;
    }
    if (intersects(this.sp, 18)) {
      this.dy = -this.dy!;
    }
    if (intersects(this.sp, 25)) {
      this.dx = -this.dx!;
    }
    if (intersects(this.sp, 26)) {
      this.dx = -this.dx!;
    }
    if (this.z! > 0) {
      if (this.x! > 1500 || this.x! < 900) {
        if (this.dy !== ty) {
          this.dy = ty;
        }
        if (this.dx !== tx) {
          this.dx = tx;
        }
      }
      if (this.y! < -100 || this.y! > 500) {
        if (this.dx !== tx) {
          this.dx = tx;
        }
        if (this.dy !== ty) {
          this.dy = ty;
        }
      }
    }
    this.x = this.x! + this.dx!;
    this.y = this.y! + this.dy!;
    this.z = this.z! + this.dz!;
    this.dx = 0.99 * this.dx!;
    this.dy = 0.99 * this.dy!;
    this.dz = this.dz! - 2.6;
    if (this.z < -80) {
      if (intersects(this.sp, 6) || this.x > 1570 || this.x < 820 || this.y < -150 || this.y > 550) {
        if (this.z < -500) {
          this.state = sym('Remove');
        }
        put(this.x);
      } else {
        put(this.x);
        this.dz = 0.5 * num(abs(this.dz));
        this.dx = 0.5 * this.dx;
        this.dy = 0.5 * this.dy;
        this.rx = 3.0;
        this.rz = 5.0;
        if (Math.abs(this.dz) > 5 && this.z > -100) {
          playsound('placenail', 255);
        }
      }
    }
    sprite(this.sp).loc = point(this.x, this.y);
    this.m.worldPosition = mul(5, PointToVector(point(this.x, this.y), this.z)) as LVector;
    this.m.rotate(this.rx!, this.ry!, this.rz!);
    if (this.counter === 35) {
      this.state = sym('initexplode');
    }
  }
}
