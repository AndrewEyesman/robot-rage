// Director's eight sound channels: sound(n).play(member), puppetSound, volume
// (0-255), isBusy and stop, playing the game's own sound members.

import type { SoundMember } from './members';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // Browsers start audio suspended until the player presses something.
    const resume = () => void ctx!.resume();
    addEventListener('keydown', resume);
    addEventListener('pointerdown', resume);
  }
  return ctx;
}

function buffer(url: string): Promise<AudioBuffer | null> {
  let b = buffers.get(url);
  if (!b) {
    b = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => audio().decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, b);
  }
  return b;
}

/**
 * Sound members the port doesn't play (by name, lower case), for enhancements that
 * silence an original sound without touching the translated scripts.
 */
export const mutedSounds = new Set<string>();

export function preloadSound(m: SoundMember) {
  void buffer(m.url);
}

/**
 * Not Director's: a sound played once outside the eight channels, so no channel's stop
 * cuts it (gameFixes.touchClick: the button click on a touch screen).
 */
export function playOneShot(m: SoundMember, volume = 255) {
  if (mutedSounds.has(m.name.toLowerCase())) return;
  const ac = audio();
  void buffer(m.url).then((buf) => {
    if (!buf) return;
    const source = ac.createBufferSource();
    const gain = ac.createGain();
    source.buffer = buf;
    gain.gain.value = Math.max(0, Math.min(255, volume)) / 255;
    source.connect(gain).connect(master!);
    source.start();
  });
}

export class SoundChannel {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private token = 0;
  private busy = false;
  private _volume = 255;
  member: SoundMember | null = null;
  private startedAt = 0;

  constructor(readonly number: number) {}

  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(255, v));
    if (this.gain) this.gain.gain.value = this._volume / 255;
  }

  /** The sound queue (setPlayList / queue), played by play() with no member. */
  private playList: { member: SoundMember; loopCount?: number }[] = [];

  /** sound(n).setPlayList(list): replaces the queue (the arena empties it). */
  setPlayList(list: { member: SoundMember; loopCount?: number }[] = []) {
    this.playList = [...list];
  }

  /** sound(n).queue([#member: m, #loopCount: n, ...]): a sound for the next play(). Cue points and start times aren't used by the game. */
  queue(entry: { member: SoundMember; loopCount?: number }) {
    this.playList.push(entry);
  }

  /**
   * play(member) / play([#member: m, #loopCount: n, #rateShift: semitones]), or play()
   * for the first queued sound. A loopCount other than 1 (the arena queues 9999) loops.
   */
  play(m?: SoundMember, opts: { loopCount?: number; rateShift?: number } = {}) {
    if (!m) {
      const next = this.playList.shift();
      if (!next) return;
      m = next.member;
      opts = { loopCount: next.loopCount === undefined || next.loopCount === 1 ? undefined : 0 };
    }
    this.stop();
    if (mutedSounds.has(m.name.toLowerCase())) return;
    const token = ++this.token;
    this.busy = true;
    this.member = m;
    const ac = audio();
    void buffer(m.url).then((buf) => {
      if (token !== this.token) return;
      if (!buf) {
        this.busy = false;
        return;
      }
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = buf;
      source.loop = opts.loopCount === 0;
      if (opts.rateShift) source.playbackRate.value = Math.pow(2, opts.rateShift / 12);
      gain.gain.value = this._volume / 255;
      source.connect(gain).connect(master!);
      source.onended = () => {
        if (token === this.token) {
          this.busy = false;
          this.source = null;
        }
      };
      this.source = source;
      this.gain = gain;
      this.startedAt = ac.currentTime;
      source.start();
    });
  }

  stop() {
    this.token++;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* not started */
      }
    }
    this.source = null;
    this.busy = false;
  }

  isBusy() {
    return this.busy;
  }

  /** sound(n).elapsedTime in milliseconds. */
  get elapsedTime() {
    return this.source && ctx ? (ctx.currentTime - this.startedAt) * 1000 : 0;
  }

  fadeTo(volume: number, ms = 1000) {
    if (this.gain && ctx) this.gain.gain.linearRampToValueAtTime(volume / 255, ctx.currentTime + ms / 1000);
    this._volume = volume;
  }

  /** sound(n).fadeOut(ms): fade to silence (the sound keeps playing at volume 0). */
  fadeOut(ms = 1000) {
    this.fadeTo(0, ms);
  }

  /** sound(n).fadeIn(ms): from silence up to the channel's volume. */
  fadeIn(ms = 1000) {
    const v = this._volume;
    if (this.gain && ctx) {
      this.gain.gain.setValueAtTime(0, ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(v / 255, ctx.currentTime + ms / 1000);
    }
  }
}

const channels = new Map<number, SoundChannel>();

export function sound(n: number): SoundChannel {
  let c = channels.get(n);
  if (!c) channels.set(n, (c = new SoundChannel(n)));
  return c;
}

export function soundBusy(n: number) {
  return sound(n).isBusy();
}

export function stopAllSounds() {
  for (const c of channels.values()) c.stop();
}
