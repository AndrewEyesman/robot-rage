// factory0604 behavior 7 "editor" (sprites 25 and 26 in the Paintshop): painting the
// robot's paint maps (#mapNumber 1: the chassis, member map1A; 2: the tower, map1B,
// hidden without a tower). Tools: pen, spray, eraser, line, rect, oval, filled rect
// and oval, paint bucket, fill all (#basket), undo; line widths; mirrored painting
// about the map's middle. Each change marks the map to be saved (#saveMap) and
// repaints the 3D preview (#updateTexture to sprite 6).
//
// The map's rows run bottom-up on the stage (y counts up from the sprite's bottom).

import { Behavior, DColor, cursor, member, sendAllSprites, sendSprite, sprite, the, updateStage, type DImage } from '../../director';
import { rectOf } from '../../director';
import { lingoString, num, paletteIndex, random, rgb, sym, type LSymbol, type LValue } from '../../lingo';
import { toDColor } from '../../director/sprite';
import { userPL } from './util';

/** image.draw(x1, y1, x2, y2, [#shapeType, #color, #lineSize]) */
function draw(im: DImage, x1: number, y1: number, x2: number, y2: number, shapeType: LValue, color: DColor, lineSize: number) {
  im.draw(rectOf(x1, y1, x2, y2), { shapeType: (shapeType as LSymbol).name.toLowerCase(), color, lineSize });
}

/** image.fill(x1, y1, x2, y2, color or [#shapeType: #rect / #oval, #color]) */
function fill(im: DImage, x1: number, y1: number, x2: number, y2: number, color: DColor, shapeType: LValue = sym('rect')) {
  im.fill(rectOf(x1, y1, x2, y2), color, (shapeType as LSymbol).name.toLowerCase());
}

/** Lingo `=` on colours: palette indices when both have one, else RGB. */
function sameColor(a: DColor | undefined, b: DColor | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.index !== undefined && b.index !== undefined) return a.index === b.index;
  return a.equals(b);
}

