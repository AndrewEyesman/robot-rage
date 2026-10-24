// A movie's score: which sprite is in which channel on each frame, the behaviors
// attached to each span, frame labels and the tempo.

import type { MovieDoc, SpanDoc, SpriteDoc } from './docs';
import type { CastLib } from './members';

export interface Span {
  channel: number;
  start: number;
  end: number;
  /** Behaviors in order: [castLib number, member number] and their parameters. */
  scripts: { lib: number; num: number; params: string | null }[];
  key: string;
}

export class Movie {
  readonly frameCount: number;
  readonly labels: { frame: number; name: string }[];
  private readonly sprites = new Map<number, Map<number, SpriteDoc>>();
  private readonly spans = new Map<number, Span[]>();
  /** Runs of consecutive frames with the same member, per channel (sprites the score gives no span). */
  private readonly runs = new Map<number, { start: number; end: number; key: string }[]>();

  constructor(
    /** e.g. "login013_" */
    readonly name: string,
    readonly doc: MovieDoc,
    /** castLib number - 1 -> cast. */
    readonly castLibs: CastLib[],
  ) {
    this.frameCount = doc.frameCount ?? 1;
    this.labels = (doc.labels ?? []).map(([frame, name]) => ({ frame, name })).sort((a, b) => a.frame - b.frame);
    for (const s of doc.sprites ?? []) {
      const num = s.channel - 5;
      let byChannel = this.sprites.get(s.frame);
      if (!byChannel) this.sprites.set(s.frame, (byChannel = new Map()));
      byChannel.set(num, s);
    }
    // The score lists one span entry per behavior; group them back into spans.
    const grouped = new Map<string, Span>();
    for (const s of doc.spans ?? []) {
      const key = `${s.channel}:${s.start}-${s.end}`;
      let g = grouped.get(key);
      if (!g) grouped.set(key, (g = { channel: s.channel, start: s.start, end: s.end, scripts: [], key: `${s.start}-${s.end}` }));
      s.scripts.forEach(([lib, num], i) => g!.scripts.push({ lib, num, params: paramOf(s, i) }));
    }
    // A sprite without behaviors has no span entry; it's still one sprite for as long as
    // the channel holds the same member in consecutive frames.
    const byChannel = new Map<number, SpriteDoc[]>();
    for (const sd of doc.sprites ?? []) {
      const ch = sd.channel - 5;
      let l = byChannel.get(ch);
      if (!l) byChannel.set(ch, (l = []));
      l.push(sd);
    }
    for (const [ch, list] of byChannel) {
      list.sort((a, b) => a.frame - b.frame);
      const runs: { start: number; end: number; key: string }[] = [];
      for (const sd of list) {
        const last = runs[runs.length - 1];
        const prev = last && this.sprites.get(last.end)?.get(ch);
        if (last && last.end === sd.frame - 1 && prev && prev.member[0] === sd.member[0] && prev.member[1] === sd.member[1]) last.end = sd.frame;
        else runs.push({ start: sd.frame, end: sd.frame, key: '' });
      }
      for (const r of runs) r.key = `run-${r.start}-${r.end}`;
      this.runs.set(ch, runs);
    }
    for (const g of grouped.values()) {
      let list = this.spans.get(g.channel);
      if (!list) this.spans.set(g.channel, (list = []));
      list.push(g);
    }
  }

  get fileName() {
    return this.doc.file;
  }

  /** The score's sprite data for a channel on a frame. */
  spriteAt(frame: number, channel: number): SpriteDoc | undefined {
    return this.sprites.get(frame)?.get(channel);
  }

  channelsAt(frame: number): number[] {
    return [...(this.sprites.get(frame)?.keys() ?? [])];
  }

  /** The span covering a channel on a frame (channel 0 is the frame script). */
  spanAt(frame: number, channel: number): Span | undefined {
    const list = this.spans.get(channel);
    if (!list) return undefined;
    let best: Span | undefined;
    for (const s of list) if (s.start <= frame && frame <= s.end && (!best || s.start > best.start)) best = s;
    return best;
  }

  /** The implicit span (run of the same member) of a scriptless sprite. */
  runAt(frame: number, channel: number): { start: number; end: number; key: string } | undefined {
    return this.runs.get(channel)?.find((r) => r.start <= frame && frame <= r.end);
  }

  /** Every channel with a span on the frame, in channel order. */
  spanChannelsAt(frame: number): number[] {
    const out: number[] = [];
    for (const [ch, list] of this.spans) if (ch > 0 && list.some((s) => s.start <= frame && frame <= s.end)) out.push(ch);
    return out.sort((a, b) => a - b);
  }

  /** Frame of a label (case-insensitive), or 0. */
  labelFrame(name: string): number {
    const l = this.labels.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return l ? l.frame : 0;
  }

  /** The label at or before a frame (the frameLabel is the label on this frame only). */
  labelAt(frame: number): string {
    return this.labels.find((l) => l.frame === frame)?.name ?? '';
  }

  /** marker(n): the nth label after (n > 0) or before the current frame's marker. */
  marker(frame: number, n: number): number {
    let i = -1;
    this.labels.forEach((l, k) => {
      if (l.frame <= frame) i = k;
    });
    const j = i + n;
    if (j < 0) return this.labels[0]?.frame ?? 1;
    if (j >= this.labels.length) return this.labels[this.labels.length - 1]?.frame ?? frame;
    return this.labels[j].frame;
  }

  /** Frames per second on a frame (the tempo channel, or the movie's default). */
  tempoAt(frame: number): number {
    let fps = this.doc.frameRate || 15;
    for (const t of this.doc.tempo ?? []) {
      if (t.frame + 1 <= frame) {
        if (t.tempo === 246 || t.tempo === 0) fps = t.cue || fps;
        else if (t.tempo > 0 && t.tempo <= 120) fps = t.tempo;
      }
    }
    return fps;
  }

  castLibByName(name: string): CastLib | undefined {
    return this.castLibs.find((c) => c.name.toLowerCase() === name.toLowerCase());
  }
}

function paramOf(s: SpanDoc, i: number): string | null {
  const p = s.params?.[i];
  if (!p || !p.length) return null;
  return p[0] ?? null;
}
