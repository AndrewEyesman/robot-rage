// arena104 behavior 232 "vapen v21": the kamikaze bomb. One press starts a 3-2-1
// countdown on the HUD; then the robot blows up in a growing fire ball (a sphere with a
// scrolling texture) that throws and damages both robots by distance (#kami damage).
// For the second robot, the explosion decides the round: a tie if that left the other
// robot without armour, otherwise "NOTIE".

import { G, dot, member, sendSprite, the } from '../../director';
import { vector, type Model, type ModelResource, type Shader } from '../../director/s3d';
import { LList, add, mul, num, propList, rgb, sub, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { rocket_decrypt, rocket_encrypt } from '../robotwars/s072-rocket-encrypt';
import { eq, sendToOpponent, sp, world } from './weapon-util';

// global gPartDescription, world, gOpponent, muInstance, gUseUDP, gGamePlace

export class VapenV21 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  amLeft: string;
  pr: ModelResource | undefined = undefined;
  pm: Model | undefined = undefined;
  pstartTime: number | undefined = undefined;
  pTime: number | undefined = undefined;
  state: LSymbol;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  z: LValue = undefined;
  dx: LValue = undefined;
  dy: LValue = undefined;
  dz: LValue = undefined;
  m: Model;
  speed: LValue = undefined;
  rx: LValue = undefined;
  ry: LValue = undefined;
  rz: LValue = undefined;
  pipa: LValue = undefined;
  counter: LValue = undefined;
  src: LValue = undefined;
  radie: number | undefined = undefined;
  m2: Model;
  theShader: Shader;
  size: number | undefined = undefined;

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
    const tamleft = 1;
    this.amLeft = rocket_encrypt(tamleft);
    this.weaponNumber = n;
    this.state = sym('idle');
    if (this.robotNumber === 1) {
      member('weapon' + this.weaponNumber + ' num').text = 'OFF';
    } else {
      member('oweapon' + this.weaponNumber + ' num').text = 'OFF';
    }
    this.m = world().newModel('KAMIKAZE' + this.sp);
    this.state = sym('idle');
    const r2 = world().newModelResource('kamisphere' + this.sp, sym('sphere'));
    this.m2 = world().newModel('kamisphere' + this.sp, r2);
    this.m2.visibility = sym('both');
    const theShader = (this.theShader = world().newShader('kami_shd' + this.sp, sym('standard')));
    theShader.emissive = rgb(255, 200, 0);
    theShader.blend = 50.0;
    theShader.specular = rgb(0, 0, 0);
    theShader.texture = world().texture('walltopp.png');
    theShader.ambient = rgb(0, 0, 0);
    theShader.diffuse = rgb(255, 255, 255);
    theShader.blend = 50.0;
    this.m2.shaderList = theShader;
    this.m2.transform.scale = vector(1, 1, 1);
    this.m2.transform.position.y = -10000;
  }

  InitSmoke() {
    this.pstartTime = the.milliSeconds;
    if (this.pm === undefined) {
      const pr = (this.pr = world().newModelResource('granatex' + this.sp, sym('particle')));
      this.pm = world().newModel('grexplo' + this.sp, pr);
      const ttexture = world().texture('fire1');
      if (!ttexture) {
        pr.texture = world().newTexture('fire1', sym('fromImageObject'), member('fire').image);
        pr.texture.renderFormat = sym('rgba8888');
      } else {
        pr.texture = world().texture('fire1');
      }
      pr.lifeTime = 2000;
      pr.colorRange.start = rgb(250, 250, 80);
      pr.colorRange.end = rgb(80, 0, 0);
      pr.sizeRange.start = 50;
      pr.sizeRange.end = 5;
      pr.blendRange.start = 100.0;
      pr.blendRange.end = 100;
      pr.emitter.mode = sym('burst');
      pr.emitter.loop = 0;
      pr.emitter.angle = 90.0;
      pr.emitter.minSpeed = 1500.0;
      pr.emitter.maxSpeed = 2000.0;
      pr.emitter.direction = vector(0.0, 1.0, 0.0);
      pr.gravity = vector(0.0, -95, 0.0);
      pr.emitter.numParticles = 50;
    }
    this.pr!.lifeTime = this.pr!.lifeTime - 1;
    this.pr!.emitter.region = new LList([this.m.worldPosition]);
  }

  endSprite() {
    if (this.pm === undefined) {
      return;
    }
    if (world().model(this.pm.name) !== undefined) {
      // Deletes m (the fire ball), not pm, as the original does.
      world().deleteModel(this.m.name);
      world().deleteModelResource('granatex' + this.sp);
      this.pm = undefined;
    }
  }

  doneSprite() {
    this.state = sym('nada');
    if (this.pm === undefined) {
      return;
    }
    if (world().model(this.pm.name) !== undefined) {
      world().deleteModel(this.pm.name);
      world().deleteModelResource('granatex' + this.sp);
      this.pm = undefined;
    }
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (this.state === sym('idle')) {
        const tamleft = num(rocket_decrypt(this.amLeft));
        if (tamleft > 0) {
          // tamleft is never decremented: the bomb can go off again once it's idle.
          this.state = sym('initcountdown');
        }
      }
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('initcountdown'):
        this.pTime = the.milliSeconds;
        this.state = sym('c3');
        if (this.robotNumber === 1) {
          member('weapon' + this.weaponNumber + ' num').text = '3';
        }
        playsound('kami', 255);
        break;
      case sym('c3'):
        if (the.milliSeconds >= this.pTime! + 1000) {
          this.pTime = the.milliSeconds;
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = '2';
          }
          this.state = sym('c2');
        }
        break;
      case sym('c2'):
        if (the.milliSeconds >= this.pTime! + 1000) {
          this.pTime = the.milliSeconds;
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = '1';
          }
          this.state = sym('c1');
        }
        break;
      case sym('c1'):
        if (the.milliSeconds >= this.pTime! + 1000) {
          if (this.robotNumber === 1) {
            member('weapon' + this.weaponNumber + ' num').text = '0';
          }
          this.pTime = the.milliSeconds;
          this.state = sym('initexplode');
        }
        break;
      case sym('initexplode'): {
        const m = this.m;
        m.resource = world().modelResource('pang');
        m.shader = world().model('pang').shader;
        m.worldPosition = add(sp(this.robotSp, 'pRobot').worldPosition, vector(0, 200, 0)) as LVector;
        m.transform.scale = vector(1, 1, 1);
        this.m2.worldPosition = m.worldPosition;
        sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
        this.InitSmoke();
        this.x = 1.6;
        this.y = 100;
        this.radie = 20.0;
        playsound('granat explode', 255);
        this.size = 0;
        this.m2.transform.scale = mul(vector(2.2, 2.2, 2.2), this.size + 0.001) as LVector;
        this.m2.shaderList.blend = 50;
        let dist: number;
        let del: number;
        let damageamount: number;
        if (!eq(G.gGamePlace, sym('backyard'))) {
          dist = (sp(this.robot2Sp, 'pRobot').worldPosition as LVector).distanceTo(sub(m.worldPosition, vector(0, 200, 0)) as LVector);
          if (dist < 10000) {
            del = (15000 - dist) / 10000;
            if (del > 1) {
              del = 1;
            }
            damageamount = num(dot(G.gPartDescription, 'v21', 'skada')) * del;
            sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
            sendSprite(this.robot2Sp, 'hopp', m.name, damageamount);
            sendSprite(this.robot2Sp, 'damage', damageamount, sym('kami'));
          }
        }
        dist = (sp(this.robotSp, 'pRobot').worldPosition as LVector).distanceTo(sub(m.worldPosition, vector(0, 200, 0)) as LVector);
        if (dist < 10000) {
          del = (15000 - dist) / 10000;
          if (del > 1) {
            del = 1;
          }
          damageamount = num(dot(G.gPartDescription, 'v21', 'skada')) * del;
          sendSprite(0, 'createSprite', 'smash', m.worldPosition, 0, rgb(255, 255, 100));
          sendSprite(this.robotSp, 'hopp', m.name, damageamount);
          sendSprite(this.robotSp, 'damage', damageamount, sym('kami'));
        }
        this.state = sym('send');
        break;
      }
      case sym('send'):
        if (this.robotNumber === 2) {
          if (num(dot(sp(this.robot2Sp, 'damageStatus'), 'pansar')) <= 0) {
            if (!eq(G.gGamePlace, sym('backyard'))) {
              // #content is an empty linear list here, not a property list.
              G.muInstance.sendNetMessage(propList(sym('recipients'), G.gOpponent, sym('subject'), 'TIE', sym('content'), new LList([]), sym('udp'), G.gUseUDP));
            }
            sendSprite(0, 'makeTie');
          } else {
            if (!eq(G.gGamePlace, sym('backyard'))) {
              sendToOpponent('NOTIE', sym('sp'), this.robotSp);
            }
          }
        }
        this.state = sym('explode');
        break;
      case sym('explode'): {
        const size = this.size!;
        this.m.transform.scale = mul(vector(2.2, 2.2, 2.2), size + 0.001) as LVector;
        const tt = this.theShader.textureTransformList[1];
        tt.position = add(tt.position, vector(0, 0.01, 0.0)) as LVector;
        this.m2.transform.scale = mul(vector(2.2, 2.2, 2.2), size + 0.001) as LVector;
        this.size = size + 20;
        if (this.size > 200) {
          this.m2.shaderList.blend = Math.trunc((100 - (this.size - 200)) / 2);
          // m wears the shared "pang" shader, so this fades every "pang" user.
          this.m.shaderList.blend = Math.trunc((100 - (this.size - 200)) / 2);
        }
        if (this.size > 300) {
          this.state = sym('idle');
          this.m.worldPosition.y = -100000;
        }
        break;
      }
      case sym('done'):
        break;
    }
  }

  kami() {}
}
