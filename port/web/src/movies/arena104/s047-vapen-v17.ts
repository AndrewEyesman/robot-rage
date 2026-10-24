// arena104 behavior 47 "vapen v17": homing rockets, four of them. Like v16, but the
// rocket steers itself toward the other robot's map sprite for its first 70 frames
// (and loses 2% of its speed each frame) instead of turning with the launcher.

import { G, dot, intersects, member, sendSprite, sprite } from '../../director';
import { transform, vector, type Model } from '../../director/s3d';
import { lingoString, mod, mul, num, point, rgb, sym, type LList, type LPoint, type LSymbol, type LValue, type LVector } from '../../lingo';
import { GetAngle } from '../robotwars/s007-jump-movie';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector, VectorToPoint, uncloak } from './s006-arena-3d';
import { eq, sendToOpponent, sp, world } from './weapon-util';

// global gPartDescription, world, gGamePlace, muInstance, gOpponent, gUseUDP

export class VapenV17 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  suffix: string;
  counter: number | undefined = undefined;
  angle: number | undefined = undefined;
  dx0: LValue = undefined;
  dy0: LValue = undefined;
  dz0: LValue = undefined;
  state: LSymbol;
  // x and y are the rocket's map position while it flies, then the explosion's scale
  // step and blend (the original reuses them).
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: number | undefined = undefined;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  dz: number | undefined = undefined;
  m: Model | undefined = undefined;
  speed: number | undefined = undefined;
  acc: number | undefined = undefined;
  rx: number | undefined = undefined;
  ry: number | undefined = undefined;
  rz: number | undefined = undefined;
  radie: number | undefined = undefined;
  trg1Pos: LPoint | undefined = undefined;
  trg2Pos: LValue = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    this.state = sym('idle');
    this.suffix = '1';
    if (rn === 2) {
      this.suffix = '2';
    }
    sprite(this.sp).ink = 8;
    sprite(this.sp).member = member('v17 f');
    const tamleft = 4;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.state = sym('idle');
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        let tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          this.speed = 0.0;
          sprite(this.sp).loc = sprite(this.robotSp).loc;
          const n = mod(tamleft + 2, 4) + 1;
          const m = (this.m = world().model(lingoString((dot(G.gPartDescription, 'v17', 'model') as LList).getAt(n)) + this.suffix));
          const t1 = m.getWorldTransform().duplicate();
          m.parent = world().group('world');
          uncloak(m.name);
          m.transform = t1;
          if (n < 3) {
            m.rotate(0, 0, 180);
          }
          const pt = VectorToPoint(mul(0.2, t1.position) as LVector);
          this.x = num(pt.locH);
          this.y = num(pt.locV);
          this.z = t1.position.y / 5;
          this.angle = num(sp(this.robotSp, 'angle'));
          this.dx0 = sp(this.robotSp, 'dx');
          this.dy0 = sp(this.robotSp, 'dy');
          this.dx = Math.cos((this.angle * Math.PI) / 180);
          this.dy = Math.sin((this.angle * Math.PI) / 180);
          this.dz = 1.0;
          this.rx = 0.0;
          this.ry = 0.0;
          this.rz = 0.0;
          this.speed = num(sp(this.robotSp, 'fart')) / 25.0 + 5.0;
          this.angle = num(sp(this.robotSp, 'angle'));
          this.acc = 0.0;
          sendSprite(this.robotSp, 'rekyl', 3);
          playsound('skott_18', 255);
          sendSprite(0, 'createSprite', 'rocketsmoke', PointToVector(sprite(this.sp).loc, -90), this.robotNumber, rgb(255, 255, 100), m);
          this.counter = 0;
          this.state = sym('shoot');
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          // Only the player's own counter is updated (unlike v16).
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
        } else {
          playsound('noammo', 255);
        }
      }
    }
  }

  explode() {
    if (this.state === sym('shoot')) {
      this.state = sym('initexplode');
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('shoot'):
        this.moveRocket();
        break;
      case sym('initexplode'): {
        const m = this.m!;
        const t1 = m.getWorldTransform();
        m.child[1].removeFromWorld();
        m.child[1].removeFromWorld();
        m.resource = world().modelResource('pang');
        m.shader = world().model('pang').shader;
        m.transform = transform();
        m.worldPosition = t1.position;
        world().model('explosion').worldPosition = t1.position;
        world().modelResource('explosion').emitter.numParticles = 50;
        this.x = 1.2;
        this.y = 100;
        this.radie = 20.0;
        let dist: number;
        let del: number;
        let damageamount: number;
        if (!eq(G.gGamePlace, sym('backyard'))) {
          dist = m.worldPosition.distanceTo((sp(this.robot2Sp, 'pRobot') as Model).worldPosition);
          if (dist < 500) {
            del = (750 - dist) / 500;
            if (del > 1) {
              del = 1;
            }
            damageamount = num(dot(G.gPartDescription, 'v17', 'skada')) * del;
            sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
            sendSprite(this.robot2Sp, 'hopp', m.name, damageamount);
            sendSprite(this.robot2Sp, 'damage', damageamount, sym('splitter'));
          }
          sendToOpponent('explode', sym('sp'), this.sp);
        }
        dist = m.worldPosition.distanceTo((sp(this.robotSp, 'pRobot') as Model).worldPosition);
        if (dist < 500) {
          del = (750 - dist) / 500;
          if (del > 1) {
            del = 1;
          }
          damageamount = num(dot(G.gPartDescription, 'v17', 'skada')) * del;
          sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
          sendSprite(this.robotSp, 'hopp', m.name, damageamount);
          sendSprite(this.robotSp, 'damage', damageamount, sym('splitter'));
        }
        playsound('granat explode', 255);
        this.state = sym('explode');
        break;
      }
      case sym('explode'):
        this.m!.scale(this.x!);
        this.radie = this.radie! * this.x!;
        this.x = this.x! - 0.01;
        this.y = this.y! - 5;
        if (this.y < 0) {
          this.y = 0;
        }
        this.m!.shader.blend = this.y;
        if (this.x < 1.0) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        this.m!.removeFromWorld();
        this.state = sym('idle');
        break;
    }
  }

  moveRocket() {
    this.counter = this.counter! + 1;
    if (this.counter < 20) {
      this.acc = 0.5;
    } else {
      if (this.counter < 70) {
        this.acc = -0.005;
      }
    }
    this.speed = this.speed! + this.acc!;
    this.speed = this.speed * 0.98;
    if (this.speed < 0) {
      this.speed = 0;
    }
    this.x = this.x! + this.speed * this.dx!;
    this.y = this.y! + this.speed * this.dy!;
    sprite(this.sp).loc = point(this.x, this.y);
    this.angle = num(GetAngle(this.dx!, this.dy!));
    sprite(this.sp).rotation = this.angle;
    for (let i = 15; i <= 18; i++) {
      if (intersects(this.sp, i)) {
        this.state = sym('initexplode');
      }
    }
    for (let i = 25; i <= 26; i++) {
      if (intersects(this.sp, i)) {
        this.state = sym('initexplode');
      }
    }
    this.trg1Pos = sprite(this.robot2Sp).loc;
    if (this.counter < 70) {
      let k = 0.1;
      if (this.x < num(this.trg1Pos.locH)) {
        this.dx = this.dx! + k;
      } else {
        this.dx = this.dx! - k;
      }
      if (this.y > num(this.trg1Pos.locV)) {
        this.dy = this.dy! - k;
      } else {
        this.dy = this.dy! + k;
      }
      k = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
      if (k === 0) {
        k = 1;
      }
      this.dx = this.dx / k;
      this.dy = this.dy / k;
    }
    this.m!.transform.position = mul(5, PointToVector(point(this.x, this.y), this.z)) as LVector;
    this.m!.transform.rotation = vector(0, -this.angle + 90, 0);
    if (!eq(G.gGamePlace, sym('backyard'))) {
      if (this.m!.worldPosition.distanceTo((sp(this.robot2Sp, 'pRobot') as Model).worldPosition) < 400) {
        this.state = sym('initexplode');
      }
    }
    if (this.counter === 90) {
      this.state = sym('initexplode');
    }
  }
}
