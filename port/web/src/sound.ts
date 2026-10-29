// Sound, as the shared cast's playsound does it: effects go to the first free of
// Director's sound channels 3-8 (channel 8 is taken over when all are busy), at a
// volume of 0-255. The sounds are the game's own members, exported by port/extract.

interface MemberDoc {
  name: string;
  sound?: { file: string };
}

export class Sound {
  private readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly files = new Map<string, string>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** What each channel plays; a channel is busy from the moment a sound is asked of it. */
  private readonly channels = new Map<number, { source: AudioBufferSourceNode | null }>();

  private constructor() {
    this.master.connect(this.ctx.destination);
    // Browsers start audio suspended until the player presses something.
    const resume = () => void this.ctx.resume();
    addEventListener('keydown', resume);
    addEventListener('pointerdown', resume);
  }

  /** Index the sound members of the given movies (earlier movies win a name clash). */
  static async load(assets: string, movies: string[]): Promise<Sound> {
    const s = new Sound();
    for (const movie of movies) {
      const index = await (await fetch(`${assets}/${movie}/index.json`, { cache: 'no-cache' })).json();
      for (const m of index.members as MemberDoc[]) {
        const key = m.name.toLowerCase();
        if (m.sound && m.name && !s.files.has(key)) s.files.set(key, `${assets}/${movie}/${m.sound.file}`);
      }
    }
    return s;
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    const key = name.toLowerCase();
    let b = this.buffers.get(key);
    if (!b) {
      const url = this.files.get(key);
      b = url
        ? fetch(url)
            .then((r) => r.arrayBuffer())
            .then((data) => this.ctx.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(key, b);
    }
    return b;
  }

  /** Fetch and decode sounds ahead of time so the first play isn't late. */
  preload(names: string[]) {
    for (const n of names) void this.buffer(n);
  }

  private busy(ch: number) {
    return this.channels.has(ch);
  }

  /** puppetSound(ch, name) at `volume` (0-255), replacing whatever plays there. */
  play(ch: number, name: string, volume: number) {
    this.stop(ch);
    const entry: { source: AudioBufferSourceNode | null } = { source: null };
    this.channels.set(ch, entry);
    void this.buffer(name).then((buf) => {
      if (this.channels.get(ch) !== entry) return; // replaced before it loaded
      if (!buf) {
        this.channels.delete(ch);
        return;
      }
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = buf;
      gain.gain.value = Math.max(0, Math.min(255, volume)) / 255;
      source.connect(gain).connect(this.master);
      entry.source = source;
      source.onended = () => {
        if (this.channels.get(ch) === entry) this.channels.delete(ch);
      };
      source.start();
    });
  }

  stop(ch: number) {
    const c = this.channels.get(ch);
    if (c) {
      if (c.source) {
        c.source.onended = null;
        c.source.stop();
      }
      this.channels.delete(ch);
    }
  }

  /** playsound(name, v0): the first free channel from 3, else channel 8. */
  playsound(name: string, volume: number): number {
    let ch = 3;
    while (this.busy(ch) && ch < 8) ch++;
    this.play(ch, name, volume);
    return ch;
  }
}
