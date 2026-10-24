// arena104 behavior 246 "vapen v34": the cloak. A press toggles it (while the battery
// lasts): the robot's shaders fade to 5% blend with a purple glow, costing energy; any
// #lightup for this robot (a hit, a shot, a crash) shows it at full blend again.

import { member, sendSprite, the } from '../../director';
import { Model, member3d, type Node3D } from '../../director/s3d';
import { LColor, contains, num, rgb, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq, sp } from './weapon-util';

// global gPartDescription, world

/**
 * `green * rgb(1, 0, 2.55)`: a colour times a number, per channel and clamped to
 * 0-255 (rgb() has already rounded 2.55 to 3). Not checked against Director.
 */
function colorTimes(k: number, c: LColor): LColor {
  const ch = (x: number) => Math.max(0, Math.min(255, Math.trunc(k * x)));
  return new LColor(ch(c.red), ch(c.green), ch(c.blue));
}

/**
 * `not <name> contains "Default"`: `not` binds tighter than `contains` (checked in the
 * bytecode), so this asks whether 0 or 1 contains "Default", which is never true.
 */
function notContainsQuirk(name: string): boolean {
  return contains(name ? 0 : 1, 'Default');
}

export class VapenV34 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol;
  pstartTime: LValue = undefined;
  blend: number;
  green: LValue = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    this.blend = 100;
    this.state = sym('cloakoff');
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = 'OFF';
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = 'OFF';
    }
  }

  fire(buttondown: LValue) {
    if (!eq(sp(this.robotSp, 'state'), sym('battery'))) {
      if (buttondown) {
        if (this.state === sym('cloakon')) {
          this.state = sym('cloakoff');
          playsound('cloakoff_sound', 255);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'OFF';
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = 'OFF';
          }
        } else {
          this.state = sym('cloakon');
          playsound('cloakon_sound', 255);
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = 'ON';
          } else {
            member('oweapon' + this.weaponNumber + ' num').text = 'ON';
          }
        }
      }
    }
  }

  prepareFrame() {
    if (the.frame === 10 || the.frame === 20) {
      if (eq(sp(this.robotSp, 'state'), sym('battery')) && this.state === sym('cloakon')) {
        this.state = sym('cloakoff');
      }
    }
    // green starts as VOID, which counts as 0 here.
    switch (this.state) {
      case sym('cloakon'):
        if (num(this.green) < 100) {
          this.green = num(this.green) + 10;
          this.setcloak(sym('color'));
        } else {
          if (num(this.green) > 100) {
            this.green = 100;
            this.setcloak(sym('color'));
          }
        }
        if (this.blend > 5) {
          this.blend = this.blend - 5;
          this.setcloak(sym('blend'));
        } else {
          if (this.blend < 5) {
            this.blend = 5;
            this.setcloak(sym('blend'));
          }
        }
        sendSprite(this.robotSp, 'spendEnergy', 0.02);
        break;
      case sym('cloakoff'):
        if (num(this.green) > 0) {
          this.green = num(this.green) - 5;
          this.setcloak(sym('color'));
        } else {
          if (num(this.green) < 0) {
            this.green = 0;
            this.setcloak(sym('color'));
          }
        }
        if (this.blend < 100) {
          this.blend = this.blend + 10;
          this.setcloak(sym('blend'));
        } else {
          if (this.blend > 100) {
            this.blend = 100;
            this.setcloak(sym('blend'));
          }
        }
        break;
    }
  }

  // The robot group is "robot" & robotNumber, not the suffix the other weapons use.
  private robotGroup() {
    return member3d(1, 1).group('robot' + this.robotNumber);
  }

  setcloak(typ: LSymbol) {
    const grp = this.robotGroup();
    if (typ === sym('blend')) {
      for (let i = 1; i <= grp.child.count; i++) {
        const c: Node3D = grp.child[i];
        if (c instanceof Model) {
          if (!contains(c.shaderList[1].name, 'Default')) {
            c.shaderList[1].blend = this.blend;
          }
        }
        for (let j = 1; j <= c.child.count; j++) {
          const cc: Node3D = c.child[j];
          if (cc instanceof Model) {
            if (!contains(cc.shaderList[1].name, 'Default')) {
              cc.shaderList[1].blend = this.blend;
            }
          }
        }
      }
    } else {
      for (let i = 1; i <= grp.child.count; i++) {
        const c: Node3D = grp.child[i];
        if (c instanceof Model) {
          if (!contains(c.shaderList[1].name, 'Default')) {
            c.shaderList[1].emissive = colorTimes(num(this.green), rgb(1, 0, 2.55));
          }
        }
        for (let j = 1; j <= c.child.count; j++) {
          const cc: Node3D = c.child[j];
          if (cc instanceof Model) {
            if (!contains(cc.shaderList[1].name, 'Default')) {
              cc.shaderList[1].emissive = colorTimes(num(this.green), rgb(1, 0, 2.55));
            }
          }
        }
      }
    }
  }

  lightup(robot: LValue) {
    if (eq(robot, this.robotNumber)) {
      if (this.state === sym('cloakon')) {
        this.blend = 100;
        const grp = this.robotGroup();
        for (let i = 1; i <= grp.child.count; i++) {
          const c: Node3D = grp.child[i];
          if (c instanceof Model) {
            if (notContainsQuirk(c.shaderList[1].name)) {
              c.shaderList[1].blend = 100;
            }
          }
          for (let j = 1; j <= c.child.count; j++) {
            const cc: Node3D = c.child[j];
            if (cc instanceof Model) {
              if (notContainsQuirk(cc.shaderList[1].name)) {
                cc.shaderList[1].blend = 100;
              }
            }
          }
        }
      }
    }
  }
}
