// arena104 behavior 45 "vapen v15": the oil dropper. Each press drops an oil slick
// (an "oil behavior" sprite from the frame script's createSprite) under the robot;
// 10 of them, counted in the "doktor"-encrypted amLeft.

import { member, sendSprite, sprite } from '../../director';
import { lingoString, num, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';

// global gPartDescription, world

export class VapenV15 {
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
    const tamleft = 10;
    this.amLeft = rocket_encrypt(tamleft);
    sprite(this.sp).ink = 8;
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
        playsound('lim_olja_release', 255);
        sendSprite(0, 'createSprite', 'oil', PointToVector(sprite(this.robotSp).loc, -100), this.robotSp);
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
