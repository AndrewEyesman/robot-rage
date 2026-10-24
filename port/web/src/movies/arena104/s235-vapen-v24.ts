// arena104 behavior 235 "vapen v24": the spear gun. Five spears, each fired from its
// own barrel ("spear behavior" sprites from createSprite); the gun's sprite follows
// the robot and rams like a spike for a fifth of the part's damage.

import { G, dot, member, sendSprite, sprite, the, intersects } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { div, lingoString, num, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { eq, sp, world } from './weapon-util';

// global gPartDescription, world, gGamePlace, muInstance, gOpponent, gUseUDP, gPlayerNumber

export class VapenV24 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string | undefined = undefined;
  suffix: string;
  counter: LValue = undefined;
  angle: number | undefined = undefined;
  dx0: LValue = undefined;
  dy0: LValue = undefined;
  dz0: LValue = undefined;
  state: LSymbol;
  x: LValue = undefined;
  y: LValue = undefined;
  z: LValue = undefined;
  dx: LValue = undefined;
  dy: LValue = undefined;
  dz: LValue = undefined;
  m: LValue = undefined;
  speed: LValue = undefined;
  acc: LValue = undefined;
  rx: LValue = undefined;
  ry: LValue = undefined;
  rz: LValue = undefined;
  radie: LValue = undefined;
  /** A property here, not the global the other rams share. */
  gLastHitTime: number;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.weaponNumber = n;
    sprite(this.sp).ink = 8;
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
    this.gLastHitTime = 0;
    this.state = sym('init');
    const gun = world().model('speargun' + this.suffix);
    if (world().model('spearC1') === undefined) {
      gun.child(1).cloneDeep('spear1');
      gun.child(1).cloneDeep('spear2');
      gun.child(1).cloneDeep('spearC1');
      gun.child(1).cloneDeep('spearC2');
      (gun.child(1) as Model).shader = world().model('spearC' + this.suffix).shader;
      (gun.child(2) as Model).shader = world().model('spearC' + this.suffix).shader;
      (gun.child(3) as Model).shader = world().model('spearC' + this.suffix).shader;
      (gun.child(4) as Model).shader = world().model('spearC' + this.suffix).shader;
      (gun.child(5) as Model).shader = world().model('spearC' + this.suffix).shader;
    }
    world().model('spear1').parent = world().group('world');
    world().model('spear2').parent = world().group('world');
    world().model('spearC1').parent = world().group('world');
    world().model('spearC2').parent = world().group('world');
    world().model('spear1').worldPosition = vector(0, -10000, 0);
    world().model('spear2').worldPosition = vector(0, -10000, 0);
    world().model('spearC1').worldPosition = vector(0, -10000, 0);
    world().model('spearC2').worldPosition = vector(0, -10000, 0);
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      // amLeft is VOID until the first prepareFrame: no ammunition yet.
      let tamleft = num(rocket_decrypt(this.amLeft as string));
      if (tamleft > 0) {
        // The spear behavior moves the gun's first child into the world, so the list
        // shrinks and from the fourth shot child[6 - tamleft] is past its end. In
        // Director a node's child[n] past the end, then a property, reads the node's own
        // property (checked in Adobe's player): those shots start at the gun's position,
        // and all five spears fly.
        const gun = world().model('speargun' + this.suffix);
        const pos = (gun.child(6 - tamleft) ?? gun).worldPosition;
        sendSprite(0, 'createSprite', 'spear', pos, this.robotSp);
        playsound('speargun_sound', 255);
        tamleft = tamleft - 1;
        this.amLeft = rocket_encrypt(tamleft);
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        } else {
          member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        }
        if (tamleft === 0) {
          this.state = sym('out');
          // Hands the gun's own sprite back to the frame script's free list.
          sendSprite(0, 'removeSprite', this.sp);
        }
      } else {
        playsound('noammo', 255);
      }
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('init'): {
        if (eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v24')), sym('f'))) {
          sprite(this.sp).member = member('v24 f', 1);
        } else {
          sprite(this.sp).member = member('v24 b', 1);
        }
        const tamleft = 5;
        this.amLeft = rocket_encrypt(tamleft);
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        } else {
          member('oweapon' + this.weaponNumber + ' num').text = lingoString(tamleft);
        }
        this.state = sym('idle');
        break;
      }
      case sym('idle'): {
        this.angle = sprite(this.robotSp).rotation;
        sprite(this.sp).loc = sprite(this.robotSp).loc;
        sprite(this.sp).rotation = this.angle + 90;
        const hitrobot = intersects(this.sp, this.robot2Sp);
        if (hitrobot) {
          if (!eq(sp(this.robot2Sp, 'state'), sym('slow'))) {
            const dx10 = sp(this.robotSp, 'dx');
            const dy10 = sp(this.robotSp, 'dy');
            const angle10 = sp(this.robotSp, 'angle');
            const speed10 = sp(this.robotSp, 'speed');
            sendSprite(this.robotSp, 'hit', sp(this.robot2Sp, 'dx'), sp(this.robot2Sp, 'dy'), sp(this.robot2Sp, 'angle'), sp(this.robot2Sp, 'speed'));
            sendSprite(this.robot2Sp, 'hit', dx10, dy10, angle10, speed10);
            if (the.milliSeconds > this.gLastHitTime + 400) {
              playsound('krock_m_pik', 255);
              sendSprite(this.robot2Sp, 'damage', div(dot(G.gPartDescription, 'v24', 'skada'), 5), sym('nothing'));
              this.gLastHitTime = the.milliSeconds;
            }
          }
        }
        break;
      }
    }
  }
}
