// arena104 behavior 41 "vapen v13": the nail dropper. Each press drops a nail (a "nail
// behavior" sprite from the frame script's createSprite) under the robot; 25 nails,
// counted in the "doktor"-encrypted amLeft.

import { G, member, sendSprite, sprite } from '../../director';
import { vector } from '../../director/s3d';
import { lingoString, num, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';
import { world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber

export class VapenV13 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
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
    world().model('spik' + suffix).worldPosition = vector(0, -10000, 0);
    sprite(this.sp).ink = 8;
    const tamleft = 25;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      let tamleft = num(rocket_decrypt(this.amLeft));
      if (tamleft > 0) {
        playsound('placenail', 255);
        sendSprite(0, 'createSprite', 'nail', PointToVector(sprite(this.robotSp).loc, -100), this.robotSp);
        tamleft = tamleft - 1;
        this.amLeft = rocket_encrypt(tamleft);
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        } else {
          member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        }
      } else {
        playsound('noammo', 255);
      }
    }
  }
}
