// arena104 behavior 244 "vapen v32": the remote charge. A press drops a "charge
// behavior" sprite under the robot (10 charges); the next press sets off every charge
// this robot has laid (sendAllSprites #charges).

import { G, member, sendAllSprites, sendSprite, sprite } from '../../director';
import { lingoString, num, sym, vector, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';
import { world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber

export class VapenV32 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  state: LSymbol;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    const tamleft = 10;
    this.amLeft = rocket_encrypt(tamleft);
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
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.state = sym('idle');
    world().model('RCMine' + suffix).parent = world().group('world');
    world().model('RCMine' + suffix).worldPosition = vector(0, -10000, 0);
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        let tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          sendSprite(0, 'createSprite', 'charge', PointToVector(sprite(this.robotSp).loc, -100), this.robotSp);
          playsound('placenail', 255);
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          this.state = sym('ready');
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
        } else {
          playsound('noammo', 255);
        }
      } else {
        if (this.state === sym('ready')) {
          sendAllSprites(sym('charges'), this.robotSp);
          this.state = sym('idle');
        }
      }
    }
  }
}
