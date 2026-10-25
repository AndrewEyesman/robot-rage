// The port's touch controls for the arena (phones and tablets; src/mobile.ts says when a
// page is in touch mode, ?touch=1 and ?touch=0 force it). Only while a match or Training
// is being played, from the countdown on, and not while the chat line is open:
//
// - a stick at the bottom left for the arrows (up drives forward, down back, left and
//   right turn; diagonals press two);
// - a button for each of the robot's weapons at the bottom right, showing just its key
//   (the panel names the weapons): Z, X and C fire the first, second and third weapon
//   (initWeapons numbers them as the control panel lists them, "(Z) Flamethrower"), held
//   for as long as the key would be. A passive part (the plough, the spikes), which has
//   no key, gets no button;
// - a camera button at the 3D view's top right (just above it when held upright), which
//   steps through the views 1, 2 and 3 as the keys do.
//
// They press the keys through Player.virtualKey, so the arena reads them exactly as the
// keyboard's (keyMap, the frame script's keyUp). On a phone they sit on the strips of
// panel art beside the control panel, reaching up into the 3D view's lower corners;
// where those strips are too narrow (a tablet), just above the panel. Never over the
// panel's buttons (surrender, chat, the doors) or the middle of the view.

import { STAGE_H, bootHooks, type Player } from '../../director';
import { sym, type LSymbol } from '../../lingo';
import { onTouchMode } from '../../mobile';
import { MainFramescript } from './s002-main-framescript';
import { BackyardFramescript } from './s004-backyard-framescript';
import { PANEL_TOP } from './enhancements';

/** The frame scripts' states in which the robot is driven (and the countdown before). */
const MATCH_STATES = ['three', 'wait3', 'two', 'wait2', 'one', 'wait1', 'run', 'initfadeout', 'fadeout', 'activate', 'idle'].map(sym);
const TRAINING_STATES = ['init', 'init2', 'idle'].map(sym);

/** A match or Training is being played: the controls are up. */
function playing(p: Player): boolean {
  if (p.movie?.name !== 'arena104') return false;
  const fs = p.frameScript;
  const states = fs instanceof MainFramescript ? MATCH_STATES : fs instanceof BackyardFramescript ? TRAINING_STATES : null;
  if (!states || !states.includes((fs as { state: LSymbol }).state)) return false;
  // The chat line (sprite 211) takes the keys while it's open.
  return p.sprite(211).getProp('state') === sym('hidden');
}

/** Weapon slot n's key and name from the control panel's text ("(Z)\tName"; no key for a passive part). */
function weaponOf(p: Player, n: number): string {
  const text = String((p.member(`weapon${n} text`) as { text?: string } | undefined)?.text ?? '');
  return text.startsWith('(') ? text.split('\t').slice(1).join(' ').trim() || '?' : '';
}

const CSS = `
#touch-controls { position: fixed; inset: 0; z-index: 2; pointer-events: none; display: none; touch-action: none; user-select: none; -webkit-user-select: none; font-family: sans-serif; }
#touch-controls.up { display: block; }
#touch-controls > div { position: absolute; pointer-events: auto; box-sizing: border-box; border-radius: 50%; touch-action: none; }
#touch-controls .stick { background: rgba(0, 0, 0, 0.22); border: 2px solid rgba(255, 255, 255, 0.35); }
#touch-controls .knob { position: absolute; left: 50%; top: 50%; width: 42%; height: 42%; margin: -21% 0 0 -21%; border-radius: 50%;
  background: rgba(255, 255, 255, 0.30); border: 2px solid rgba(255, 255, 255, 0.55); box-sizing: border-box; }
#touch-controls .arrow { position: absolute; width: 0; height: 0; border: 7px solid transparent; opacity: 0.55; }
#touch-controls .fire, #touch-controls .cam { background: rgba(0, 0, 0, 0.28); text-shadow: 0 1px 2px #000; border: 2px solid rgba(255, 255, 255, 0.40); color: rgba(255, 255, 255, 0.85);
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
#touch-controls .fire.down, #touch-controls .cam.down { background: rgba(255, 220, 60, 0.40); border-color: rgba(255, 230, 120, 0.85); }
#touch-controls .fire b { font-size: 1.7em; line-height: 1; }
`;

class TouchControls {
  private readonly root = document.createElement('div');
  private readonly stick = document.createElement('div');
  private readonly knob = document.createElement('div');
  private readonly fires: HTMLDivElement[] = [];
  private readonly cam = document.createElement('div');
  /** The keys these controls hold down. */
  private readonly held = new Set<string>();
  private stickPointer: number | null = null;
  private shown = false;
  private labels = '';
  private size = '';

