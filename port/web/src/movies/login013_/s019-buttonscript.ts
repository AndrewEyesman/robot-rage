// login013_ behavior "Buttonscript": a button that swaps to its pressed image and,
// a frame after release, sends its action.

import { Behavior, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { EMPTY, LPropList, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { BitmapMember, type DImage } from '../../director';

export class Buttonscript extends Behavior {
  sp = 0;
  pSprite: unknown;
  pAction: LValue;
  pTo: LValue;
  pContent: LValue;
  pDo: LValue;
  pActive = 0;
  pAdjust: LValue;
  pwidth: LValue;
  pheight = 0;
  pMinWidth: LValue;
  textTag: LValue;
  buttonImg: unknown;
  buttonDownImg: unknown;
  pState: LSymbol | undefined;

  constructor(p?: LValue) {
    super();
    if (p instanceof LPropList) {
      this.sp = p.prop('spriteNumber') as number;
      this.pSprite = sprite(this.sp);
      this.textTag = p.prop('textTag');
      this.pwidth = p.prop('width');
      this.pAdjust = p.prop('adjust');
      this.pTo = p.prop('sendTo');
      this.pAction = p.prop('action');
      this.pContent = p.prop('content');
      this.pActive = 1;
      sprite(this.sp).cursor = 280;
      this.pheight = 18;
      // createButton() is defined in no script of this movie; Director would fail here.
    }
    this.pState = sym('idle');
  }

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp).cursor = 280;
    this.pheight = 18;
    if (this.pwidth === undefined) this.pwidth = 0;
    this.pState = sym('idle');
    this.pActive = 1;
  }

  updateText() {}

  inActivateButton() {
    sprite(this.sp).blend = 50;
    sprite(this.sp).cursor = 0;
    this.pActive = 0;
  }

  mouseDown() {
    this.SetSpriteImage(this.buttonDownImg);
    this.pState = sym('pressed');
  }

  mouseUp() {
    if (the.clickOn !== this.sp) return;
    if (this.pDo === undefined) this.pDo = EMPTY;
    if (!this.pActive) return;
    this.pState = sym('unpressed');
  }

  mouseUpOutSide() {
    this.SetSpriteImage(this.buttonImg);
    this.pState = sym('idle');
  }

  endSprite() {
    sprite(this.sp).cursor = 0;
  }

  prepareFrame() {
    if (this.pState === sym('unpressed')) this.pState = sym('releaseButton');
    else if (this.pState === sym('releaseButton')) {
      this.SetSpriteImage(this.buttonImg);
      this.pState = sym('doaction');
    }
  }

  exitFrame() {
    if (this.pState === sym('doaction')) {
      if (this.pDo !== EMPTY && this.pDo !== undefined) {
        // do(pDo): no button in the game sets a Lingo string to run.
      } else if (this.pTo === sym('allSprites')) sendAllSprites(symbol(this.pAction)!, this.pContent);
      else if (this.pTo === sym('frameScript')) sendSprite(0, symbol(this.pAction)!, this.pContent);
      else sendSprite(this.pTo as number, symbol(this.pAction)!, this.pContent);
      this.pState = sym('idle');
    }
  }

  SetSpriteImage(t: unknown) {
    const s = sprite(this.sp);
    if (t && typeof t === 'object' && 'castLib' in t) {
      s.member = t as never;
      return;
    }
    if (!s.member || s.member.number === 0) return;
    if (!(s.member instanceof BitmapMember) || !t) return;
    const img = t as DImage;
    s.member.image = img;
    s.member.useAlpha = true;
    if (this.pAdjust === sym('center')) {
      // nothing
    } else if (this.pAdjust === sym('right')) s.member.regPoint = [img.width, 0];
    else s.member.regPoint = [0, 0];
  }
}

