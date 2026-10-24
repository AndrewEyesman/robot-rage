// Drawing sprites onto the stage: bitmaps through their ink, text and fields with
// the sprite's colours, shapes and buttons. The stage canvas is at the display's
// resolution; everything is laid out in stage pixels.

import { DColor } from './color';
import { charPosToLoc, drawLines } from './text-layout';
import { BitmapMember, FieldMember, ShapeMember, TextMember, TextualMember } from './members';
import type { Sprite } from './sprite';
import { findHandler } from './dispatch';

/** Director's ink numbers. */
export const INK = {
  copy: 0, transparent: 1, reverse: 2, ghost: 3, notCopy: 4, notTransparent: 5, notReverse: 6, notGhost: 7,
  matte: 8, mask: 9, blend: 32, addPin: 33, add: 34, subtractPin: 35, backgroundTransparent: 36, lightest: 37,
  subtract: 38, darkest: 39, lighten: 40, darken: 41,
} as const;

/** Canvas compositing for the inks that combine with what's below. */
function composite(ink: number): GlobalCompositeOperation {
  switch (ink) {
    case INK.addPin:
    case INK.add:
      return 'lighter';
    case INK.subtractPin:
    case INK.subtract:
    case INK.reverse:
    case INK.notReverse:
      return 'difference';
    case INK.lightest:
      return 'lighten';
    case INK.darkest:
      return 'darken';
    case INK.lighten:
      return 'screen';
    case INK.darken:
      return 'multiply';
    default:
      return 'source-over';
  }
}

/** Black shows as the foreground colour and white as the background, as Director colourises. */
export function remap(c: DColor, fore: DColor, back: DColor): DColor {
  if (fore.isBlack && back.isWhite) return c;
  const k = (c.r + c.g + c.b) / 765;
  return new DColor(Math.round(fore.r + (back.r - fore.r) * k), Math.round(fore.g + (back.g - fore.g) * k), Math.round(fore.b + (back.b - fore.b) * k));
}

interface InkCache {
  key: string;
  canvas: HTMLCanvasElement;
  alpha: Uint8ClampedArray;
}

/** A bitmap member's pixels after the sprite's ink and colours, cached per sprite. */
export function inkedBitmap(s: Sprite, m: BitmapMember): InkCache {
  const img = m.image;
  const key = `${m.slotNumber}|${m.version}|${img.version}|${s.ink}|${s.foreColor.css}|${s.backColor.css}`;
  const cached = s.userData.ink as InkCache | undefined;
  if (cached?.key === key) return cached;
  const w = img.width;
  const h = img.height;
  const data = new Uint8ClampedArray(img.data);
  const opaque = !(img.depth === 32 && m.useAlpha);
  if (opaque) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const fore = s.foreColor;
  const back = s.backColor;
  // Colourising applies to indexed and 1-bit art; 32-bit images keep their colours.
  // Background Transparent keeps an 8-bit image's colours too and only keys out the
  // background colour (Adobe's player: the Paintshop's grey map1A on a magenta
  // bgColor stays grey with ink 36, and turns 139,0,139 with copy or matte).
  const colorize = img.depth <= 8 && !(fore.isBlack && back.isWhite) && !(s.ink === INK.backgroundTransparent && img.depth === 8);
  if (colorize) {
    for (let i = 0; i < data.length; i += 4) {
      const c = remap(new DColor(data[i], data[i + 1], data[i + 2]), fore, back);
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
    }
  }
  const keyed = colorize ? remap(new DColor(255, 255, 255), fore, back) : back;
  if (s.ink === INK.backgroundTransparent || s.ink === INK.transparent) {
    for (let i = 0; i < data.length; i += 4) if (data[i] === keyed.r && data[i + 1] === keyed.g && data[i + 2] === keyed.b) data[i + 3] = 0;
  } else if (s.ink === INK.matte) {
    // Matte: white connected to the edges is transparent.
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const white = (p: number) => data[p * 4] === 255 && data[p * 4 + 1] === 255 && data[p * 4 + 2] === 255;
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (p < 0 || p >= w * h || seen[p] || !white(p)) continue;
      seen[p] = 1;
      data[p * 4 + 3] = 0;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      stack.push(p - w, p + w);
    }
  }
  const canvas = (cached?.canvas ?? document.createElement('canvas')) as HTMLCanvasElement;
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  if (w && h) {
    const id = new ImageData(data, w, h);
    canvas.getContext('2d')!.putImageData(id, 0, 0);
  }
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
  const entry = { key, canvas, alpha };
  s.userData.ink = entry;
  return entry;
}

