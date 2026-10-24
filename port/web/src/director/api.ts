// The Lingo commands and properties that translated scripts call, bound to the one
// running player. Names follow Lingo's, so a translated line reads like the original:
//   sendSprite(0, 'login', me)   go('listrobots')   the.frame   member('x').text = ''

import { sound as soundChannel, soundBusy as channelBusy } from './audio';
import { DColor } from './color';
import { call as callHandler, findHandler } from './dispatch';
import { BitmapMember, CastLib, Member, newMember, SoundMember, TextualMember } from './members';
import { Player, warnOnce, type Timeout } from './player';
import type { Sprite } from './sprite';
import { LList, LPoint, LPropList, LSymbol, lingoString, propList, sym } from '../lingo';
import { getStreamStatus as streamStatus, postNetText as netPost } from './net';

export let player: Player = null as unknown as Player;

/** Lingo globals (case-insensitive names). */
export const G: Record<string, any> = new Proxy({} as Record<string, any>, {
  get: (_t, p) => (typeof p === 'string' && player ? player.globals[p] : undefined),
  set: (_t, p, v) => {
    if (typeof p === 'string' && player) player.globals[p] = v;
    return true;
  },
});

/** Called with the player when it boots (a movie's port-only additions install their hooks). */
export const bootHooks: ((p: Player) => void)[] = [];

export function boot(el: HTMLDivElement, assets: string): Player {
  player = new Player(el, assets);
  (window as unknown as { __player: Player }).__player = player;
  for (const h of bootHooks) h(player);
  return player;
}

const emptyCast = new CastLib(0, 'none', '', null);

export function sprite(n: number): Sprite {
  return player.sprite(Math.trunc(n));
}

/**
 * member(name or number[, castLib]); an unknown member is an empty one (member 0), as
 * in Director. Typed loosely, as Lingo is: `member("x").text`, `.image`, `.regPoint`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function member(nameOrNum: string | number | Member, castLib?: string | number): any {
  if (nameOrNum instanceof Member) return nameOrNum;
  const m = player.member(nameOrNum, castLib);
  if (m) return m;
  return new Member(emptyCast, 0, 'empty', String(nameOrNum));
}

/** A member of a known kind, for typed access (member('error', TextualMember).text). */
export function memberOf<T extends Member>(nameOrNum: string | number, cls: new (...a: never[]) => T, castLib?: string | number): T {
  const m = member(nameOrNum, castLib);
  if (!(m instanceof cls)) throw new Error(`member ${String(nameOrNum)} is ${m.type}, not ${cls.name}`);
  return m;
}

export function textMember(nameOrNum: string | number, castLib?: string | number): TextualMember {
  return memberOf(nameOrNum, TextualMember as never, castLib) as TextualMember;
}

export function bitmapMember(nameOrNum: string | number, castLib?: string | number): BitmapMember {
  return memberOf(nameOrNum, BitmapMember, castLib);
}

export function castLib(nameOrNum: string | number): CastLib {
  return player.castLib(nameOrNum) ?? emptyCast;
}

/** new(#bitmap, castLib "x") */
export function newCastMember(type: string, cast?: string | number | CastLib, slot?: number): Member {
  const c = cast instanceof CastLib ? cast : castLib(cast ?? 1);
  return newMember(c, type, slot);
}

/** label("name"): the frame number of a marker (0 when there is none). */
export function label(name: string): number {
  return player.movie?.labelFrame(String(name)) ?? 0;
}

export function go(target: number | string, movie?: string) {
  if (movie !== undefined) player.goMovie(movieNameOf(movie), target);
  else player.go(target);
}

/**
 * The fan wrapper movies only preloaded the originals and compiled relay scripts at
 * runtime; the port plays the originals directly (port/TRANSLATING.md).
 */
const MOVIE_ALIASES: Record<string, string> = {
  wrapper_robotragerearmed: 'loader002',
  login013: 'login013_',
  lobby060: 'lobby060_',
};

