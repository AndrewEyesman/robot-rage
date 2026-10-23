// The arena's 2D layer: the frame bitmap around the 3D view, the player's name,
// armour meter and battery (sprites 40, 45, 70-72 of the Training frame).

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
  private blink = false;
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
  ) {}

  static async load(assets: string): Promise<Hud> {
    const bm = (n: number) => image(`${assets}/arena104/bitmaps/1-${n}.png`);
    const [frame, panel, meter, label, button] = await Promise.all([
      bm(182), // arena1: the Training frame
      bm(183), // pl1: the player's panel
      bm(170),
      bm(171),
      image(`${assets}/robotwars/bitmaps/1-69.png`),
    ]);
    return new Hud(frame, panel, meter, label, button);
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

    // The Training buttons (not clickable yet).
    ctx.font = '15px Impact, "Arial Narrow", sans-serif';
    ctx.textBaseline = 'top';
    ['WORKSHOP', 'LOBBY', 'GARAGE'].forEach((label, i) => {
      ctx.drawImage(this.button, 400 - 57, 506 + 30 * i - 14);
      ctx.fillStyle = '#e8e000';
      ctx.fillText(label, 354, 498 + 30 * i);
    });

    // Battery (sprite 70): its height is the energy; it blinks when nearly empty.
    const h = this.battery / 2.1;
    if (h < 10) this.blink = !this.blink;
    if (!(h < 10 && this.blink)) {
      ctx.fillStyle = h < 10 ? 'rgba(200,40,20,0.5)' : '#c8c800';
      ctx.fillRect(259, 469 + 89 - h, 25, h);
    }

    // Armour meter (sprite 71) slides right as armour grows; the label (72) covers its left end.
    const locH = (145 * this.armour) / 249.0 - 36;
    ctx.drawImage(this.meter, locH - 105, 529 - 3);
    ctx.drawImage(this.armourLabel, 36 - 36, 529 - 6);

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(name, 74, 502);
    ctx.restore();
  }
}
