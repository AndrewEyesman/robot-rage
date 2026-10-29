// The player: runs a movie's score at its tempo, sends the frame events to the
// behaviors on the stage in Director's order, routes the mouse and keyboard, and
// switches movies. The translated scripts drive everything else.
//
// Frame cycle (Director 8+): endSprite for spans that ended, beginSprite for new
// ones (sprites, then the frame script), stepFrame (actorList), prepareFrame,
// startMovie on the first frame, the stage is drawn, enterFrame, exitFrame, then
// the playhead moves to the next frame or where go() sent it.

import { DColor } from './color';
import { findHandler, invoke, setScriptProp } from './dispatch';
import type { MovieDoc } from './docs';
import { keyByName, keyChar, macKeyCode, codeForChar, keyForChar } from './keys';
import { CastLib, FieldMember, Member, TextMember, TextualMember, resolvePalettes } from './members';
import { Movie, type Span } from './movie';
import { castScripts, type ScriptClass } from './registry';
import { drawSprite, hitTest, type FocusState } from './render';
import { Sprite } from './sprite';
import { charPosToLoc, locToCharPos } from './text-layout';
import { parseParams } from './glue';
import { stopAllSounds } from './audio';
import { scriptError } from './errors';
import { TouchTextInput } from './touch-text';

export const STAGE_W = 800;
export const STAGE_H = 600;
export const CHANNELS = 1000;

export interface Timeout {
  name: string;
  period: number;
  handler: string;
  target: object | undefined;
  persistent: boolean;
  next: number;
  forget(): void;
}

/** A hook for sprites the 2D renderer doesn't draw (3D members). */
export interface SpriteRenderer {
  /** Draw (or position) the sprite; called every display frame. */
  draw(s: Sprite, player: Player): void;
  /** The sprite left the stage. */
  remove?(s: Sprite, player: Player): void;
  /** After each stage draw (3D sprites not drawn this time hide their canvas). */
  endFrame?(player: Player): void;
}

