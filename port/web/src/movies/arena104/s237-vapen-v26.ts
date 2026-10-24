// arena104 behavior 237 "vapen v26": the disc launcher. Twenty razor discs ("disc
// behavior" sprites from createSprite); the launcher's disc and glow spin all the time.
// The models the discs are cloned from (disc/flame/glow per robot, and the discC1/C2
// shader sources for discs stuck in a robot) are made here.

import { G, member, sendSprite } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { lingoString, num, sym, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { world } from './weapon-util';

// global gPartDescription, world, gPlayerNumber

export class VapenV26 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  suffix: string;
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
    const disc = world().model('spinndisc' + this.suffix);
    const child = (i: number) => disc.child(i) as Model;
    child(1).shader.texture!.renderFormat = sym('rgba8888');
    child(2).shader.texture!.renderFormat = sym('rgba8888');
    child(3).cloneDeep('disc' + this.suffix);
    child(1).cloneDeep('flame' + this.suffix);
    child(2).cloneDeep('glow' + this.suffix);
    world().model('disc' + this.suffix).parent = world().group('world');
    world().model('flame' + this.suffix).parent = world().group('world');
    world().model('glow' + this.suffix).parent = world().group('world');
    const pos = vector(0, -10000, 0);
    world().model('disc' + this.suffix).worldPosition = pos;
    world().model('flame' + this.suffix).worldPosition = pos;
    world().model('glow' + this.suffix).worldPosition = pos;
    if (world().model('discC1') === undefined) {
      child(3).cloneDeep('discC1');
      child(1).cloneDeep('flameC1');
      child(2).cloneDeep('glowC1');
      child(3).cloneDeep('discC2');
      child(1).cloneDeep('flameC2');
      child(2).cloneDeep('glowC2');
    }
    world().model('discC1').parent = world().group('world');
    world().model('flameC1').parent = world().group('world');
    world().model('glowC1').parent = world().group('world');
    world().model('discC1').worldPosition = pos;
    world().model('flameC1').worldPosition = pos;
    world().model('glowC1').worldPosition = pos;
    world().model('discC2').parent = world().group('world');
    world().model('flameC2').parent = world().group('world');
    world().model('glowC2').parent = world().group('world');
    world().model('discC2').worldPosition = pos;
    world().model('flameC2').worldPosition = pos;
    world().model('glowC2').worldPosition = pos;
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      let tamleft = num(rocket_decrypt(this.amLeft));
      if (tamleft > 0) {
        sendSprite(0, 'createSprite', 'disc', world().model('spinndisc' + this.suffix).child(3).worldPosition, this.robotSp);
        playsound('razor_sound', 255);
        tamleft = tamleft - 1;
        this.amLeft = rocket_encrypt(tamleft);
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        } else {
          member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        }
        if (tamleft === 0) {
          // By robotNumber, not suffix as everywhere else in this script (a mismatch when
          // gPlayerNumber = 2).
          const launcher = world().model('spinndisc' + this.robotNumber);
          for (let i = 1; i <= launcher.child.count - 1; i++) {
            (launcher.child(i) as Model).visibility = sym('none');
          }
        }
      } else {
        playsound('noammo', 255);
      }
    }
  }

  prepareFrame() {
    if (world().model('spinndisc' + this.suffix) !== undefined) {
      world().model('spinndisc' + this.suffix).child(3).rotate(0, -20, 0);
      world().model('spinndisc' + this.suffix).child(2).rotate(0, 20, 0);
    }
  }
}