/** "http://host/game/arena104.dcr#start" -> movie "arena104", frame "start". */
function movieNameOf(url: string): string {
  const file = url.split('#')[0].split(/[\\/:]/).pop() ?? url;
  const name = file.replace(/\.(dcr|dir|dxr)$/i, '').toLowerCase();
  return MOVIE_ALIASES[name] ?? name;
}

export function gotoNetMovie(url: string) {
  const [, label] = url.split('#');
  player.goMovie(movieNameOf(url), label ?? 1);
}

export function gotoNetPage(url: string, target?: string) {
  if (/^javascript:/i.test(url)) return; // the fan site's page scripts aren't part of the port
  window.open(url, target ?? '_blank');
}

export function sendSprite(n: number, msg: string | LSymbol, ...args: unknown[]): any {
  return player.sendSprite(Math.trunc(n), msgName(msg), ...args);
}

export function sendAllSprites(msg: string | LSymbol, ...args: unknown[]): any {
  return player.sendAllSprites(msgName(msg), ...args);
}

function msgName(m: string | LSymbol) {
  return m instanceof LSymbol ? m.name : String(m);
}

/** call(#handler, object(s), args...) */
export function call(msg: string | LSymbol, target: unknown, ...args: unknown[]): any {
  return callHandler(msgName(msg), target, ...args);
}

/** obj.handler(#name) */
export function handler(obj: unknown, msg: string | LSymbol): boolean {
  return !!findHandler(obj as object, msgName(msg));
}

/** A movie-script handler by name (for `do`-style dynamic calls). */
export function movieHandler(name: string) {
  return player.movieHandler(name);
}

export function script(name: string) {
  const s = player.script(name);
  if (!s) warnOnce(`script("${name}") has no translation`);
  return s;
}

export function puppetSprite(n: number, on: boolean | number) {
  const s = sprite(n);
  s.puppet = !!on;
}

export function puppetTempo(fps: number) {
  player.tempo = fps;
}

export function updateStage() {
  player.render();
}

export function keyPressed(k: number | string) {
  return player.keyPressed(k);
}

/** rollover(n): whether the mouse is over sprite n's bounding box. */
export function rollover(n: number): boolean {
  const s = player.sprite(Math.trunc(n));
  if (!s.member) return false;
  const b = s.bounds;
  return player.mouseH >= b.left && player.mouseH < b.right && player.mouseV >= b.top && player.mouseV < b.bottom;
}

/** timeout("name"): a handle whether or not the timeout exists yet, as in Lingo. */
export class TimeoutRef {
  constructor(readonly name: string) {}
  private get t(): Timeout | undefined {
    return player.timeouts.get(this.name);
  }
  /** timeout("x").new(period, #handler, target) */
  new(period: number, handlerName: string | LSymbol, target?: object): TimeoutRef {
    player.newTimeout(this.name, period, msgName(handlerName), target);
    return this;
  }
  forget() {
    player.timeouts.delete(this.name);
  }
  get exists() {
    return !!this.t;
  }
  get persistent() {
    return this.t?.persistent ?? false;
  }
  set persistent(v: boolean | number) {
    if (this.t) this.t.persistent = !!v;
  }
  get period() {
    return this.t?.period ?? 0;
  }
  set period(v: number) {
    if (this.t) this.t.period = v;
  }
  get target() {
    return this.t?.target;
  }
  set target(v: object | undefined) {
    if (this.t) this.t.target = v;
  }
}

export function timeout(name: string): TimeoutRef {
  return new TimeoutRef(name);
}

/** new(timeout(), name, period, #handler, target) / timeout(name).new(period, #handler, target) */
export function newTimeout(name: string, period: number, handlerName: string | LSymbol, target?: object): TimeoutRef {
  player.newTimeout(name, period, msgName(handlerName), target);
  return new TimeoutRef(name);
}

