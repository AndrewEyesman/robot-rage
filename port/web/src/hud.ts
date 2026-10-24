// The arena's 2D layer: the frame bitmap around the 3D view, the player's name,
// armour meter and battery (sprites 40, 45, 70-72 of the Training frame).

import { BitmapFont, SystemText } from './text';

const STAGE_W = 800;
const STAGE_H = 600;

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export class Hud {
  readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  battery = 100;
  armour = 0;
  /** Opacity of the battery (sprite 70) and armour meter (71), set by `update`. */
  private batteryBlend = 100;
  private armourBlend = 100;
  private left = 0;
  private top = 0;
  private scale = 1;
  private wide = false;
  private width = STAGE_W;

  private constructor(
    private readonly frame: HTMLImageElement,
    private readonly panel: HTMLImageElement,
    private readonly meter: HTMLImageElement,
    private readonly armourLabel: HTMLImageElement,
    private readonly button: HTMLImageElement,
    private readonly impact14: BitmapFont,
  ) {}

  /** The player's name: Verdana 9 bold (a Windows font, not embedded; Director sizes are pixels). */
  private readonly nameText = new SystemText('bold', 9, 'Verdana, "DejaVu Sans", sans-serif');

  static async load(assets: string): Promise<Hud> {
    const bm = (n: number) => image(`${assets}/arena104/bitmaps/1-${n}.png`);
    const [frame, panel, meter, label, button, impact14] = await Promise.all([
      bm(182), // arena1: the Training frame
      bm(183), // pl1: the player's panel
      bm(170),
      bm(171),
      image(`${assets}/robotwars/bitmaps/1-69.png`),
      BitmapFont.load(assets, 'robotwars', 'Impact *', 14),
    ]);
    return new Hud(frame, panel, meter, label, button, impact14);
  }

  private armourLocH() {
    return (145 * this.armour) / 249.0 - 36;
  }

  /**
   * updateBattery (every 16 ticks): set the readings. UpdateBatteryHeight and
   * UpdatePansarWidth blink a nearly empty battery or a low armour meter by toggling
   * its blend between 50 and 0 on each call.
   */
  update(battery: number, armour: number) {
    this.battery = battery;
    this.armour = armour;
    const blink = (blend: number) => (blend === 50 ? 0 : 50);
    this.batteryBlend = battery / 2.1 < 10 ? blink(this.batteryBlend) : 100;
    this.armourBlend = this.armourLocH() < 28 ? blink(this.armourBlend) : 100;
  }

  /** Place the stage: its top-left corner on the window and its scale. */
  layout(left: number, top: number, scale: number, wide: boolean, windowWidth: number) {
    this.left = left;
    this.top = top;
    this.scale = scale;
    this.wide = wide;
    this.width = windowWidth;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(windowWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    Object.assign(this.canvas.style, { left: '0px', top: '0px', width: `${windowWidth}px`, height: `${innerHeight}px` });
  }

  draw(name: string) {
    const ctx = this.ctx;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.left, dpr * this.top);
    ctx.imageSmoothingEnabled = true;
    if (this.wide) {
      // The control panel strip, repeated out to the window's sides.
      const y0 = 457;
      const h = STAGE_H - y0;
      const extra = (this.width / this.scale - STAGE_W) / 2;
      for (let x = -STAGE_W; x > -extra - STAGE_W; x -= STAGE_W) ctx.drawImage(this.frame, 0, y0, STAGE_W, h, x, y0, STAGE_W, h);
      for (let x = STAGE_W; x < STAGE_W + extra; x += STAGE_W) ctx.drawImage(this.frame, 0, y0, STAGE_W, h, x, y0, STAGE_W, h);
    }
    // Sprites off the stage's edge (the armour meter's left end) aren't drawn.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, STAGE_W, STAGE_H);
    ctx.clip();
    if (this.wide) ctx.drawImage(this.frame, 0, 457, STAGE_W, STAGE_H - 457, 0, 457, STAGE_W, STAGE_H - 457);
    else ctx.drawImage(this.frame, 0, 0);
    ctx.drawImage(this.panel, 182 - 171, 539 - 54);

    // The Training buttons (not clickable yet): labels in the embedded Impact, in
    // their sprites' foreColor rgb(204, 204, 0).
    ['WORKSHOP', 'LOBBY', 'GARAGE'].forEach((label, i) => {
      ctx.drawImage(this.button, 400 - 57, 506 + 30 * i - 14);
      this.impact14.draw(ctx, label, 353, 498 + 30 * i, '#cccc00');
    });

    // Battery (sprite 70): its height is the energy. It's a Flash shape in its
    // sprite's colour, rgb(179, 190, 38).
    const h = this.battery / 2.1;
    ctx.globalAlpha = this.batteryBlend / 100;
    ctx.fillStyle = '#b3be26';
    ctx.fillRect(259, 469 + 89 - h, 25, h);

    // Armour meter (sprite 71) slides right as armour grows; the label (72) covers its left end.
    ctx.globalAlpha = this.armourBlend / 100;
    ctx.drawImage(this.meter, this.armourLocH() - 105, 529 - 3);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.armourLabel, 36 - 36, 529 - 6);

    // The member's white text shows in the sprite's backColor, rgb(0, 255, 0).
    this.nameText.draw(ctx, name, 74, 504, '#00ff00');
    ctx.restore();
  }
}
