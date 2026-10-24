// arena104 behavior 243 "vapen v31": the mini car (one per match). A press opens the
// hatch and launches the little remote car: the robot stops (#startmini) and its arrow
// keys steer the car (#steermini) through the camera's "mini" view, until it hits a
// wall, a robot or the edge, or comes near the other robot, and blows up like a big
// grenade. In a match the car is mirrored on the other side with minigo / setmini /
// miniboom messages.

import { G, SoundMember, call, dot, intersects, member, put, sendSprite, sound, sprite } from '../../director';
import { member3d, transform, vector, type Model } from '../../director/s3d';
import { LList, add, char, mul, neg, num, point, rgb, sym, type LPoint, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector, theOVerlay } from './s006-arena-3d';
import { eq, sendToOpponent, sp, world } from './weapon-util';

// global gPartDescription, world, gGamePlace, muInstance, gOpponent, gUseUDP, gCamera

/** sound(ch).play([#member: member(name) {, #rateShift: r}]) */
function playOn(ch: number, name: string, rateShift?: number) {
  const m = member(name);
  if (m instanceof SoundMember) sound(ch).play(m, rateShift === undefined ? {} : { rateShift });
}

const partModel = (k: number) => (dot(G.gPartDescription, 'v31', 'model') as LList).getAt(k) as string;

