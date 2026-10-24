// arena104 behavior 233 "vapen v22": armour repair. A press toggles it on while the
// armour is below its start value; each tick it then adds 0.1 armour for battery,
// until full, and the robot's paint-mapped parts pulse green.

import { G, dot, member, sendSprite, setDot, the } from '../../director';
import { Model, member3d } from '../../director/s3d';
import { LColor, add, contains, num, rgb, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq, sp } from './weapon-util';

// global gPartDescription, world, gUserData

/**
 * Colour arithmetic (`rgb(...) * n`, `rgb(...) + rgb(...)`), per channel, clamped to
 * 0-255 like rgb(). Not checked against Adobe's player.
 */
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
const colorMul = (c: LColor, k: number) => new LColor(clamp(c.red * k), clamp(c.green * k), clamp(c.blue * k));
const colorAdd = (a: LColor, b: LColor) => new LColor(clamp(a.red + b.red), clamp(a.green + b.green), clamp(a.blue + b.blue));

export class VapenV22 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol;
  pArmour: LValue;
  pTime: number;
  pColor: number;
  pDir: number;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    // The local user's armour, for the opponent's robot too.
    this.pArmour = dot(G.gUserData, 'propertyList', 'pansar');
    this.state = sym('armoff');
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = 'OFF';
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = 'OFF';
    }
    this.pTime = 0;
    this.pColor = 0;
    this.pDir = 1;
  }

  private pansar(): number {
    return num(dot(sp(this.robotSp, 'damageStatus'), 'pansar'));
  }

  fire(buttondown: LValue) {
    if (!eq(sp(this.robotSp, 'state'), sym('battery'))) {
      if (buttondown) {
        this.pTime = the.milliSeconds;
        if (this.state === sym('armoff') && this.pansar() < num(this.pArmour)) {
          this.state = sym('armon');
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'ON';
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = 'ON';
          }
          if (this.pansar() < num(this.pArmour)) {
            playsound('armon', 255);
          } else {
            // Unreachable: the same test as above.
            if (this.pansar() < num(this.pArmour)) {
              playsound('armoff', 255);
              this.state = sym('armoff');
              member('weapon' + this.weaponNumber + ' num').text = 'OFF';
            }
          }
        } else {
          if (this.pansar() < num(this.pArmour)) {
            if (this.state === sym('armon')) {
              this.state = sym('armoff');
              playsound('armoff', 255);
              // "weapon", not "oweapon", whichever robot this is.
              member('weapon' + this.weaponNumber + ' num').text = 'OFF';
            }
          }
        }
      }
    }
  }

  prepareFrame() {
    if (the.frame === 10 || the.frame === 20) {
      if (eq(sp(this.robotSp, 'state'), sym('battery'))) {
        this.state = sym('armoff');
      }
      switch (this.state) {
        case sym('armon'):
          if (this.pansar() < num(this.pArmour)) {
            const ds = sp(this.robotSp, 'damageStatus');
            setDot(ds, 'pansar', add(dot(ds, 'pansar'), 0.1));
            sendSprite(this.robotSp, 'spendEnergy', 0.05);
            if (the.milliSeconds > this.pTime + 1000) {
              this.pTime = the.milliSeconds;
              playsound('arm', 255);
            }
          } else {
            setDot(sp(this.robotSp, 'damageStatus'), 'pansar', this.pArmour);
            this.state = sym('armoff');
            playsound('armoff', 255);
            member('weapon' + this.weaponNumber + ' num').text = 'OFF';
          }
          break;
        case sym('armoff'):
          break;
      }
      if (this.state === sym('armon')) {
        if (this.pColor < 10) {
          this.pDir = 10;
        }
        if (this.pColor > 100) {
          this.pDir = -10;
        }
        this.pColor = this.pColor + this.pDir;
      } else {
        if (this.pColor > 0) {
          this.pColor = this.pColor - 10;
          if (this.pColor <= 0) {
            this.pColor = 0;
            this.setColor();
          }
        }
      }
      if (this.pColor > 0) {
        this.setColor();
      }
    }
  }

  setColor(_typ?: LValue) {
    const grp = member3d(1, 1).group('robot' + this.robotNumber);
    for (let i = 1; i <= grp.child.count; i++) {
      const c = grp.child(i);
      if (c instanceof Model) {
        if (contains((c.shaderList as unknown as { name: string }).name, 'map')) {
          // rgb(0, 2.55, 0) is rgb(0, 3, 0): rgb() rounds its channels.
          c.shaderList[1].emissive = colorMul(rgb(0, 2.55, 0), this.pColor);
          c.shaderList[1].specular = colorAdd(rgb(150, 100, 0), colorMul(rgb(2.55, 2.55, 2.55), this.pColor));
        }
      }
    }
  }
}