export interface FocusState {
  sprite: number;
  selStart: number;
  selEnd: number;
  caretOn: boolean;
}

/** Place the context in the sprite's frame: origin at its loc, rotated and flipped. */
function spriteTransform(ctx: CanvasRenderingContext2D, s: Sprite) {
  ctx.translate(Math.trunc(s.locH), Math.trunc(s.locV));
  if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
  if (s.flipH || s.flipV) ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, focus: FocusState | null) {
  const m = s.member;
  if (!m || !s.visible) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(100, s.blend)) / 100;
  ctx.globalCompositeOperation = composite(s.ink);
  if (m instanceof BitmapMember) {
    const { canvas } = inkedBitmap(s, m);
    const [rx, ry] = s.regPoint();
    spriteTransform(ctx, s);
    if (m.image.width && m.image.height) ctx.drawImage(canvas, -rx, -ry, s.width, s.height);
  } else if (m instanceof TextualMember) {
    drawText(ctx, s, m, focus?.sprite === s.spriteNum ? focus : null);
  } else if (m instanceof ShapeMember) {
    drawShape(ctx, s, m);
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, s: Sprite, m: ShapeMember) {
  const r = s.bounds;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  ctx.fillStyle = ctx.strokeStyle = s.foreColor.css;
  const lw = m.lineSize;
  ctx.lineWidth = lw;
  ctx.translate(r.left, r.top);
  switch (m.shapeType) {
    case 'oval':
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - (m.filled ? 0 : lw / 2)), Math.max(0, h / 2 - (m.filled ? 0 : lw / 2)), 0, 0, Math.PI * 2);
      if (m.filled) ctx.fill();
      else if (lw) ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      if (m.lineDirection === 6) {
        ctx.moveTo(0, h);
        ctx.lineTo(w, 0);
      } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
      }
      if (lw) ctx.stroke();
      break;
    default:
      if (m.filled) ctx.fillRect(0, 0, w, h);
      else if (lw) ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  }
}

function drawText(ctx: CanvasRenderingContext2D, s: Sprite, m: TextualMember, focus: FocusState | null) {
  const r = s.bounds;
  const fore = s.foreColor;
  const back = s.backColor;
  const isField = m instanceof FieldMember;
  const inset = isField ? m.border + m.margin : 0;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  ctx.translate(r.left, r.top);
  // Copy ink fills the box with the background (white text members, field colour).
  if (s.ink !== INK.backgroundTransparent && s.ink !== INK.matte && s.ink !== INK.transparent && composite(s.ink) === 'source-over') {
    const bg = isField || m instanceof TextMember ? m.bgColor : new DColor(255, 255, 255);
    ctx.fillStyle = remap(bg, fore, back).css;
    ctx.fillRect(0, 0, w, h);
  }
  if (isField && m.buttonType !== null) {
    drawButton(ctx, m, w, h, fore, back);
    return;
  }
  if (isField && m.border > 0) {
    ctx.fillStyle = remap(new DColor(0, 0, 0), fore, back).css;
    ctx.fillRect(0, 0, w, m.border);
    ctx.fillRect(0, h - m.border, w, m.border);
    ctx.fillRect(0, 0, m.border, h);
    ctx.fillRect(w - m.border, 0, m.border, h);
  }
  ctx.beginPath();
  ctx.rect(inset, inset, Math.max(0, w - 2 * inset), Math.max(0, h - 2 * inset));
  ctx.clip();
  const lines = m.lines();
  const dy = inset - (isField ? m.scrollTop : 0);
  // Selection highlight behind the text.
  if (focus && focus.selEnd > focus.selStart) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (const l of lines) {
      const a = Math.max(l.start, focus.selStart);
      const b = Math.min(l.end, focus.selEnd);
      if (b <= a) continue;
      const pa = charPosToLoc(lines, a)!;
      const pb = charPosToLoc(lines, b)!;
      ctx.fillRect(inset + pa.x, dy + l.top, pb.x - pa.x, l.height);
    }
  }
  const textColor = (c: string) => remap(DColor.hex(c), fore, back).css;
  const colored = lines.map((l) => ({ ...l, pieces: l.pieces.map((p) => ({ ...p, color: textColor(p.color) })) }));
  // Text members anti-alias runs from the antiAliasThreshold up (14 by default); fields never.
  drawLines(ctx, colored, inset, dy, undefined, m instanceof TextMember && m.antialias ? m.antiAliasThreshold : Infinity);
  if (focus && focus.caretOn && focus.selEnd === focus.selStart) {
    const p = charPosToLoc(lines, focus.selStart);
    const lh = p?.line.height ?? m.fontSize;
    ctx.fillStyle = textColor(m.styled.runs[0].color);
    ctx.fillRect(inset + (p?.x ?? 0), dy + (p?.y ?? 0), 1, lh);
  }
}