  constructor(private readonly p: Player) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root.id = 'touch-controls';
    this.stick.className = 'stick';
    this.knob.className = 'knob';
    this.stick.append(this.knob);
    for (const [side, edge] of [['top', 'bottom'], ['bottom', 'top'], ['left', 'right'], ['right', 'left']]) {
      const a = document.createElement('div');
      a.className = 'arrow';
      Object.assign(a.style, { [side]: '5%', [edge === 'bottom' || edge === 'top' ? 'left' : 'top']: 'calc(50% - 7px)', [`border-${edge}-color`]: '#fff' });
      this.stick.append(a);
    }
    this.root.append(this.stick);
    for (const key of ['KeyZ', 'KeyX', 'KeyC']) {
      const b = document.createElement('div');
      b.className = 'fire';
      b.dataset.key = key;
      this.hold(b, () => this.set(key, true), () => this.set(key, false));
      this.fires.push(b);
      this.root.append(b);
    }
    this.cam.className = 'cam';
    this.cam.innerHTML = '<svg viewBox="0 0 24 24" width="55%" height="55%"><path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
    this.hold(this.cam, () => {}, () => this.nextCamera());
    this.root.append(this.cam);
    this.bindStick();
    document.body.append(this.root);
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => this.releaseAll());
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Press or release a key, once. */
  private set(key: string, down: boolean) {
    if (down === this.held.has(key)) return;
    if (down) this.held.add(key);
    else this.held.delete(key);
    this.p.virtualKey(key, down);
  }

  private releaseAll() {
    for (const k of [...this.held]) this.set(k, false);
    this.stickPointer = null;
    this.knob.style.transform = '';
    for (const b of [...this.fires, this.cam]) b.classList.remove('down');
  }

  /** A button held by one finger at a time: `down` on touch, `up` when it lifts (or is cancelled). */
  private hold(el: HTMLDivElement, down: () => void, up: () => void) {
    let id: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('down');
      down();
    });
    const end = (e: PointerEvent) => {
      // Kept from the window's pointerup, where the stage would take it for its own.
      e.stopPropagation();
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('down');
      if (this.shown) up();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private bindStick() {
    const el = this.stick;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R;
      let dy = (e.clientY - r.top - R) / R;
      const len = Math.hypot(dx, dy);
      // Eight directions of 45 degrees each, past a dead zone in the middle.
      const go = len > 0.22;
      const ux = go ? dx / len : 0;
      const uy = go ? dy / len : 0;
      const T = Math.sin(Math.PI / 8);
      this.set('ArrowUp', uy < -T);
      this.set('ArrowDown', uy > T);
      this.set('ArrowLeft', ux < -T);
      this.set('ArrowRight', ux > T);
      if (len > 0.6) (dx *= 0.6 / len), (dy *= 0.6 / len);
      this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) move(e);
    });
    const end = (e: PointerEvent) => {
      e.stopPropagation();
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) this.set(k, false);
      this.knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** The camera key after the current view's (1, 2, 3, then 1 again), pressed and released. */
  private nextCamera() {
    const now = Number(this.p.globals.pNowCam) || 0;
    const key = `Digit${(now % 3) + 1}`;
    this.p.virtualKey(key, true);
    this.p.virtualKey(key, false);
  }

  private update() {
    const show = playing(this.p);
    if (show !== this.shown) {
      this.shown = show;
      this.root.classList.toggle('up', show);
      if (!show) this.releaseAll();
    }
    if (!show) return;
    const labels = [1, 2, 3].map((n) => weaponOf(this.p, n));
    if (labels.join('\n') !== this.labels) {
      this.labels = labels.join('\n');
      labels.forEach((name, i) => {
        const b = this.fires[i];
        b.style.display = name ? '' : 'none';
        b.innerHTML = '';
        const key = document.createElement('b');
        key.textContent = 'ZXC'[i];
        b.append(key);
        b.setAttribute('aria-label', name);
        if (!name) this.set(b.dataset.key!, false);
      });
    }
    const size = `${innerWidth}x${innerHeight} ${this.p.left} ${this.p.top} ${this.p.scale}`;
    if (size !== this.size) {
      this.size = size;
      this.place();
    }
  }

  /** Size and place the controls for the window and the stage's layout. */
  private place() {
    const p = this.p;
    const W = innerWidth;
    const H = innerHeight;
    const S = Math.round(Math.max(110, Math.min(170, Math.min(W, H) * 0.34))); // the stick
    const B = Math.round(S * 0.46); // a fire button
    const m = Math.round(S * 0.08); // the margin
    const cluster = Math.round(B * 2.25);
    const stageBottom = p.top + STAGE_H * p.scale;
    const panelTop = p.top + PANEL_TOP * p.scale;
    // Where the stick and the fire buttons (2.15 buttons high) sit: just under the stage
    // in the black bar there (a phone or tablet held upright), as the camera button sits
    // just over it, else as low as they can, on the strips beside the panel (art, or
    // black bars), else just above the panel.
    const fireH = B * 2.15;
    let stickBottom: number;
    let fireBottom: number;
    if (H - stageBottom >= S + 2 * m) {
      stickBottom = Math.round(stageBottom + m + S);
      fireBottom = Math.round(stageBottom + m + fireH);
    } else {
      stickBottom = fireBottom = p.left >= Math.max(S, cluster) + m ? H - m : panelTop - m;
    }
    const box = (el: HTMLElement, x: number, y: number, d: number) =>
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${d}px`, height: `${d}px`, fontSize: `${Math.round(d * 0.26)}px` });
    box(this.stick, m, stickBottom - S, S);
    // Z in the corner, X to its left, C above it: an arc round the right thumb.
    const right = W - m;
    box(this.fires[0], right - B, fireBottom - B, B);
    box(this.fires[1], right - B * 2.1, fireBottom - B * 0.8, B);
    box(this.fires[2], right - B * 1.05, fireBottom - fireH, B);
    // The camera at the right, away from the thumbs: in the black bar over the stage when
    // there is one (held upright), just above the stage, else in the 3D view's top right corner.
    const c = Math.round(B * 0.7);
    box(this.cam, right - c, p.top >= c + 2 * m ? p.top - m - c : Math.max(0, p.top) + m, c);
  }
}

bootHooks.push((p) => onTouchMode(() => new TouchControls(p)));