export class Player {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  readonly assets: string;
  movie: Movie | null = null;
  readonly sprites: Sprite[] = [];
  frameScript: object | null = null;
  private frameScriptSpan: string | null = null;
  frame = 1;
  private nextFrame: number | null = null;
  private pendingMovie: { name: string; frame: number | string } | null = null;
  private movieStarting = false;
  /** Lingo globals, case-insensitive (gUserData and gUserdata are one global). */
  readonly globals: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get: (t, p) => (typeof p === 'string' ? t[p.toLowerCase()] : undefined),
    set: (t, p, v) => {
      if (typeof p === 'string') t[p.toLowerCase()] = v;
      return true;
    },
    has: (t, p) => typeof p === 'string' && p.toLowerCase() in t,
    deleteProperty: (t, p) => (typeof p === 'string' ? delete t[p.toLowerCase()] : true),
  });
  actorList: object[] = [];
  readonly timeouts = new Map<string, Timeout>();
  private readonly docs = new Map<string, Promise<MovieDoc>>();
  private readonly externalCasts = new Map<string, Promise<CastLib>>();
  readonly renderers = new Map<string, SpriteRenderer>();
  private nextFrameAt = 0;
  private tempoOverride = 0;
  readonly startTime = performance.now();
  // Layout: the stage's top-left on the page and its scale.
  left = 0;
  top = 0;
  scale = 1;
  /** Replaces the default fit-to-window layout (the arena's widescreen mode). */
  layoutHook: ((p: Player) => void) | null = null;
  /** Draws behind the sprites, in stage coordinates without the stage clip (the arena's widescreen panel). */
  renderHook: ((ctx: CanvasRenderingContext2D, p: Player) => void) | null = null;
  /** Stops the frame cycles (tools step the scripts themselves); drawing and input go on. */
  paused = false;
  // Input state.
  mouseH = 0;
  mouseV = 0;
  mouseIsDown = false;
  clickOn = 0;
  private mouseDownSprite = 0;
  private rolloverSprite = 0;
  lastClickTime = 0;
  doubleClick = false;
  key = '';
  keyCode = 0;
  readonly keysDown = new Set<number>();
  readonly charsDown = new Set<string>();
  shiftDown = false;
  controlDown = false;
  optionDown = false;
  commandDown = false;
  focus: FocusState | null = null;
  /** The hidden input a phone's keyboard types into, made on the first touch on a field. */
  private touchText: TouchTextInput | null = null;
  /** cursor(n) */
  globalCursor: unknown = 0;
  currentSpriteNum = 0;
  /** Called after every frame cycle (tests, tools). */
  onFrame: ((p: Player) => void) | null = null;
  stageColor = new DColor(0, 0, 0);
  private errors = 0;

  constructor(el: HTMLDivElement, assets: string) {
    this.el = el;
    this.assets = assets;
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', outline: 'none' });
    el.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    for (let i = 0; i <= CHANNELS; i++) this.sprites.push(new Sprite(i));
    Sprite.resolveMember = (m) => this.member(m) ?? null;
    TextualMember.selectionOf = (m) =>
      this.focus && this.sprites[this.focus.sprite].memberRef === m ? [this.focus.selStart, this.focus.selEnd] : [0, 0];
    // Text set by a script while its field has the focus: the selection stays where it
    // was, cut to the new text's end. The login's password field deletes a star this way
    // without moving the caret, which left it past the end, so the next Backspace
    // deleted nothing (#64).
    TextualMember.textSet = (m) => {
      const f = this.focus;
      if (!f || this.sprites[f.sprite].memberRef !== m) return;
      const n = m.text.length;
      f.selStart = Math.min(f.selStart, n);
      f.selEnd = Math.min(f.selEnd, n);
    };
    addEventListener('resize', () => this.layout());
    this.bindInput();
    this.layout();
  }

  // ---------------------------------------------------------------- assets

  doc(name: string): Promise<MovieDoc> {
    const key = name.toLowerCase();
    let d = this.docs.get(key);
    if (!d) {
      // Revalidated, not taken from the cache: a copy cached before a re-extract lacks
      // the new member properties (the sounds' Loop flags, docs/port-issues.md #87).
      d = fetch(`${this.assets}/${key}/index.json`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`no assets for ${name}`);
        return r.json();
      });
      this.docs.set(key, d);
    }
    return d;
  }

  /** External casts are loaded once and shared by the movies that link them. */
  private externalCast(name: string): Promise<CastLib> {
    const key = name.toLowerCase();
    let c = this.externalCasts.get(key);
    if (!c) {
      c = this.doc(key).then(async (doc) => {
        const cast = new CastLib(0, key, `${this.assets}/${key}`, doc);
        await cast.loadBitmaps();
        return cast;
      });
      this.externalCasts.set(key, c);
    }
    return c;
  }

  async loadMovie(name: string): Promise<Movie> {
    const key = name.toLowerCase().replace(/\.(dcr|dir|dxr)$/, '');
    const doc = await this.doc(key);
    const libs: CastLib[] = [];
    for (const [i, entry] of doc.castLibs.entries()) {
      if (i === 0) {
        const internal = new CastLib(1, entry.name, `${this.assets}/${key}`, doc);
        await internal.loadBitmaps();
        libs.push(internal);
      } else {
        const ext = await this.externalCast(entry.name);
        ext.number = i + 1;
        libs.push(ext);
      }
    }
    resolvePalettes(libs);
    return new Movie(key, doc, libs);
  }

  /** Every cast's name for the registry: the movie name for the internal cast. */
  private castKey(lib: CastLib): string {
    return lib.number === 1 && this.movie ? this.movie.name : lib.name;
  }

  scriptClass(lib: number, num: number): ScriptClass | undefined {
    const cast = this.movie?.castLibs[lib - 1];
    if (!cast) return undefined;
    return castScripts(this.castKey(cast))?.scripts?.[num];
  }

  /** script("name"): a script member's class, searching every cast. */
  script(name: string): ScriptClass | undefined {
    for (const cast of this.movie?.castLibs ?? []) {
      const reg = castScripts(this.castKey(cast));
      const byName = Object.entries(reg?.names ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase());
      if (byName) return byName[1];
      const m = cast.find(name);
      if (m && reg?.scripts?.[m.number]) return reg.scripts[m.number];
    }
    return undefined;
  }

  /** A movie-script handler (global function) in any of the movie's casts. */
  movieHandler(name: string): ((...args: unknown[]) => unknown) | undefined {
    for (const cast of this.movie?.castLibs ?? []) {
      const h = castScripts(this.castKey(cast))?.handlers;
      if (!h) continue;
      const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
      if (k) return h[k] as (...args: unknown[]) => unknown;
    }
    return undefined;
  }

  // ---------------------------------------------------------------- members

  member(nameOrNum: string | number, castLib?: string | number): Member | undefined {
    const libs = this.movie?.castLibs ?? [];
    const pick = castLib === undefined ? libs : libs.filter((c) => (typeof castLib === 'number' ? c.number === castLib : c.name.toLowerCase() === String(castLib).toLowerCase()));
    if (typeof nameOrNum === 'number') {
      // A slot number (castLib << 16 | member) or a member of the first cast.
      if (nameOrNum > 0xffff) return libs[(nameOrNum >> 16) - 1]?.get(nameOrNum & 0xffff);
      return (pick[0] ?? libs[0])?.get(nameOrNum);
    }
    for (const c of pick) {
      const m = c.find(nameOrNum);
      if (m) return m;
    }
    return undefined;
  }

  castLib(nameOrNum: string | number): CastLib | undefined {
    const libs = this.movie?.castLibs ?? [];
    return typeof nameOrNum === 'number' ? libs[nameOrNum - 1] : libs.find((c) => c.name.toLowerCase() === nameOrNum.toLowerCase());
  }

  // ---------------------------------------------------------------- playback

  /** Start the player on a movie (and keep running). */
  async start(movie: string, frame: number | string = 1) {
    this.pendingMovie = { name: movie, frame };
    await this.switchMovie();
    this.nextFrameAt = performance.now();
    requestAnimationFrame((t) => this.tick(t));
    this.playWhileHidden();
  }

  /**
   * The Shockwave plugin kept playing whatever the browser did with the page; the browser
   * stops requestAnimationFrame in a hidden tab, slows it for a window behind others, and
   * throttles timers to once a second. When the display hasn't called for a frame in two
   * frame periods, a worker's timer (not throttled) runs the frame cycles, without
   * drawing, so the movie keeps its tempo (a match keeps talking to the opponent).
   */
  private playWhileHidden() {
    if (typeof Worker === 'undefined' || typeof document === 'undefined') return;
    const src = 'setInterval(()=>postMessage(0),10)';
    let worker: Worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    } catch {
      return;
    }
    worker.onmessage = () => {
      const now = performance.now();
      if (document.hidden || now - this.lastDisplayTick > 2 * (1000 / Math.max(1, this.tempo)) + 20) this.cycle(now, false);
    };
  }

  /** When requestAnimationFrame last ran (the worker's timer stands in when it falls behind). */
  private lastDisplayTick = 0;

  sprite(n: number): Sprite {
    return this.sprites[n] ?? this.sprites[0];
  }

  get milliSeconds() {
    return Math.floor(performance.now() - this.startTime);
  }

  /** go(frame) / go(label): where the playhead goes after this frame's events. */
  go(target: number | string) {
    if (!this.movie) return;
    const f = typeof target === 'number' ? target : this.movie.labelFrame(target);
    if (f > 0) this.nextFrame = Math.max(1, Math.min(this.movie.frameCount, f));
  }

  /** go(frame, movie) / gotoNetMovie: switch movies at the end of this frame. */
  goMovie(name: string, frame: number | string = 1) {
    this.pendingMovie = { name: name.replace(/\.(dcr|dir|dxr)$/i, ''), frame };
  }

  /** The frame `the frame` reports: where go() has sent the playhead, else the current frame. */
  get playhead() {
    return this.nextFrame ?? this.frame;
  }

  get frameLabel() {
    return this.movie?.labelAt(this.frame) ?? '';
  }

  /** puppetTempo / the frameTempo. */
  set tempo(fps: number) {
    this.tempoOverride = fps;
  }
  get tempo() {
    return this.tempoOverride || (this.movie?.tempoAt(this.frame) ?? 30);
  }

  /** Frame cycles run so far (3D drawing tells logic ticks apart with it). */
  frameCycles = 0;
  private lastTickTime = 0;

  /** How far the display is between the last frame cycle and the next (0-1), for drawing between ticks. */
  get frameProgress(): number {
    const period = 1000 / Math.max(1, this.tempo);
    return Math.max(0, Math.min(1, 1 - (this.nextFrameAt - this.lastTickTime) / period));
  }

  private tick(t: number) {
    this.lastDisplayTick = performance.now();
    this.cycle(t, true);
    requestAnimationFrame((tt) => this.tick(tt));
  }

  /** Run the frame cycles due by time t, the timeouts, and draw. */
  private cycle(t: number, draw: boolean) {
    try {
      const period = 1000 / Math.max(1, this.tempo);
      if (this.paused) this.nextFrameAt = t + period;
      // One frame cycle per draw at most. Director plays every frame: one that runs late
      // (a long script, a 3D world being built) makes the movie slower for a moment
      // rather than being caught up with frames run back to back, which showed as jumps
      // in the screens' slide-ins. Within a millisecond counts as due (display refreshes
      // land on a 60 fps tempo's frames).
      if (t >= this.nextFrameAt - 1) {
        this.stepFrame();
        this.frameCycles++;
        this.nextFrameAt += period;
        // A whole frame or more behind: the next one is a period from now.
        if (t >= this.nextFrameAt) this.nextFrameAt = t + period;
      }
      this.lastTickTime = t;
      for (const hook of cycleHooks) hook(t);
      this.runTimeouts();
      if (draw) this.render();
    } catch (e) {
      // Director's alertHook: log the script error and keep playing.
      if (this.errors++ < 50) console.error(e);
      scriptError('frame', e);
    }
  }

  private runTimeouts() {
    const now = this.milliSeconds;
    for (const to of [...this.timeouts.values()]) {
      if (now < to.next) continue;
      to.next = now + Math.max(1, to.period);
      const target = to.target;
      if (target) invoke(target, to.handler, [to]);
      else this.movieHandler(to.handler)?.(to);
    }
  }

  /** One frame cycle; the movie switch happens at frame boundaries. */
  stepFrame() {
    if (this.pendingMovie) {
      // Loading is async; the switch finishes on a later tick.
      void this.switchMovie();
      return;
    }
    const movie = this.movie;
    if (!movie) return;
    this.syncScore();
    if (this.pendingMovie) return;
    this.dispatchFrameEvent('stepFrame', true);
    this.dispatchFrameEvent('prepareFrame');
    if (this.movieStarting) {
      this.movieStarting = false;
      this.callMovie('startMovie');
    }
    this.dispatchFrameEvent('enterFrame');
    this.dispatchFrameEvent('exitFrame');
    this.updateRollover();
    this.onFrame?.(this);
    if (this.pendingMovie) return;
    const next = this.nextFrame ?? (this.frame >= movie.frameCount ? 1 : this.frame + 1);
    this.nextFrame = null;
    this.frame = next;
  }

  private switching = false;
  private async switchMovie() {
    if (this.switching || !this.pendingMovie) return;
    this.switching = true;
    const target = this.pendingMovie;
    try {
      const next = await this.loadMovie(target.name);
      if (this.movie) {
        this.callMovie('stopMovie');
        this.endAll();
      }
      for (const [k, t] of this.timeouts) if (!t.persistent) this.timeouts.delete(k);
      stopAllSounds();
      this.pendingMovie = null;
      this.movie = next;
      this.stageColor = new DColor(...next.doc.stageColor);
      this.tempoOverride = 0;
      this.focus = null;
      this.frame = typeof target.frame === 'number' ? target.frame : next.labelFrame(target.frame) || 1;
      this.nextFrame = null;
      this.movieStarting = true;
      // A layout hook may depend on the movie (the arena's widescreen view).
      if (this.layoutHook) this.layout();
      this.callMovie('prepareMovie');
    } finally {
      this.switching = false;
    }
  }

  /** stopMovie: every behavior and the frame script get endSprite, puppets are released. */
  private endAll() {
    for (const s of this.sprites) {
      if (s.spriteNum === 0) continue;
      if (s.span !== null || s.scriptInstanceList.length) this.sendToInstances(s.spriteNum, s.scriptInstanceList, 'endSprite', []);
      this.renderers.forEach((r) => r.remove?.(s, this));
      s.clear();
      s.puppet = false;
      s.visible = true;
    }
    if (this.frameScript) invoke(this.frameScript, 'endSprite', []);
    this.frameScript = null;
    this.frameScriptSpan = null;
  }

  /** Bring the channels in line with the score for the current frame. */
  private syncScore() {
    const movie = this.movie!;
    const f = this.frame;
    const ended: { s: Sprite; list: object[] }[] = [];
    const begun: { s: Sprite; span: Span }[] = [];
    const channels = new Set<number>([...movie.channelsAt(f), ...movie.spanChannelsAt(f)]);
    // Channels the score no longer covers, including released puppets, get emptied.
    for (const s of this.sprites) if (s.span !== null || (!s.puppet && (s.member || s.scriptInstanceList.length))) channels.add(s.spriteNum);
    for (const ch of [...channels].sort((a, b) => a - b)) {
      if (ch <= 0 || ch > CHANNELS) continue;
      const s = this.sprites[ch];
      if (s.puppet) continue;
      const span = movie.spanAt(f, ch);
      const doc = movie.spriteAt(f, ch);
      const key = span ? span.key : doc ? (movie.runAt(f, ch)?.key ?? `score-${f}`) : null;
      const released = s.released;
      s.released = false;
      if (s.span === key && key !== null && !released) {
        this.applyScoreDelta(s, f);
        continue;
      }
      if (s.span !== null) {
        ended.push({ s, list: s.scriptInstanceList });
        this.renderers.forEach((r) => r.remove?.(s, this));
      }
      if (key === null) {
        if (s.span === null && (s.member || s.scriptInstanceList.length)) ended.push({ s, list: s.scriptInstanceList });
        s.clear();
        continue;
      }
      // A sprite's locZ outlives its span (Adobe's player: the garage's zoom knob,
      // raised to 121 by a behavior on the door frame, stays above the rod in the
      // Workshop, whose own behavior raises the rod to 118).
      const z = s.locZ;
      s.clear();
      s.locZ = z;
      s.span = key;
      if (doc) this.applyScore(s, doc);
      if (span) begun.push({ s, span });
    }
    for (const e of ended) this.sendToInstances(e.s.spriteNum, e.list, 'endSprite', []);
    // The keyboard focus goes with its sprite: a new sprite in that channel (the robot
    // list's SCRAP ROBOT label where the password field was) doesn't inherit it.
    if (this.focus && (ended.some((e) => e.s.spriteNum === this.focus!.sprite) || !this.isEditable(this.sprites[this.focus.sprite]))) this.focus = null;
    // The frame script.
    const fs = movie.spanAt(f, 0);
    const fsKey = fs ? `${fs.start}-${fs.end}` : null;
    const fsChanged = fsKey !== this.frameScriptSpan;
    if (fsChanged && this.frameScript) invoke(this.frameScript, 'endSprite', []);
    // New behaviors exist from beginSprite on, after every endSprite: the Workshop's
    // frame script empties channels 100-500 when it ends, which must not take the
    // behaviors of the Buy room's sprites in those channels.
    for (const b of begun) b.s.scriptInstanceList = this.instantiate(b.span, b.s.spriteNum);
    let fsBegun = false;
    if (fsChanged) {
      this.frameScript = fs ? (this.instantiate(fs, 0)[0] ?? null) : null;
      this.frameScriptSpan = fsKey;
      fsBegun = !!this.frameScript;
    }
    for (const { s } of begun) this.sendToInstances(s.spriteNum, s.scriptInstanceList, 'beginSprite', []);
    if (fsBegun && this.frameScript) {
      const prev = this.currentSpriteNum;
      this.currentSpriteNum = 0;
      try {
        invoke(this.frameScript, 'beginSprite', []);
      } finally {
        this.currentSpriteNum = prev;
      }
    }
  }

  /** New behavior instances for a span, with their score parameters. */
  private instantiate(span: Span, ch: number): object[] {
    const out: object[] = [];
    for (const sc of span.scripts) {
      const cls = this.scriptClass(sc.lib, sc.num);
      if (!cls) {
        warnOnce(`no translation for script ${sc.lib}/${sc.num} (${this.movie?.castLibs[sc.lib - 1]?.get(sc.num)?.name ?? '?'}) in ${this.movie?.name}`);
        continue;
      }
      const prev = this.currentSpriteNum;
      this.currentSpriteNum = ch;
      let inst: object;
      try {
        inst = new cls();
      } finally {
        this.currentSpriteNum = prev;
      }
      (inst as { spriteNum?: number }).spriteNum = ch;
      if (sc.params) for (const [k, v] of parseParams(sc.params)) if (!setScriptProp(inst, k, v)) (inst as Record<string, unknown>)[k] = v;
      out.push(inst);
    }
    return out;
  }

  private applyScore(s: Sprite, d: import('./docs').SpriteDoc) {
    s.member = this.memberRef(d.member[0], d.member[1]) ?? null;
    // A text member's box isn't in its data; the score's sprite size is it.
    if (s.memberRef instanceof TextMember && !s.memberRef.boxWidth && d.size[0] > 0) {
      s.memberRef.boxWidth = d.size[0];
      s.memberRef.boxHeight = d.size[1];
    }
    s.locH = d.loc[0];
    s.locV = d.loc[1];
    s.setScoreSize(d.size[0], d.size[1], d.stretch);
    s.ink = d.ink;
    s.blend = d.blendPct ?? 100;
    s.rotation = d.rotation;
    s.skew = d.skew;
    s.flipH = d.flipH;
    s.flipV = d.flipV;
    s.editable = d.editable;
    s.moveable = d.moveable;
    s.foreColor = d.colorFlag & 1 ? new DColor(d.fore[0], d.fore[1], d.fore[2]) : DColor.index(d.fore[0]);
    s.backColor = d.colorFlag & 2 ? new DColor(d.back[0], d.back[1], d.back[2]) : DColor.index(d.back[0]);
    s.userData.scoreDoc = d;
  }

  /** Within a span, follow the score's changes to properties no script has changed. */
  private applyScoreDelta(s: Sprite, f: number) {
    const d = this.movie!.spriteAt(f, s.spriteNum);
    const prev = s.userData.scoreDoc as import('./docs').SpriteDoc | undefined;
    if (!d || !prev || d === prev) return;
    const member = this.memberRef(d.member[0], d.member[1]) ?? null;
    if (prev.member[0] !== d.member[0] || prev.member[1] !== d.member[1]) {
      if (s.member === this.memberRef(prev.member[0], prev.member[1])) s.member = member;
    }
    if (s.locH === prev.loc[0]) s.locH = d.loc[0];
    if (s.locV === prev.loc[1]) s.locV = d.loc[1];
    if (s.blend === (prev.blendPct ?? 100)) s.blend = d.blendPct ?? 100;
    if (s.ink === prev.ink) s.ink = d.ink;
    if (s.rotation === prev.rotation) s.rotation = d.rotation;
    if (s.width === prev.size[0] && s.height === prev.size[1]) s.setScoreSize(d.size[0], d.size[1], d.stretch || s.stretch);
    s.userData.scoreDoc = d;
  }

  private memberRef(lib: number, num: number): Member | undefined {
    if (!num) return undefined;
    return this.movie?.castLibs[lib - 1]?.get(num);
  }

  // ---------------------------------------------------------------- messages

  /** Send an event to a list of instances as if they were sprite `ch`'s behaviors. */
  sendToInstances(ch: number, list: object[], name: string, args: unknown[]): { found: boolean; handled: boolean; result: unknown } {
    const prev = this.currentSpriteNum;
    this.currentSpriteNum = ch;
    let found = false;
    let handled = false;
    let result: unknown;
    try {
      for (const inst of [...list]) {
        const r = invoke(inst, name, args);
        if (r.found) {
          found = true;
          result = r.result;
          if (r.handled) handled = true;
          if (r.stopped) break;
        }
      }
    } finally {
      this.currentSpriteNum = prev;
    }
    return { found, handled, result };
  }

  private sendFrameScript(name: string, args: unknown[]) {
    if (!this.frameScript) return { found: false, handled: false, stopped: false, result: undefined as unknown };
    const prev = this.currentSpriteNum;
    this.currentSpriteNum = 0;
    try {
      return invoke(this.frameScript, name, args);
    } finally {
      this.currentSpriteNum = prev;
    }
  }

  /** A movie event (prepareMovie, startMovie, stopMovie...) to the movie scripts. */
  callMovie(name: string, ...args: unknown[]): unknown {
    return this.movieHandler(name)?.(...args);
  }

  /** prepareFrame / enterFrame / exitFrame: each sprite in channel order, then the frame script, then movie scripts. */
  private dispatchFrameEvent(name: string, actors = false) {
    if (actors) {
      for (const a of [...this.actorList]) invoke(a, name, []);
      return;
    }
    const startFrame = this.frame;
    for (const s of this.sprites) {
      if (s.spriteNum === 0 || !s.scriptInstanceList.length) continue;
      this.sendToInstances(s.spriteNum, s.scriptInstanceList, name, []);
      // A go() to another frame stops the event reaching the rest of this frame's sprites.
      if (this.pendingMovie || (this.nextFrame !== null && this.nextFrame !== startFrame)) return;
    }
    const r = this.sendFrameScript(name, []);
    if (!r.found) this.movieHandler(name)?.();
  }

  /** sendSprite(n, #msg, args...) */
  sendSprite(n: number, name: string, ...args: unknown[]): unknown {
    if (n !== 0) {
      const s = this.sprites[n];
      if (s) {
        const r = this.sendToInstances(n, s.scriptInstanceList, name, args);
        if (r.found) return r.result;
      }
    }
    const r = this.sendFrameScript(name, args);
    if (r.found) return r.result;
    return this.movieHandler(name)?.(...args);
  }

  /** sendAllSprites(#msg, args...) */
  sendAllSprites(name: string, ...args: unknown[]): unknown {
    let found = false;
    let result: unknown;
    for (const s of this.sprites) {
      if (s.spriteNum === 0 || !s.scriptInstanceList.length) continue;
      const r = this.sendToInstances(s.spriteNum, s.scriptInstanceList, name, args);
      if (r.found) {
        found = true;
        result = r.result;
      }
    }
    if (found) return result;
    const r = this.sendFrameScript(name, args);
    if (r.found) return r.result;
    return this.movieHandler(name)?.(...args);
  }

  /** A user event through the hierarchy: sprite behaviors, frame script, movie scripts. */
  private dispatchUserEvent(ch: number, name: string, args: unknown[] = []): boolean {
    if (ch > 0) {
      const s = this.sprites[ch];
      const r = this.sendToInstances(ch, s.scriptInstanceList, name, args);
      if (r.handled) return true;
    }
    const f = this.sendFrameScript(name, args);
    if (f.handled) return true;
    const h = this.movieHandler(name);
    if (h) {
      h(...args);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- timeouts

  newTimeout(name: string, period: number, handler: string, target?: object): Timeout {
    const t: Timeout = {
      name,
      period,
      handler,
      target,
      persistent: false,
      next: this.milliSeconds + period,
      forget: () => void this.timeouts.delete(name),
    };
    this.timeouts.set(name, t);
    return t;
  }

  // ---------------------------------------------------------------- drawing

  layout() {
    if (this.layoutHook) return this.layoutHook(this);
    const W = innerWidth;
    const H = innerHeight;
    this.scale = Math.min(W / STAGE_W, H / STAGE_H);
    this.left = Math.round((W - STAGE_W * this.scale) / 2);
    this.top = Math.round((H - STAGE_H * this.scale) / 2);
    this.sizeCanvas(W, H);
  }

  /** Size the 2D canvas to the window at the display's resolution. */
  sizeCanvas(W: number, H: number) {
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    Object.assign(this.canvas.style, { width: `${W}px`, height: `${H}px` });
  }

  /** Stage rect (stage pixels) to page CSS pixels. */
  toPage(x: number, y: number) {
    return { x: this.left + x * this.scale, y: this.top + y * this.scale };
  }

  render() {
    const ctx = this.ctx;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.left, dpr * this.top);
    if (this.renderHook) {
      ctx.save();
      this.renderHook(ctx, this);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, STAGE_W, STAGE_H);
    ctx.clip();
    ctx.fillStyle = this.stageColor.css;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.imageSmoothingEnabled = true;
    if (this.focus) this.focus.caretOn = Math.floor(performance.now() / 530) % 2 === 0;
    this.touchText?.frame();
    for (const s of this.drawOrder()) {
      const r = s.member!.type === 'shockwave3d' ? this.renderers.get('shockwave3d') : undefined;
      if (r) r.draw(s, this);
      else drawSprite(ctx, s, this.focus);
    }
    ctx.restore();
    this.renderers.forEach((r) => r.endFrame?.(this));
  }

  /**
   * The sprites in the order they're drawn, back to front (also read by port/tools/regress.mjs).
   * A member a script gave a channel with no score sprite that isn't a puppet isn't drawn:
   * the score empties the channel at the next frame, before Director draws the stage, but
   * the port also draws between frames (the lobby's room buttons give sprites 45-52 their
   * plain image, and 45 is empty: it showed in the stage's corner on a fast display).
   */
  drawOrder(): Sprite[] {
    return this.sprites.filter((s) => s.spriteNum > 0 && s.member && s.visible && (s.puppet || s.span !== null)).sort((a, b) => a.locZ - b.locZ || a.spriteNum - b.spriteNum);
  }

  // ---------------------------------------------------------------- input

  /** The front-most sprite under a stage point that has scripts or is an editable field. */
  spriteAt(x: number, y: number, scriptedOnly = true): number {
    let best = 0;
    let bestZ = -Infinity;
    for (const s of this.sprites) {
      if (s.spriteNum === 0 || !s.member || !s.visible) continue;
      if (scriptedOnly && !s.scriptInstanceList.length && !this.isEditable(s)) continue;
      // Adobe's player hit-tests score sprites in channel order even when a script
      // changed their locZ (the garage's tab headers are raised to channel + 100 over
      // the tab buttons, which still take the clicks); puppets go by their locZ.
      // 3D sprites are drawn to the stage over everything and take clicks first (the
      // garage's robot preview is dragged through the opaque frame bitmap above it).
      const z = (s.member.type === 'shockwave3d' ? 1e6 : 0) + (s.puppet ? s.locZ : s.spriteNum);
      if (z < bestZ || (z === bestZ && s.spriteNum < best)) continue;
      if (hitTest(s, x, y)) {
        best = s.spriteNum;
        bestZ = z;
      }
    }
    return best;
  }

  isEditable(s: Sprite) {
    return !!s.member && s.member instanceof TextualMember && (s.editable || s.member.editable);
  }

  private stagePoint(e: MouseEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.left) / this.scale, y: (e.clientY - r.top - this.top) / this.scale };
  }

  private bindInput() {
    const el = this.el;
    el.addEventListener('pointermove', (e) => {
      const p = this.stagePoint(e);
      this.mouseH = Math.round(p.x);
      this.mouseV = Math.round(p.y);
      this.updateRollover();
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      const focusBefore = this.focus?.sprite;
      // Not while the keyboard is open: taking the focus from the input would close it.
      if (!(touch && this.touchText?.active)) this.canvas.focus();
      const p = this.stagePoint(e);
      this.mouseH = Math.round(p.x);
      this.mouseV = Math.round(p.y);
      this.mouseIsDown = true;
      const now = performance.now();
      this.doubleClick = now - this.lastClickTime < 400;
      this.lastClickTime = now;
      // A touch (or pen) has no pointermove before it lands: the rollover moves to the
      // touched sprite first, so its mouseEnter (a button's highlight, a part's info)
      // comes before its mouseDown, as a mouse's would.
      if (touch) this.updateRollover();
      const ch = this.spriteAt(p.x, p.y);
      this.clickOn = ch;
      this.mouseDownSprite = ch;
      const s = this.sprites[ch];
      if (ch && this.isEditable(s)) this.focusField(ch, p.x, p.y);
      this.dispatchUserEvent(ch, 'mouseDown');
      if (touch) this.touchTap((!!ch && this.isEditable(s)) || this.focus?.sprite !== focusBefore);
      e.preventDefault();
    });
    addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.mouseIsDown) return;
      const p = this.stagePoint(e);
      this.mouseH = Math.round(p.x);
      this.mouseV = Math.round(p.y);
      this.mouseIsDown = false;
      const ch = this.mouseDownSprite;
      this.mouseDownSprite = 0;
      const focusBefore = this.focus?.sprite;
      if (ch && this.sprites[ch].member && hitTest(this.sprites[ch], p.x, p.y)) this.dispatchUserEvent(ch, 'mouseUp');
      else {
        // Released elsewhere: the pressed sprite gets mouseUpOutside and the sprite now
        // under the pointer gets the mouseUp (Adobe's player, checked with two puppets:
        // press on one, release on the other). The garage's category drop-down closes on
        // mouseDown, and the list entry the release lands on then opens its part.
        if (ch) this.sendToInstances(ch, this.sprites[ch].scriptInstanceList, 'mouseUpOutSide', []);
        this.dispatchUserEvent(this.spriteAt(p.x, p.y), 'mouseUp');
      }
      // A field the release's scripts gave the focus (the arena's CHAT button) takes the keyboard.
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && this.focus?.sprite !== focusBefore) this.touchTap(true);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.mouseIsDown || !this.focus) return;
      const s = this.sprites[this.focus.sprite];
      if (this.mouseDownSprite !== this.focus.sprite || !(s.member instanceof TextualMember)) return;
      const p = this.stagePoint(e);
      const pos = this.charAt(s, p.x, p.y);
      this.focus.selEnd = Math.max(pos, this.focus.selStart);
    });
    addEventListener('keydown', (e) => this.keyDown(e));
    addEventListener('keyup', (e) => this.keyUp(e));
    addEventListener('blur', () => {
      this.keysDown.clear();
      this.charsDown.clear();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateRollover() {
    const ch = this.spriteAt(this.mouseH, this.mouseV);
    if (ch !== this.rolloverSprite) {
      const old = this.rolloverSprite;
      this.rolloverSprite = ch;
      if (old && this.sprites[old].scriptInstanceList.length) this.sendToInstances(old, this.sprites[old].scriptInstanceList, 'mouseLeave', []);
      if (ch) this.sendToInstances(ch, this.sprites[ch].scriptInstanceList, 'mouseEnter', []);
    } else if (ch) {
      this.sendToInstances(ch, this.sprites[ch].scriptInstanceList, 'mouseWithin', []);
    }
    const s = this.sprites[this.spriteAt(this.mouseH, this.mouseV, false)];
    const own = ch ? this.sprites[ch].cursor : s?.cursor;
    this.el.style.cursor = cursorCss(own && own !== 0 ? own : this.globalCursor, this.isEditable(this.sprites[ch]));
  }

  /**
   * A touch (or pen) tap: the on-screen keyboard opens when it put the focus on a field
   * and closes when it didn't (touch-text.ts). The mouse never comes here.
   */
  private touchTap(onField: boolean) {
    if (onField && this.focus) (this.touchText ??= new TouchTextInput(this)).tap(true);
    else this.touchText?.tap(false);
  }

  /** A key typed without a key event (a phone's on-screen keyboard), through keyDown and keyUp as a physical key. */
  typeKey(key: string, code?: string, shift = false) {
    const k = code === undefined ? keyForChar(key) : { code, shift };
    this.keyDown(new KeyboardEvent('keydown', { key, code: k.code, shiftKey: k.shift }));
    this.keyUp(new KeyboardEvent('keyup', { key, code: k.code }));
  }

  /** The sprite under the mouse (the rollover). */
  get rollover() {
    return this.spriteAt(this.mouseH, this.mouseV, false);
  }

  private keyDown(e: KeyboardEvent) {
    if (this.touchText && e.target === this.touchText.el) {
      // From the touch keyboard's input: a key without a key (its text comes as input), or
      // a real one that mustn't also reach the input.
      if (TouchTextInput.textOnly(e)) return;
      e.preventDefault();
    }
    if (e.ctrlKey && ['KeyR', 'KeyI', 'KeyJ'].includes(e.code) && e.shiftKey) return; // devtools
    const code = macKeyCode(e);
    const ch = keyChar(e);
    this.keyCode = code;
    if (ch) this.key = ch;
    this.keysDown.add(code);
    if (ch) this.charsDown.add(ch.toLowerCase());
    this.shiftDown = e.shiftKey;
    this.controlDown = e.ctrlKey;
    this.optionDown = e.altKey;
    this.commandDown = e.metaKey || e.ctrlKey;
    if (e.ctrlKey && (e.code === 'KeyV' || e.code === 'KeyC' || e.code === 'KeyX' || e.code === 'KeyA') && this.focus) {
      this.clipboard(e.code);
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab' || e.key === 'Backspace' || e.key === ' ' || e.key.startsWith('Arrow') || e.key === "'" || e.key === '/') e.preventDefault();
    if (!ch && !code) return;
    const focusCh = this.focus?.sprite ?? 0;
    let handled = false;
    if (focusCh) handled = this.sendToInstances(focusCh, this.sprites[focusCh].scriptInstanceList, 'keyDown', []).handled;
    if (!handled) {
      const f = this.sendFrameScript('keyDown', []);
      handled = f.handled;
      if (!f.found) {
        const h = this.movieHandler('keyDown');
        if (h) {
          h();
          handled = true;
        }
      }
    }
    if (!handled && focusCh) this.editField(e);
  }

  private keyUp(e: KeyboardEvent) {
    if (this.touchText && e.target === this.touchText.el && TouchTextInput.textOnly(e)) return;
    const code = macKeyCode(e);
    this.keysDown.delete(code);
    const ch = keyChar(e);
    if (ch) this.charsDown.delete(ch.toLowerCase());
    if (e.key.length === 1) this.charsDown.delete(e.key.toLowerCase());
    this.shiftDown = e.shiftKey;
    this.controlDown = e.ctrlKey;
    this.optionDown = e.altKey;
    const focusCh = this.focus?.sprite ?? 0;
    let handled = false;
    if (focusCh) handled = this.sendToInstances(focusCh, this.sprites[focusCh].scriptInstanceList, 'keyUp', []).handled;
    if (!handled) {
      const f = this.sendFrameScript('keyUp', []);
      if (!f.found) this.movieHandler('keyUp')?.();
    }
  }

  /**
   * A key pressed or released by something other than the keyboard (the touch
   * controls), named by its KeyboardEvent code ('ArrowUp', 'KeyZ', 'Digit1'). Its key
   * code and character go into keysDown and charsDown and out again as the keyboard's
   * own key would, and keyDown or keyUp goes to the focused field's behaviors, the frame
   * script or the movie scripts (a field isn't edited by it).
   */
  virtualKey(name: string, down: boolean) {
    const { code, char } = keyByName(name);
    if (down) {
      this.keyCode = code;
      if (char) this.key = char;
      this.keysDown.add(code);
      if (char) this.charsDown.add(char);
    } else {
      this.keysDown.delete(code);
      if (char) this.charsDown.delete(char);
    }
    const event = down ? 'keyDown' : 'keyUp';
    const focusCh = this.focus?.sprite ?? 0;
    if (focusCh && this.sendToInstances(focusCh, this.sprites[focusCh].scriptInstanceList, event, []).handled) return;
    const f = this.sendFrameScript(event, []);
    if (!f.found) this.movieHandler(event)?.();
  }

  /** keyPressed(keyCode) or keyPressed("a"). */
  keyPressed(k: number | string): boolean {
    if (typeof k === 'number') return this.keysDown.has(k);
    if (this.charsDown.has(k.toLowerCase())) return true;
    const code = codeForChar(k);
    return code !== undefined && this.keysDown.has(code);
  }

  // ---------------------------------------------------------------- fields

  get keyboardFocusSprite() {
    return this.focus?.sprite ?? -1;
  }
  set keyboardFocusSprite(n: number) {
    if (n <= 0) this.focus = null;
    else {
      const len = (this.sprites[n].member as TextualMember | null)?.text?.length ?? 0;
      this.focus = { sprite: n, selStart: len, selEnd: len, caretOn: true };
    }
  }

  private charAt(s: Sprite, x: number, y: number) {
    const m = s.member as TextualMember;
    const r = s.bounds;
    const inset = m instanceof FieldMember ? m.border + m.margin : 0;
    return locToCharPos(m.lines(), x - r.left - inset, y - r.top - inset + (m instanceof FieldMember ? m.scrollTop : 0));
  }

  private focusField(ch: number, x: number, y: number) {
    const pos = this.charAt(this.sprites[ch], x, y);
    this.focus = { sprite: ch, selStart: pos, selEnd: pos, caretOn: true };
  }

  get selStart() {
    return this.focus?.selStart ?? 0;
  }
  set selStart(v: number) {
    if (this.focus) {
      this.focus.selStart = v;
      if (this.focus.selEnd < v) this.focus.selEnd = v;
    }
  }
  get selEnd() {
    return this.focus?.selEnd ?? 0;
  }
  set selEnd(v: number) {
    if (this.focus) this.focus.selEnd = v;
  }

  /** The built-in editing of the focused field. */
  private editField(e: KeyboardEvent) {
    const f = this.focus!;
    const s = this.sprites[f.sprite];
    const m = s.member;
    if (!(m instanceof TextualMember)) return;
    const text = m.text;
    const a = Math.min(f.selStart, f.selEnd);
    const b = Math.max(f.selStart, f.selEnd);
    const put = (str: string) => {
      m.styled.splice(a, b, str);
      m.touch();
      f.selStart = f.selEnd = a + str.length;
    };
    switch (e.key) {
      case 'Backspace':
        if (b > a) put('');
        else if (a > 0) {
          m.styled.splice(a - 1, a, '');
          m.touch();
          f.selStart = f.selEnd = a - 1;
        }
        return;
      case 'Delete':
        if (b > a) put('');
        else if (a < text.length) {
          m.styled.splice(a, a + 1, '');
          m.touch();
        }
        return;
      case 'ArrowLeft':
        f.selStart = f.selEnd = b > a ? a : Math.max(0, a - 1);
        return;
      case 'ArrowRight':
        f.selStart = f.selEnd = b > a ? b : Math.min(text.length, b + 1);
        return;
      case 'Home':
        f.selStart = f.selEnd = 0;
        return;
      case 'End':
        f.selStart = f.selEnd = text.length;
        return;
      case 'ArrowUp':
      case 'ArrowDown': {
        const lines = m.lines();
        const p = charPosToLoc(lines, a);
        if (!p) return;
        const y = e.key === 'ArrowUp' ? p.y - 1 : p.y + p.line.height + 1;
        const pos = locToCharPos(lines, p.x, Math.max(0, y));
        f.selStart = f.selEnd = pos;
        return;
      }
      case 'Tab':
        this.tabToNextField(f.sprite, e.shiftKey);
        return;
      case 'Enter':
        put('\r');
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) put(e.key);
  }

  private tabToNextField(from: number, back: boolean) {
    const editable = this.sprites.filter((s) => s.spriteNum > 0 && this.isEditable(s)).map((s) => s.spriteNum);
    if (!editable.length) return;
    let i = editable.indexOf(from);
    i = back ? (i - 1 + editable.length) % editable.length : (i + 1) % editable.length;
    const ch = editable[i];
    const len = (this.sprites[ch].member as TextualMember).text.length;
    this.focus = { sprite: ch, selStart: 0, selEnd: len, caretOn: true };
  }

  private clipboard(code: string) {
    const f = this.focus!;
    const m = this.sprites[f.sprite].member as TextualMember;
    const a = Math.min(f.selStart, f.selEnd);
    const b = Math.max(f.selStart, f.selEnd);
    if (code === 'KeyA') {
      f.selStart = 0;
      f.selEnd = m.text.length;
    } else if (code === 'KeyC' || code === 'KeyX') {
      void navigator.clipboard?.writeText(m.text.slice(a, b));
      if (code === 'KeyX') {
        m.styled.splice(a, b, '');
        m.touch();
        f.selStart = f.selEnd = a;
      }
    } else {
      void navigator.clipboard?.readText().then((t) => {
        // Pasted text goes through keyDown like typed text, so the game's input filters apply.
        for (const ch of t.replace(/\r?\n/g, '\r')) {
          this.key = ch;
          const handled = this.sendToInstances(f.sprite, this.sprites[f.sprite].scriptInstanceList, 'keyDown', []).handled;
          if (!handled) {
            const fs = this.focus;
            if (!fs) return;
            const lo = Math.min(fs.selStart, fs.selEnd);
            const hi = Math.max(fs.selStart, fs.selEnd);
            m.styled.splice(lo, hi, ch);
            m.touch();
            fs.selStart = fs.selEnd = lo + 1;
          }
        }
      });
    }
  }

  /** Report a translated handler that hasn't been found (to keep the console useful). */
  missing(what: string) {
    warnOnce(what);
  }

  hasHandler(obj: object, name: string) {
    return !!findHandler(obj, name);
  }
}

/**
 * Not Director's: functions the player calls on every cycle, due frame or not, with
 * performance.now(). They run as long as the player does: in a hidden tab too (the
 * worker's timer), but not while the browser has frozen the page (multiuser.ts's
 * keepalive relies on that).
 */
export const cycleHooks = new Set<(now: number) => void>();

const warned = new Set<string>();
export function warnOnce(msg: string) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/** Director's cursor numbers as CSS cursors. */
function cursorCss(c: unknown, editable: boolean): string {
  switch (c) {
    case 280:
      return 'pointer';
    case 260:
      return 'grab';
    case 290:
      return 'grabbing';
    case 1:
      return 'text';
    case 2:
      return 'crosshair';
    case 3:
      return 'cell';
    case 4:
      return 'wait';
    case 200:
      return 'none';
    case 256:
    case 257:
    case 259:
      return 'crosshair';
    default:
      return editable ? 'text' : 'default';
  }
}
