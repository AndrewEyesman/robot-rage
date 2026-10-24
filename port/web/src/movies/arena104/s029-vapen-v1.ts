// arena104 behavior 29 "vapen v1": the mine layer. Each press drops a mine (a "mine
// behavior" sprite from the frame script's createSprite) under the robot; 20 mines,
// counted in the "doktor"-encrypted amLeft.

import { G, member, sendSprite, sprite } from '../../director';
import { lingoString, num, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';
import { world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber

export class VapenV1 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  suffix: string;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    const tamleft = 20;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
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
    world().model('Mina' + this.suffix).parent = world().group('world');
    world().model('Mina' + this.suffix).worldPosition.y = -10000;
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      let tamleft = num(rocket_decrypt(this.amLeft));
      if (tamleft > 0) {
        sendSprite(0, 'createSprite', 'mine', PointToVector(sprite(this.robotSp).loc, -100), this.robotSp);
        playsound('placenail', 255);
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