const PREF = 'rr-pref:';
export function getPref(name: string): string | undefined {
  return localStorage.getItem(PREF + name.toLowerCase()) ?? undefined;
}
export function setPref(name: string, value: unknown) {
  localStorage.setItem(PREF + name.toLowerCase(), String(value));
}

export function put(...args: unknown[]) {
  if (new URLSearchParams(location.search).has('trace')) console.log(...args.map((a) => (typeof a === 'string' ? a : lingoString(a as never))));
}

export function alert(msg: unknown) {
  console.warn('alert:', msg);
}

export function beep() {}

export function quit() {}

export function halt() {}

/** cursor(n): the cursor everywhere on the stage, unless a sprite under the mouse sets its own. */
export function cursor(n: unknown) {
  player.globalCursor = n;
}

export function sound(n: number) {
  return soundChannel(n);
}

export function soundBusy(n: number) {
  return channelBusy(n);
}

/** puppetSound(channel, member) / puppetSound(channel, 0) */
export function puppetSound(ch: number, m: string | number | Member) {
  if (m === 0) return soundChannel(ch).stop();
  const mem = typeof m === 'object' ? m : member(m);
  if (mem instanceof SoundMember) soundChannel(ch).play(mem);
}

/** The movie's URL parameters (sw1 and the like). */
export function externalParamValue(name: string): string | undefined {
  const v = new URLSearchParams(location.search).get(name);
  if (v !== null) return v;
  // Every tab claims the same external IP: the game then believes all players sit
  // behind one router, so they see each other in the lobby (docs/notes.md).
  if (name.toLowerCase() === 'sw1') return '10.0.0.1';
  return undefined;
}

/** This tab's made-up private address, which the relay knows it by (docs/notes.md). */
export function myAddress(): string {
  return (sessionStorage.rrAddress ||= [10, 1 + ((Math.random() * 254) | 0), (Math.random() * 256) | 0, 1 + ((Math.random() * 254) | 0)].join('.'));
}

export function rgbColor(r: number | string, g?: number, b?: number) {
  return typeof r === 'string' ? DColor.hex(r) : new DColor(r, g ?? 0, b ?? 0);
}

/** postNetText's property list as form pairs (keys by name, values as strings). */
export function formPairs(list: LPropList): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 1; i <= list.count; i++) {
    const k = list.getPropAt(i);
    const v = list.getAt(i);
    out.push([k instanceof LSymbol ? k.name : String(k), typeof v === 'string' ? v : lingoString(v as never)]);
  }
  return out;
}

let preferred3dRenderer: unknown = sym('auto');