export class VapenV31 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  suffix: string;
  counter: LValue = undefined;
  dangle: number | undefined = undefined;
  angle: number | undefined = undefined;
  dx0: LValue = undefined;
  dy0: LValue = undefined;
  dz0: LValue = undefined;
  state: LSymbol;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: number | undefined = undefined;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  dz: number | undefined = undefined;
  m: Model | undefined = undefined;
  speed: number | undefined = undefined;
  acc: number | undefined = undefined;
  rx: LValue = undefined;
  ry: LValue = undefined;
  rz: LValue = undefined;
  radie: LValue = undefined;
  door: LValue = undefined;
  pSteps: LValue = undefined;
  newX: number | undefined = undefined;
  newY: number | undefined = undefined;
  newangle: number | undefined = undefined;
  fall: LValue = undefined;
  ljud: number;
  oldspeed: LValue = undefined;

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
    sprite(this.sp).ink = 8;
    this.suffix = '1';
    if (rn === 2) {
      this.suffix = '2';
    }
    sprite(this.sp).member = member('mini');
    const tamleft = 4;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = 'OFF';
    }
    const theCamera = member3d(1, 1).camera('DefaultView');
    let theTexture = member3d(1, 1).texture('minicam');
    if (theTexture === undefined) {
      theTexture = member3d(1, 1).newTexture('minicam', sym('fromCastMember'), member('minicam'));
      theTexture.renderFormat = sym('rgba8888');
      theCamera.addOverlay(theTexture, point(0, 0), 0);
      theCamera.overlay[theOVerlay('minicam')!].blend = 0.0;
    }
    const tm = world().model(partModel(1) + this.suffix).child[1];
    this.ljud = 0;
    tm.transform.scale.z = 2;
    tm.transform.position.z = -65;
    this.state = sym('idle');
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        let tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          tamleft = 0;
          this.amLeft = rocket_encrypt(tamleft);
          this.angle = sp(this.robotSp, 'angle') as number;
          sprite(this.sp).loc = add(sprite(this.robotSp).loc, mul(30, point(Math.cos((this.angle / 180.0) * Math.PI), Math.sin((this.angle / 180.0) * Math.PI)))) as LPoint;
          sendSprite(this.robotSp, 'startmini', this.sp);
          this.m = world().model(partModel(2) + this.suffix);
          this.state = sym('initmini');
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'ON';
            call('SetView', G.gCamera, 'mini', this.m);
          }
        } else {
          playsound('noammo', 255);
        }
      }
    }
  }

  minigo(list: LValue) {
    world().group('world').addChild(this.m!, sym('preserveWorld'));
    this.x = dot(list, 'x');
    this.y = dot(list, 'y');
    this.z = dot(list, 'z');
    this.angle = dot(list, 'angle');
    this.newX = dot(list, 'x');
    this.newY = dot(list, 'y');
    this.newangle = dot(list, 'angle');
    this.dx = dot(list, 'dx');
    this.dy = dot(list, 'dy');
    this.dz = 0;
    this.state = sym('moveremote');
  }

  miniboom(list: LValue) {
    this.x = dot(list, 'x');
    this.y = dot(list, 'y');
    this.m!.transform.position = mul(5, PointToVector(point(this.x!, this.y!), this.z)) as LVector;
    this.state = sym('initexplode');
  }

  setmini(list: LValue) {
    this.newX = dot(list, 'x');
    this.newY = dot(list, 'y');
    this.newangle = dot(list, 'angle');
  }

  explode() {
    if (this.state === sym('shoot')) {
      this.state = sym('initexplode');
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('initmini'):
        // door starts as VOID, which counts as 0.
        this.door = num(this.door) + 5;
        if (this.door <= 90) {
          world().model(partModel(1) + this.suffix).child[2].transform.rotation.x = 180 - this.door;
        } else {
          if (this.robotNumber === 1) {
            this.state = sym('initmove');
          }
        }
        break;
      case sym('initmove'): {
        const m = this.m!;
        this.speed = 0.0;
        const t1 = m.getWorldTransform();
        world().group('world').addChild(m, sym('preserveWorld'));
        const pt = sprite(this.robotSp).loc;
        this.x = pt.locH as number;
        this.y = pt.locV as number;
        this.z = t1.position.y / 5;
        this.dangle = 0;
        this.angle = sp(this.robotSp, 'angle') as number;
        const rot = world().model(partModel(1) + this.suffix).transform.rotation;
        if (rot.x !== 0 || rot.y !== 0 || rot.z !== 0) {
          this.angle = this.angle + 180;
        }
        this.dx = Math.cos((this.angle * Math.PI) / 180);
        this.dy = Math.sin((this.angle * Math.PI) / 180);
        if (!eq(G.gGamePlace, sym('backyard'))) {
          sendToOpponent('minigo', sym('sp'), this.sp, sym('x'), this.x, sym('y'), this.y, sym('z'), this.z, sym('angle'), this.angle, sym('dx'), this.dx, sym('dy'), this.dy);
        }
        this.dz = 0;
        this.state = sym('moveMini');
        break;
      }
      case sym('moveMini'):
        this.moveMini();
        break;
      case sym('moveremote'): {
        const TRN = transform();
        TRN.rotation = vector(0, this.angle!, 0);
        const FRAM = neg(TRN.xAxis) as LVector;
        const SIDA = neg(TRN.zAxis) as LVector;
        const AIM = vector(this.newX! - this.x!, 0, -(this.newY! - this.y!));
        this.speed = AIM.magnitude * 0.1;
        AIM.normalize();
        const turn = SIDA.dot(AIM);
        this.angle = this.angle! + turn * 10;
        if (Math.abs(this.speed) < 1) {
          let diff = 45 + this.newangle! - this.angle;
          while (diff > 180) {
            diff = diff - 360;
          }
          while (diff < -180) {
            diff = diff + 360;
          }
          this.angle = this.angle + 0.2 * diff;
        }
        this.speed = this.speed * -FRAM.dot(AIM);
        if (this.speed < -60) {
          this.speed = -60;
        }
        if (this.speed > 80) {
          this.speed = 80;
        }
        const move = mul(-this.speed, point(FRAM.x, -FRAM.z)) as LPoint;
        this.x = this.x! + num(move.locH);
        this.y = this.y! + num(move.locV);
        sprite(this.sp).loc = point(this.x, this.y);
        sprite(this.sp).rotation = this.angle;
        this.m!.transform.position = mul(5, PointToVector(point(this.x, this.y), this.z)) as LVector;
        this.m!.transform.rotation = vector(0, -this.angle - 90, 0);
        break;
      }
      case sym('initexplode'): {
        const m = this.m!;
        if (this.robotNumber === 1) {
          if (!eq(G.gGamePlace, sym('backyard'))) {
            sendToOpponent('miniboom', sym('sp'), this.sp, sym('x'), this.x, sym('y'), this.y, sym('z'), this.z);
          }
        }
        const t1 = m.getWorldTransform();
        world().model('explosion').worldPosition = t1.position;
        world().modelResource('explosion').emitter.numParticles = 50;
        // `5 + suffix`: the string counts as a number, channel 6 or 7.
        playOn(5 + Number(this.suffix), 'granat explode');
        let dist: number;
        let del: number;
        let damageamount: number;
        if (!eq(G.gGamePlace, sym('backyard'))) {
          dist = sp(this.robot2Sp, 'pRobot').worldPosition.distanceTo(add(m.worldPosition, vector(0, 200, 0)));
          if (dist < 5000) {
            del = (7500 - dist) / 5000;
            if (del > 1) {
              del = 1;
            }
            damageamount = dot(G.gPartDescription, 'v31', 'skada') * del;
            sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
            sendSprite(this.robot2Sp, 'hopp', m.name, damageamount);
            sendSprite(this.robot2Sp, 'damage', damageamount, sym('splitter'));
          }
        }
        dist = sp(this.robotSp, 'pRobot').worldPosition.distanceTo(add(m.worldPosition, vector(0, 200, 0)));
        if (dist < 5000) {
          del = (7500 - dist) / 5000;
          if (del > 1) {
            del = 1;
          }
          damageamount = dot(G.gPartDescription, 'v31', 'skada') * del;
          sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
          sendSprite(this.robotSp, 'hopp', m.name, damageamount);
          sendSprite(this.robotSp, 'damage', damageamount, sym('splitter'));
        }
        this.state = sym('explode');
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = '0';
          call('SetView', G.gCamera, 'minioff');
        }
        m.transform.position.y = -10000;
        break;
      }
      case sym('explode'):
        this.door = num(this.door) - 5;
        if (this.door >= 0) {
          world().model(partModel(1) + this.suffix).child[2].transform.rotation.x = 180 - this.door;
        } else {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        sendSprite(this.robotSp, 'stopmini');
        sendSprite(0, 'removeSprite', this.sp);
        this.state = sym('idle');
        break;
      case sym('left'):
        this.checkexplo();
        break;
    }
  }

  moveMini() {
    const m = this.m!;
    this.counter = num(this.counter) + 1;
    this.acc = Math.abs(this.speed!) - Math.abs(num(this.oldspeed));
    this.oldspeed = this.speed;
    // The engine sound restarts every frame, pitched by the speed.
    playOn(5 + Number(this.suffix), 'minicar', this.speed);
    sound(5 + Number(this.suffix)).volume = (this.speed! * 255) / 10;
    this.x = this.x! + this.speed! * this.dx!;
    this.y = this.y! + this.speed! * this.dy!;
    this.angle = this.angle! + this.dangle! * (1.0 + Math.abs(this.speed!) / 20);
    sprite(this.sp).loc = point(this.x, this.y);
    sprite(this.sp).rotation = this.angle;
    this.dx = Math.cos((this.angle / 180.0) * Math.PI);
    this.dy = Math.sin((this.angle / 180.0) * Math.PI);
    m.transform.position = mul(5, PointToVector(point(this.x, this.y), this.z)) as LVector;
    m.transform.rotation = vector(0, -this.angle - 90, 0);
    this.dangle = this.dangle! * 0.8;
    this.speed = this.speed! * 0.9;
    if (this.robotNumber === 1) {
      this.pSteps = num(this.pSteps) + 1;
      if (this.pSteps >= 30) {
        if (!eq(G.gGamePlace, sym('backyard'))) {
          sendToOpponent('setmini', sym('sp'), this.sp, sym('x'), this.x, sym('y'), this.y, sym('angle'), this.angle);
        }
        this.pSteps = 0;
      }
    }
    this.checkexplo();
    put(this.x);
    if (this.x > 1580 || this.x < 820 || intersects(this.sp, 6)) {
      this.state = sym('initexplode');
    }
  }

  leavemini() {
    call('SetView', G.gCamera, 'minioff');
    this.state = sym('left');
  }

  checkexplo() {
    if (this.robotNumber === 1) {
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
      if (num(this.counter) > 100) {
        if (intersects(this.sp, 10) || intersects(this.sp, 20)) {
          this.state = sym('initexplode');
        }
      }
      if (!eq(G.gGamePlace, sym('backyard'))) {
        if (this.m!.worldPosition.distanceTo(sp(this.robot2Sp, 'pRobot').worldPosition) < 400) {
          this.state = sym('initexplode');
        }
      }
    }
  }

  steermini(Keys: string, speed0: number) {
    if (this.state === sym('moveMini')) {
      if (char(Keys, 1) === '1') {
        this.dangle = this.dangle! - 1;
        if (this.dangle < -15) {
          this.dangle = -15;
        }
      }
      if (char(Keys, 2) === '1') {
        this.dangle = this.dangle! + 1;
        if (this.dangle > 15) {
          this.dangle = 15;
        }
      }
      if (char(Keys, 3) === '1') {
        this.speed = this.speed! + 1;
        if (this.speed > 80) {
          this.speed = 80;
        }
      }
      if (char(Keys, 4) === '1') {
        this.speed = this.speed! - 1;
        if (num(this.counter) > 100) {
          if (this.speed < -60) {
            this.speed = -60;
          } else {
            if (this.speed < 0) {
              this.speed = 0;
            }
          }
        }
        if (speed0 > 5 && this.speed < speed0) {
          this.speed = speed0;
        }
      }
    }
  }
}
