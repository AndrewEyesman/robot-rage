// factory0604 behavior 163 "buy robot behavior" (sprite 6 in the Buy and Sell rooms):
// the 3D preview of one part (member "robotpre"), grey, copied from the parts member
// "tumbitar"; it spins about the part's middle, and drag spins it.

import { Behavior, DImage, G, cursor, member, rectOf, sendAllSprites, the } from '../../director';
import { member3d, vector, type Group3D, type Shader, type Shockwave3dMember } from '../../director/s3d';
import { LList, add, div, gt, rgb, sym, type LColor, type LSymbol, type LValue, type LVector } from '../../lingo';
import { GetMiddlePoint } from '../robotwars/s006-3d-scripts';
import { InstallStorePart, UnInstallStorePart } from './s277-3d-store';
import { parts } from './util';
import { garageFixes } from './enhancements';

export class BuyRobotBehavior extends Behavior {
  sp = 0;
  m!: Shockwave3dMember;
  robot!: Group3D;
  counter = 0;
  There = 0;
  angle: LValue;
  dangle = 0;
  lastloch = 0;
  state: LSymbol | undefined;
  vVector: LVector = vector(0, 0, 0);
  srcRobot: Shockwave3dMember | undefined;
  pShader: Shader | undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    this.state = sym('preload');
  }

  endSprite() {
    if (member3d('robot').state === 4) member3d('robot').resetWorld();
  }

  prepareFrame() {
    if (G.gpopBuy) {
      // Port enhancement (super weapons for credits, enhancements.ts): no payment box.
      if (!garageFixes.superCredits) sendAllSprites('ShowpurchaseBox');
      G.gpopBuy = 0;
    }
    const st = this.state;
    if (st === sym('preload')) {
      // preloadMember(): the port loads every member with its cast.
      this.state = sym('wait');
    } else if (st === sym('wait')) {
      if (member3d('tumbitar').state === 4) this.state = sym('init');
    } else if (st === sym('init')) {
      this.InitRobot();
      if (the.frame === 147) this.Show3DPart(sym('p1'));
      this.state = sym('idle');
    } else if (st === sym('drag')) {
      if (this.There) {
        const locH = the.mouseH;
        this.dangle = 0.5 * this.dangle + (locH - this.lastloch) / 4.0;
        this.lastloch = locH;
        this.robot.rotate(this.vVector, vector(0, 1, 0), this.dangle, sym('world'));
      }
    } else if (st === sym('idle')) {
      if (this.There) {
        this.counter = this.counter + 1;
        if (this.counter % 2 === 0) this.robot.rotate(this.vVector, vector(0, 1, 0), this.dangle, sym('world'));
        if (this.dangle > 2) this.dangle = this.dangle - 0.02;
        if (this.dangle < -2) this.dangle = this.dangle + 0.02;
        if (Math.abs(this.dangle) < 0.01) this.dangle = 0.0;
      }
    }
  }

  InitRobot() {
    this.m = member3d('robotpre');
    const m = this.m;
    m.resetWorld();
    this.robot = m.newGroup('robot');
    const s = m.newShader('grey', sym('standard'));
    this.pShader = s;
    s.ambient = rgb('0xCCCCCC');
    s.diffuse = rgb('0x333333');
    s.specular = rgb('0xEEEEEE');
    s.emissive = rgb('0x000000');
    s.shininess = 0;
    s.blend = 0;
    // useDiffuseWithTexture = 0: a local in the original.
    s.transparent = false;
    s.renderStyle = sym('fill');
    s.texture = undefined;
    s.textureMode = sym('none');
    m.camera[1].translate(0, 200, 150);
    m.camera[1].pointAt(vector(0, 0, 0), vector(0, 1, 0));
    this.dangle = 1.0;
    sendAllSprites('setzoomer');
    this.There = 0;
  }

  setZoom(V: number) {
    this.m = member3d('robotpre');
    this.m.camera[1].fieldOfView = 50 - V / 6;
  }

  add3DPart(p: LValue) {
    if (p instanceof LList) for (const e of p) InstallStorePart(this.robot, this.srcRobot!, this.m, parts().getProp(e));
    else InstallStorePart(this.robot, this.srcRobot!, this.m, parts().getProp(p));
  }

  Show3DPart(p: LValue) {
    this.srcRobot = member3d('tumbitar');
    if (p instanceof LList) for (const e of p) InstallStorePart(this.robot, this.srcRobot, this.m, parts().getProp(e));
    else InstallStorePart(this.robot, this.srcRobot, this.m, parts().getProp(p));
    if (this.m.model.count === 1) {
      this.vVector = GetMiddlePoint(this.m.model[1]);
    } else {
      // n starts VOID (VOID + vector is the vector). Quirk: `n > 0` is never true for a
      // vector (Adobe's player compares a vector with a number as false), so a part of
      // several models spins about the origin.
      let n: LValue;
      for (let i = 1; i <= this.m.model.count; i++) {
        this.vVector = GetMiddlePoint(this.m.model[i]);
        n = n === undefined ? this.vVector : add(n, this.vVector);
      }
      if (n !== undefined && gt(n, 0)) this.vVector = div(n, this.m.model.count) as LVector;
      else this.vVector = vector(0, 0, 0);
    }
    this.There = 1;
  }

  remove3DPart(p: LValue) {
    if (p instanceof LList) for (const e of p) UnInstallStorePart(this.m, parts().getProp(e));
    else UnInstallStorePart(this.m, parts().getProp(p));
  }

  // CreateShader and updateTexture: handlers no message reaches in the Buy and Sell rooms.
  CreateShader(name: string, m: Shockwave3dMember, _mGroup: unknown, c: LColor, n: number) {
    if (this.state === sym('wait')) return;
    let tshader = m.shader(name);
    if (!tshader) {
      tshader = m.newShader(name, sym('standard'));
      tshader.ambient = c;
      tshader.renderStyle = sym('fill');
    }
    const child = this.robot.child[n] as unknown as { shaderList: Shader[] };
    child.shaderList[1] = tshader;
    child.shaderList[1].texture = undefined;
    child.shaderList[1].textureMode = sym('none');
  }

  updateTexture(name: string, n: number) {
    let tshader = this.m.shader(name);
    if (!tshader) {
      tshader = this.m.newShader(name, sym('standard'));
      tshader.ambient = rgb(0, 0, 0);
      tshader.diffuse = rgb(100, 50, 0);
      tshader.renderStyle = sym('fill');
      tshader.specular = rgb(150, 100, 0);
    }
    const child = this.robot.child[n] as unknown as { shaderList: Shader[] };
    child.shaderList[1] = tshader;
    if (this.m.texture(name) !== undefined) this.m.deleteTexture(name);
    const src = member(name);
    const w = src.width;
    const h = src.height;
    // image(w, h, 24): the port keeps 24-bit images as 32-bit without alpha.
    const im = new DImage(w, h, 32);
    im.copyPixels(src.image, rectOf(0, 0, w, h), src.rect);
    const ttexture = this.m.newTexture(name, sym('fromImageObject'), im);
    child.shaderList[1].texture = ttexture;
    child.shaderList[1].textureMode = sym('none');
    tshader.wrapTransform.rotate(180, 0, 180);
  }

  mouseDown() {
    this.lastloch = the.mouseH;
    cursor(290);
    this.state = sym('drag');
  }

  mouseWithin() {
    if (!the.stillDown) cursor(260);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    this.state = sym('idle');
  }

  mouseUpOutSide() {
    this.state = sym('idle');
  }
}