/** Lingo's `the` properties. */
export const the = {
  /**
   * After go(x) in a handler, `the frame` is already x (the playhead moves at once in
   * Director), so the common `go(label) ... go(the frame)` keeps the jump.
   */
  get frame() {
    return player.playhead;
  },
  get frameLabel() {
    return player.frameLabel;
  },
  get movieName() {
    return `${player.movie?.name ?? ''}.dcr`;
  },
  get moviePath() {
    return `${location.origin}/game/`;
  },
  get runMode() {
    return 'Plugin';
  },
  get platform() {
    return 'Windows,32';
  },
  get machineType() {
    return 256;
  },
  get productVersion() {
    return '10.1';
  },
  get safePlayer() {
    return 1;
  },
  get milliSeconds() {
    return player.milliSeconds;
  },
  get ticks() {
    return Math.floor((player.milliSeconds * 60) / 1000);
  },
  get currentSpriteNum() {
    return player.currentSpriteNum;
  },
  get spriteNum() {
    return player.currentSpriteNum;
  },
  get mouseH() {
    return player.mouseH;
  },
  get mouseV() {
    return player.mouseV;
  },
  /** the mouseLoc, a point. */
  get mouseLoc() {
    return new LPoint(player.mouseH, player.mouseV);
  },
  get mouseDown() {
    return player.mouseIsDown;
  },
  get stillDown() {
    return player.mouseIsDown;
  },
  get clickOn() {
    return player.clickOn;
  },
  get rollover() {
    return player.rollover;
  },
  get doubleClick() {
    return player.doubleClick;
  },
  get key() {
    return player.key;
  },
  get keyCode() {
    return player.keyCode;
  },
  get shiftDown() {
    return player.shiftDown;
  },
  get controlDown() {
    return player.controlDown;
  },
  get optionDown() {
    return player.optionDown;
  },
  get commandDown() {
    return player.commandDown;
  },
  get keyboardFocusSprite() {
    return player.keyboardFocusSprite;
  },
  set keyboardFocusSprite(n: number) {
    player.keyboardFocusSprite = n;
  },
  get selStart() {
    return player.selStart;
  },
  set selStart(v: number) {
    player.selStart = v;
  },
  get selEnd() {
    return player.selEnd;
  },
  set selEnd(v: number) {
    player.selEnd = v;
  },
  get actorList() {
    return player.actorList;
  },
  set actorList(v: object[]) {
    player.actorList = v;
  },
  get frameTempo() {
    return player.tempo;
  },
  get lastChannel() {
    return 1000;
  },
  get stageColor() {
    return player.stageColor;
  },
  get maxinteger() {
    return 2147483647;
  },
  /** The 3D renderer in use: always hardware (WebGL), never #software. */
  get active3dRenderer() {
    return sym('openGL');
  },
  /** Stored only (the arena sets it from gRender); WebGL is the one renderer. */
  get preferred3dRenderer(): unknown {
    return preferred3dRenderer;
  },
  set preferred3dRenderer(v: unknown) {
    preferred3dRenderer = v;
  },
  /** the long time, e.g. "14:03:07". */
  get longTime() {
    return new Date().toLocaleTimeString('en-GB');
  },
  get time() {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  },
  get date() {
    const d = new Date();
    return `${String(d.getFullYear() % 100).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  /** (the systemDate): year, month, day, and seconds since midnight. */
  get systemDate() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), seconds: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() };
  },
};

/**
 * Lingo's dot access on property lists, through any depth: `gShockplay.info.folder`
 * is `dot(G.gShockplay, 'info', 'folder')`. VOID where a step is missing or not a
 * property list (`pl.count` with a #count property gives the property, as Lingo does).
 */
export function dot(v: unknown, ...path: string[]): any {
  let cur = v;
  for (const k of path) {
    if (cur instanceof LPropList) cur = cur.getaProp(sym(k));
    else if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

/** `pl.a.b = v` */
export function setDot(v: unknown, ...pathAndValue: unknown[]) {
  const value = pathAndValue.pop();
  const path = pathAndValue as string[];
  const owner = dot(v, ...path.slice(0, -1));
  const k = path[path.length - 1];
  if (owner instanceof LPropList) owner.setaProp(sym(k), value as never);
  else if (owner && typeof owner === 'object') (owner as Record<string, unknown>)[k] = value;
}

/** A value the code knows is a property list or list (for typed access). */
export const asPropList = (v: unknown): LPropList => (v instanceof LPropList ? v : new LPropList());
export const asList = (v: unknown): LList => (v instanceof LList ? v : new LList());

/** getStreamStatus(id) as the property list Lingo returns. */
export function getStreamStatus(id?: number): LPropList {
  const s = streamStatus(id);
  return propList(sym('URL'), s.URL, sym('state'), s.state, sym('bytesSoFar'), s.bytesSoFar, sym('bytesTotal'), s.bytesTotal, sym('error'), s.error);
}

/** postNetText(url, propList) */
export function postNetText(url: string, list: LPropList | string): number {
  return typeof list === 'string' ? netPost(url, []) : netPost(url, formPairs(list));
}

/**
 * Call a movie-script handler of whichever cast defines it (the shared cast's
 * helpers from a movie's own scripts, without importing across casts).
 */
export function callGlobal(name: string, ...args: unknown[]): any {
  const h = player.movieHandler(name);
  if (!h) {
    warnOnce(`movie handler ${name} has no translation`);
    return undefined;
  }
  return h(...args);
}