export class Editor extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  im!: DImage;
  wait = 0;
  foreColor!: DColor;
  bgColor!: DColor;
  drawColor!: DColor;
  x1 = 0;
  y1 = 0;
  x2 = 0;
  y2 = 0;
  tool: LValue;
  linewidth = 0;
  mirror = 0;
  mapNumber: LValue = 1;
  mapName = '';

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.bgColor = toDColor(rgb('0x888888'));
    this.im = sprite(this.sp).member.image;
    this.foreColor = toDColor(paletteIndex(255));
    this.drawColor = toDColor(paletteIndex(255));
    this.updateUndoImage();
    this.mirror = 0;
    this.mapName = 'map1A';
    if (num(this.mapNumber) === 2) {
      this.mapName = 'map1B';
      // Quirk: with a tower, map 2's state stays VOID (it never runs #init).
      if ((userPL().prop('robotDescription') as { prop(n: string): { count: number } }).prop('torn').count === 0) {
        sprite(this.sp).visible = false;
        this.state = sym('invisible');
      }
    } else {
      sprite(this.sp).visible = true;
      this.state = sym('init');
    }
  }

  endSprite() {
    sprite(this.sp).visible = true;
  }

  setForeColor(c: DColor) {
    this.foreColor = c;
    this.drawColor = c;
  }

  toggleMirror() {
    this.mirror = this.mirror ? 0 : 1;
  }

  mouseEnter() {
    switch (this.tool) {
      case sym('pen'):
        cursor(256);
        break;
      case sym('erase'):
        cursor(257);
        break;
      case sym('paint'):
        cursor(259);
        break;
      case sym('rect'):
      case sym('filledrect'):
      case sym('circle'):
      case sym('filledCircle'):
        cursor(2);
        break;
      case sym('hand'):
        cursor(260);
        break;
    }
  }

  mouseLeave() {
    cursor(-1);
  }

  Undo() {
    if (this.state === sym('invisible')) return;
    sprite(this.sp).member.image = member('undo image ' + lingoString(this.mapNumber)).image;
    sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
  }

  selectPaintTool(t: LValue) {
    if (t === sym('Undo')) {
      this.wait = 10;
      this.Undo();
      this.state = sym('restoreTool');
    } else if (t === sym('basket')) {
      this.updateUndoImage();
      this.wait = 10;
      fill(this.im, 0, 0, this.im.width, this.im.height, this.drawColor);
      this.state = sym('restoreTool');
    } else {
      this.tool = t;
    }
  }

  SetLineWidth(t: number) {
    this.linewidth = t;
  }

  prepareFrame() {
    if (this.wait > 0) {
      this.wait = this.wait - 1;
      return;
    }
    const st = this.state;
    if (st === sym('init')) {
      sendAllSprites('SetLineWidth', 1);
      sendAllSprites('selectPaintTool', sym('pen'));
      this.state = sym('updateMap');
    } else if (st === sym('updateMap')) {
      if (sprite(6).getProp('state') === sym('idle')) {
        sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
        this.state = sym('idle');
      }
    } else if (st === sym('restoreTool')) {
      sendAllSprites('selectPaintTool', this.tool);
      sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
      this.state = sym('idle');
    } else if (st === sym('down')) {
      this.paintStep();
    }
  }

  /** The #down case of prepareFrame: the tool follows the mouse. */
  private paintStep() {
    const s = sprite(this.sp);
    const im = this.im;
    const img = () => s.member.image as DImage;
    const W = im.width;
    const x = the.mouseH - s.left - 1;
    const y = s.bottom - the.mouseV - 1;
    const fc = this.foreColor;
    const lw = this.linewidth;
    // The four directions of a stroke from (x2, y2) to (x, y), the brush half-width b
    // added outwards (the pen and line tools).
    const stroke = (b: number, tool: LValue) => {
      const { x2, y2 } = this;
      if (x >= x2 && y >= y2) {
        draw(img(), x2 - b, y2 - b, x + b, y + b, tool, fc, lw);
        if (this.mirror) draw(img(), W - (x2 - b), y2 - b, W - (x + b), y + b, tool, fc, lw);
      }
      if (x >= x2 && y < y2) {
        draw(img(), x2 - b, y2 + b, x + b, y - b, tool, fc, lw);
        if (this.mirror) draw(img(), W - (x2 - b), y2 + b, W - (x + b), y - b, tool, fc, lw);
      }
      if (x < x2 && y >= y2) {
        draw(img(), x2 + b, y2 - b, x - b, y + b, tool, fc, lw);
        if (this.mirror) draw(img(), W - (x2 + b), y2 - b, W - (x - b), y + b, tool, fc, lw);
      }
      if (x < x2 && y < y2) {
        draw(img(), x2 + b, y2 + b, x - b, y - b, tool, fc, lw);
        if (this.mirror) draw(img(), W - (x2 + b), y2 + b, W - (x - b), y - b, tool, fc, lw);
      }
    };
    switch (this.tool) {
      case sym('pen'): {
        const b = Math.trunc(lw / 2);
        if (x !== this.x1 || y !== this.y1) {
          if (Math.abs(x - this.x1) > 0 || Math.abs(y - this.y1) > 0) {
            this.x2 = this.x1;
            this.y2 = this.y1;
            stroke(b, this.tool);
          } else {
            fill(im, x, y, x + b, y + b, this.drawColor);
            if (this.mirror) fill(im, W - x - b, y, W - x + b, y + b, this.drawColor);
          }
          this.x1 = x;
          this.y1 = y;
        }
        break;
      }
      case sym('spray'):
        for (let i = 1; i <= 10; i++) {
          const a = (random(360) * Math.PI) / 180;
          const b = random(7) + 1;
          im.setPixel(x + b * Math.cos(a), y + b * Math.sin(a), fc);
          if (this.mirror) im.setPixel(W - (x + b * Math.cos(a)), y + b * Math.sin(a), fc);
        }
        break;
      case sym('erase'):
        img().fill(rectOf(x, y - 15, x + 15, y), this.bgColor);
        if (this.mirror) img().fill(rectOf(W - x, y - 15, W - (x + 15), y), this.bgColor);
        this.x1 = x;
        this.y1 = y;
        break;
      case sym('line'): {
        const b = lw / 2.0;
        if (x !== this.x1 || y !== this.y1) {
          s.member.image = member('temp image ' + lingoString(this.mapNumber)).image;
          if (this.x2 === x && this.y2 === y) {
            fill(im, x - b, y - b, x + b, y + b, fc);
            if (this.mirror) fill(im, W - (x + b), y - b, W - (x - b), y + b, fc);
          } else {
            stroke(b, this.tool);
            this.x1 = x;
            this.y1 = y;
          }
        }
        break;
      }
      case sym('rect'):
      case sym('oval'): {
        s.member.image = member('temp image ' + lingoString(this.mapNumber)).image;
        const b = lw;
        const t = this.tool;
        const { x2, y2 } = this;
        if (x2 === x && y2 === y) {
          im.setPixel(x, y, fc);
        } else {
          if (x >= x2 && y >= y2) {
            draw(img(), x2, y2, x + 1, y + 1, t, fc, b);
            if (this.mirror) draw(img(), W - (x + 1), y2, W - x2, y + 1, t, fc, b);
          }
          if (x >= x2 && y < y2) {
            draw(img(), x2, y, x + 1, y2 + 1, t, fc, b);
            if (this.mirror) draw(img(), W - (x + 1), y, W - x2, y2 + 1, t, fc, b);
          }
          if (x < x2 && y >= y2) {
            draw(img(), x2 + 1, y + 1, x, y2, t, fc, b);
            if (this.mirror) draw(img(), W - x, y + 1, W - (x2 + 1), y2, t, fc, b);
          }
          if (x < x2 && y < y2) {
            draw(img(), x2 + 1, y2 + 1, x, y, t, fc, b);
            if (this.mirror) draw(img(), W - x, y2 + 1, W - (x2 + 1), y, t, fc, b);
          }
          this.x1 = x;
          this.y1 = y;
        }
        break;
      }
      case sym('filledrect'):
      case sym('filledOval'): {
        s.member.image = member('temp image ' + lingoString(this.mapNumber)).image;
        const t = this.tool === sym('filledOval') ? sym('oval') : sym('rect');
        const { x2, y2 } = this;
        if (x2 === x && y2 === y) {
          im.setPixel(x, y, fc);
          if (this.mirror) im.setPixel(W - x, y, fc);
        } else {
          if (x >= x2 && y >= y2) {
            fill(img(), x2, y2, x + 1, y + 1, fc, t);
            if (this.mirror) fill(img(), W - (x + 1), y2, W - x2, y + 1, fc, t);
          }
          if (x >= x2 && y < y2) {
            fill(img(), x2, y, x + 1, y2 + 1, fc, t);
            if (this.mirror) fill(img(), W - (x + 1), y, W - x2, y2 + 1, fc, t);
          }
          if (x < x2 && y >= y2) {
            fill(img(), x, y2, x2 + 1, y + 1, fc, t);
            if (this.mirror) fill(img(), W - (x2 + 1), y2, W - x, y + 1, fc, t);
          }
          if (x < x2 && y < y2) {
            fill(img(), x, y, x2 + 1, y2 + 1, fc, t);
            if (this.mirror) fill(img(), W - (x2 + 1), y, W - x, y2 + 1, fc, t);
          }
          this.x1 = x;
          this.y1 = y;
        }
        break;
      }
    }
  }

  updateUndoImage() {
    sendSprite(1, 'usedoktor');
    userPL().setaProp(sym('saveMap'), 1);
    sendSprite(1, 'makedoktor');
    member('undo image ' + lingoString(this.mapNumber)).image = this.im;
  }

  mouseDown() {
    const s = sprite(this.sp);
    const im = this.im;
    const W = im.width;
    const x = the.mouseH - s.left;
    const y = s.bottom - the.mouseV;
    switch (this.tool) {
      case sym('pen'): {
        this.updateUndoImage();
        const c = im.getPixel(x, y) as DColor | undefined;
        if (sameColor(c, this.foreColor)) this.drawColor = this.bgColor;
        else this.drawColor = this.foreColor;
        this.drawColor = this.foreColor;
        const b = this.linewidth / 2.0;
        fill(im, x - b, y - b, x + b, y + b, this.drawColor);
        if (this.mirror) fill(im, W - (x + b), y - b, W - (x - b), y + b, this.drawColor);
        this.state = sym('down');
        this.x1 = x;
        this.y1 = y;
        break;
      }
      case sym('erase'):
        this.updateUndoImage();
        this.state = sym('down');
        this.x1 = x;
        this.y1 = y;
        break;
      case sym('line'):
      case sym('rect'):
      case sym('filledrect'):
      case sym('oval'):
      case sym('filledOval'):
        this.updateUndoImage();
        member('temp image ' + lingoString(this.mapNumber)).image = im;
        this.state = sym('down');
        this.x2 = x;
        this.y2 = y;
        break;
      case sym('paint'):
        this.updateUndoImage();
        if (!sameColor(this.foreColor, im.getPixel(x, y) as DColor | undefined)) im.floodFill(x, y, this.foreColor);
        if (this.mirror) {
          if (!sameColor(this.foreColor, im.getPixel(W - x, y) as DColor | undefined)) im.floodFill(W - x, y, this.foreColor);
        }
        updateStage();
        sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
        break;
      case sym('spray'):
        this.updateUndoImage();
        this.x1 = x;
        this.y1 = y;
        this.state = sym('down');
        break;
    }
  }

  mouseUp() {
    sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
    this.state = sym('idle');
  }

  mouseUpOutSide() {
    sendSprite(6, 'updateTexture', this.mapName, this.mapNumber);
    this.state = sym('idle');
  }
}

