// A small test harness for the Director runtime's unit tests, run in real Chrome
// (tests.html, driven by port/tools/unit-tests.mjs): the runtime needs a real canvas,
// fonts and images. Tests build a fake movie (a MovieDoc plus behavior classes
// registered with registerCast), drive it with player.stepFrame() and synthetic
// input, and assert on what the scripts saw.

import { boot } from '../api';
import { Behavior } from '../behavior';
import type { FieldDoc, MemberDoc, MovieDoc, SpanDoc, SpriteDoc, TextDoc } from '../docs';
import type { Player } from '../player';
import { registerCast, type ScriptClass } from '../registry';

// ------------------------------------------------------------------ tests

export interface TestCase {
  area: string;
  name: string;
  /** Where the rule comes from (Director docs, Adobe measurement, dirplayer, docs/port-issues.md...). */
  source: string;
  fn: () => void | Promise<void>;
  /** A known difference from Director: the test documents the right behaviour and is expected to fail. */
  knownFailure?: string;
}

export const cases: TestCase[] = [];
let currentArea = '';

export function describe(area: string, body: () => void) {
  currentArea = area;
  body();
  currentArea = '';
}

export function test(name: string, source: string, fn: () => void | Promise<void>) {
  cases.push({ area: currentArea, name, source, fn });
}

/** A test of what Director does that the runtime doesn't do yet (reported, not failed). */
export function knownFailure(name: string, source: string, reason: string, fn: () => void | Promise<void>) {
  cases.push({ area: currentArea, name, source, fn, knownFailure: reason });
}

export class AssertionError extends Error {}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export function eq(actual: unknown, expected: unknown, what = 'value') {
  if (show(actual) !== show(expected)) throw new AssertionError(`${what}: expected ${show(expected)}, got ${show(actual)}`);
}

export function ok(cond: unknown, what: string) {
  if (!cond) throw new AssertionError(what);
}

