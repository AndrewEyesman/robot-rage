// arena104 behavior 30 "vapen v2": the flame thrower. A press (at most every 500 ms)
// sends a "throwfire behavior" sprite out ahead of the robot; 20 shots.

import { member, sendSprite, sprite, the } from '../../director';
import { lingoString, num, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { PointToVector } from './s006-arena-3d';
import { sp } from './weapon-util';

// global gPartDescription, world

export class VapenV2 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  lastfiretime: number;

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
    void suffix;
    this.weaponNumber = n;
    const tamleft = 20;
    this.amLeft = rocket_encrypt(tamleft);
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
    }
    this.lastfiretime = the.milliSeconds;
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      let tamleft = num(rocket_decrypt(this.amLeft));
      if (tamleft > 0) {
        if (the.milliSeconds > this.lastfiretime + 500) {
          this.lastfiretime = the.milliSeconds;
          sendSprite(0, 'createSprite', 'throwfire', PointToVector(sprite(this.robotSp).loc, -500), this.robotNumber, this.robotSp, sp(this.robotSp, 'angle'));
          playsound('flamethrow', 255);
          tamleft = tamleft - 1;
          this.amLeft = rocket_encrypt(tamleft);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
          }
        }
      } else {
        playsound('noammo', 255);
      }
    }
  }
}