/** Push buttons, check boxes and radio buttons in the Windows look of the time. */
function drawButton(ctx: CanvasRenderingContext2D, m: FieldMember, w: number, h: number, fore: DColor, back: DColor) {
  const lines = m.lines();
  const th = lines.reduce((a, l) => a + l.height, 0);
  if (m.buttonType === 0) {
    ctx.fillStyle = '#d4d0c8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w - 1, 1);
    ctx.fillRect(0, 0, 1, h - 1);
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(w - 1, 0, 1, h);
    drawLines(ctx, lines, 0, Math.round((h - th) / 2), remap(DColor.hex(m.styled.runs[0].color), fore, back).css, false);
    return;
  }
  // Check box / radio button: a 13 px box on the left, label after it.
  const box = 13;
  const y = Math.round((h - box) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#404040';
  if (m.buttonType === 2) {
    ctx.beginPath();
    ctx.arc(box / 2, y + box / 2, box / 2 - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (m.hilite) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(box / 2, y + box / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillRect(0, y, box, box);
    ctx.strokeRect(0.5, y + 0.5, box - 1, box - 1);
    if (m.hilite) {
      ctx.beginPath();
      ctx.moveTo(3, y + 6);
      ctx.lineTo(5, y + 9);
      ctx.lineTo(10, y + 3);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  drawLines(ctx, lines, box + 4, Math.round((h - th) / 2), remap(DColor.hex(m.styled.runs[0].color), fore, back).css, false);
}

/** Whether a stage point hits the sprite (opaque pixels for matte and alpha bitmaps). */
export function hitTest(s: Sprite, x: number, y: number): boolean {
  const m = s.member;
  if (!m || !s.visible) return false;
  // Into the sprite's frame (undo rotation and flips about its loc).
  let lx = x - Math.trunc(s.locH);
  let ly = y - Math.trunc(s.locV);
  if (s.rotation) {
    const a = (-s.rotation * Math.PI) / 180;
    [lx, ly] = [lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a)];
  }
  if (s.flipH) lx = -lx;
  if (s.flipV) ly = -ly;
  const [rx, ry] = s.regPoint();
  const px = lx + rx;
  const py = ly + ry;
  if (px < 0 || py < 0 || px >= s.width || py >= s.height) return false;
  if (m instanceof BitmapMember && (s.ink === INK.matte || (m.useAlpha && m.image.depth === 32))) {
    const { alpha } = inkedBitmap(s, m);
    const ix = Math.floor((px * m.image.width) / s.width);
    const iy = Math.floor((py * m.image.height) / s.height);
    return (alpha[iy * m.image.width + ix] ?? 0) > (s.ink === INK.matte ? 0 : m.alphaThreshold);
  }
  // A Background Transparent text sprite with no mouse handlers lets clicks through
  // (Adobe's player: clicks on the garage's STATS and HIGHSCORE labels, which only have
  // a locZ behavior, reach the tab buttons under them, letters or not), while one with
  // handlers takes its whole box (the login's empty "LOG IN" hotspot).
  if (s.ink === INK.backgroundTransparent && m instanceof TextMember && !s.scriptInstanceList.some((i) => MOUSE_EVENTS.some((e) => findHandler(i, e)))) return false;
  return true;
}

const MOUSE_EVENTS = ['mouseDown', 'mouseUp', 'mouseUpOutSide', 'mouseEnter', 'mouseLeave', 'mouseWithin', 'rightMouseDown', 'rightMouseUp'];