export function near(actual: number, expected: number, tol: number, what = 'value') {
  if (!(Math.abs(actual - expected) <= tol)) throw new AssertionError(`${what}: expected ${expected} ±${tol}, got ${actual}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(cond: () => boolean, what: string, ms = 2000) {
  const until = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > until) throw new AssertionError(`timed out waiting for ${what}`);
    await sleep(1);
  }
}

// ------------------------------------------------------------------ fake movies

/** A bitmap member with no PNG: a white image of the given size (scripts draw into it). */
export function bitmap(num: number, width: number, height: number, o: { name?: string; reg?: [number, number]; depth?: number; useAlpha?: boolean } = {}): MemberDoc {
  return { lib: 1, num, name: o.name ?? `bmp${num}`, type: 'Bitmap', width, height, reg: o.reg ?? [0, 0], depth: o.depth ?? 32, useAlpha: o.useAlpha ?? false };
}

export interface RunSpec {
  text: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export function textDoc(runs: RunSpec[], o: Partial<TextDoc> = {}): TextDoc {
  return {
    text: runs.map((r) => r.text).join(''),
    alignment: 'left',
    wordWrap: true,
    fixedLineSpace: 0,
    size: [0, 0],
    spans: runs.map((r) => ({ text: r.text, font: r.font ?? 'Verdana', size: r.size ?? 10, color: r.color ?? '#000000', bold: !!r.bold, italic: !!r.italic, underline: !!r.underline })),
    ...o,
  };
}

export function text(num: number, doc: TextDoc, name = `text${num}`): MemberDoc {
  return { lib: 1, num, name, type: 'Ole', text: doc };
}

export function fieldDoc(txt: string, o: Partial<FieldDoc> & { font?: string; size?: number; style?: number } = {}): FieldDoc {
  const { font = 'Verdana', size = 10, style = 0, ...rest } = o;
  return {
    text: txt, border: 0, margin: 0, boxShadow: 0, boxType: 2, alignment: 0, bg: [255, 255, 255], scroll: 0, rect: [0, 0, 150, 40],
    maxHeight: 0, textShadow: 0, editable: false, autoTab: false, wordWrap: true, textHeight: 0,
    runs: [{ start: 0, font, size, style, color: '#000000', fontId: 0, height: 0, ascent: 0 }],
    ...rest,
  };
}

export function field(num: number, doc: FieldDoc, name = `field${num}`): MemberDoc {
  return { lib: 1, num, name, type: 'Field', field: doc };
}

export function shape(num: number, w: number, h: number, name = `shape${num}`): MemberDoc {
  return { lib: 1, num, name, type: 'Shape', shape: { shapeType: 1, rect: [0, 0, w, h], pattern: 1, fore: 255, back: 0, filled: 1, lineSize: 1, lineDirection: 5 } };
}

/** A 3D world member (no W3D data: only its type matters to the 2D runtime). */
export function world3d(num: number, name = `w3d${num}`): MemberDoc {
  return { lib: 1, num, name, type: 'Shockwave3D', w3d: 'none.w3d' };
}

/** A score sprite in one channel over a range of frames. */
export interface FakeSprite {
  ch: number;
  frames: [number, number];
  member: number;
  loc?: [number, number];
  size?: [number, number];
  stretch?: boolean;
  ink?: number;
  blend?: number;
  fore?: [number, number, number];
  back?: [number, number, number];
  /** 1: fore is RGB, 2: back is RGB (else palette indices). */
  colorFlag?: number;
  editable?: boolean;
  /** Per-frame changes in the score (a tween, a member swap...). */
  at?: Record<number, Partial<Pick<FakeSprite, 'loc' | 'member' | 'ink' | 'blend' | 'size'>>>;
  /** Behaviors: script member numbers, or [number, parameter list literal]. */
  scripts?: (number | [number, string])[];
  /** The span's frames when they differ from the sprite's (to split one channel into two spans). */
  spans?: { frames: [number, number]; scripts: (number | [number, string])[] }[];
}

export interface FakeMovie {
  frames: number;
  labels?: Record<string, number>;
  members?: MemberDoc[];
  sprites?: FakeSprite[];
  /** Frame scripts (channel 0 spans). */
  frameScripts?: { frames: [number, number]; script: number }[];
  scripts?: Record<number, ScriptClass>;
  handlers?: Record<string, (...args: never[]) => unknown>;
  stageColor?: [number, number, number];
}

let movieCount = 0;

/** The MovieDoc a fake movie describes. */
export function movieDoc(m: FakeMovie, name: string): MovieDoc {
  const sprites: SpriteDoc[] = [];
  const spans: SpanDoc[] = [];
  for (const s of m.sprites ?? []) {
    for (let f = s.frames[0]; f <= s.frames[1]; f++) {
      const o = { ...s, ...(s.at?.[f] ?? {}) };
      const size = o.size ?? [0, 0];
      sprites.push({
        frame: f, channel: s.ch + 5, member: [1, o.member], loc: o.loc ?? [0, 0], size, ink: o.ink ?? 0, blend: 0, blendPct: o.blend ?? 100,
        stretch: o.stretch ?? false, type: 16, rotation: 0, skew: 0, fore: o.fore ?? [255, 0, 0], back: o.back ?? [0, 0, 0], colorFlag: o.colorFlag ?? 0,
        flipH: false, flipV: false, editable: !!o.editable, moveable: false, trails: false,
      });
    }
    const groups = s.spans ?? (s.scripts?.length ? [{ frames: s.frames, scripts: s.scripts }] : []);
    for (const g of groups)
      for (const sc of g.scripts) {
        const [num, params] = typeof sc === 'number' ? [sc, null] : sc;
        spans.push({ channel: s.ch, start: g.frames[0], end: g.frames[1], scripts: [[1, num]], params: [params ? [params] : []] });
      }
  }
  for (const fs of m.frameScripts ?? []) spans.push({ channel: 0, start: fs.frames[0], end: fs.frames[1], scripts: [[1, fs.script]], params: [[]] });
  return {
    file: `${name}.dir`, stage: [0, 0, 800, 600], frameRate: 20, stageColor: m.stageColor ?? [255, 255, 255],
    castLibs: [{ name: 'Internal', file: '', min: 1, max: 999 }], fonts: {}, members: m.members ?? [],
    labels: Object.entries(m.labels ?? {}).map(([k, v]) => [v, k] as [number, string]), frameCount: m.frames, spans, sprites,
  };
}

const stages: HTMLElement[] = [];

/** A fresh player (the one api.ts's Lingo commands talk to), its stage at the page's top-left at 1:1. */
export function newPlayer(): Player {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '800px', height: '600px' });
  document.body.append(el);
  stages.push(el);
  const p = boot(el as HTMLDivElement, '/assets');
  p.layoutHook = (pl) => {
    pl.left = 0;
    pl.top = 0;
    pl.scale = 1;
  };
  p.layout();
  return p;
}

/** Remove the stages the last test made. */
export function cleanup() {
  for (const el of stages.splice(0)) el.remove();
}

/** Register a fake movie with a player (its scripts with the registry); returns its name. */
export function addMovie(p: Player, m: FakeMovie): string {
  const name = `utest${++movieCount}`;
  registerCast(name, { scripts: m.scripts ?? {}, handlers: m.handlers ?? {} });
  (p as unknown as { docs: Map<string, Promise<MovieDoc>> }).docs.set(name, Promise.resolve(movieDoc(m, name)));
  return name;
}

/** Switch the player to a movie now (prepareMovie runs; the first frame's events come with the next stepFrame). */
export async function switchTo(p: Player, name: string, frame: number | string = 1) {
  p.goMovie(name, frame);
  await (p as unknown as { switchMovie(): Promise<void> }).switchMovie();
}

/** A new player playing a fake movie, stopped before its first frame cycle. */
export async function play(m: FakeMovie, frame: number | string = 1): Promise<Player> {
  const p = newPlayer();
  await switchTo(p, addMovie(p, m), frame);
  return p;
}

export function steps(p: Player, n: number) {
  for (let i = 0; i < n; i++) p.stepFrame();
}

// ------------------------------------------------------------------ logging behaviors

export const FRAME_EVENTS = ['beginSprite', 'endSprite', 'prepareFrame', 'enterFrame', 'exitFrame', 'stepFrame'] as const;

/**
 * A behavior class that logs every frame event as "<tag>:<event>" (tag: s<spriteNum>,
 * or "fs" for the frame script). `extra` adds or overrides handlers.
 */
export function logger(log: string[], tag?: string, extra: Record<string, (this: Behavior & Record<string, unknown>, ...a: unknown[]) => unknown> = {}): ScriptClass {
  class Logged extends Behavior {}
  const proto = Logged.prototype as unknown as Record<string, unknown>;
  for (const ev of FRAME_EVENTS)
    proto[ev] = function (this: Behavior) {
      log.push(`${tag ?? (this.spriteNum ? `s${this.spriteNum}` : 'fs')}:${ev}`);
    };
  for (const [k, f] of Object.entries(extra)) proto[k] = f;
  return Logged;
}

// ------------------------------------------------------------------ input

/** Mouse events at a stage point (the stage sits at the page's top-left at 1:1). */
export function mouseDown(p: Player, x: number, y: number) {
  p.el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }));
}
export function mouseUp(_p: Player, x: number, y: number) {
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, button: 0, bubbles: true }));
}
export function mouseMove(p: Player, x: number, y: number) {
  p.el.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
}
export function click(p: Player, x: number, y: number) {
  mouseDown(p, x, y);
  mouseUp(p, x, y);
}

const CODE_OF: Record<string, string> = {
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ' ': 'Space',
};

/**
 * A key press straight into this player (window key events would reach every player
 * the tests have made). `key` is KeyboardEvent.key: 'a', 'Enter', 'Tab', 'ArrowLeft'...
 */
export function press(p: Player, key: string, o: { shift?: boolean } = {}) {
  const code = CODE_OF[key] ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : '');
  const init = { key, code, shiftKey: !!o.shift, cancelable: true };
  const pp = p as unknown as { keyDown(e: KeyboardEvent): void; keyUp(e: KeyboardEvent): void };
  pp.keyDown(new KeyboardEvent('keydown', init));
  pp.keyUp(new KeyboardEvent('keyup', init));
}

export function typeText(p: Player, s: string) {
  for (const ch of s) press(p, ch);
}
