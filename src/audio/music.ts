/**
 * Synthesized background music. Each style is a small step sequencer (16 steps per bar) that
 * triggers drum, bass, chord and lead voices; FEVER adds an extra layer. Everything is scheduled
 * ahead on the audio clock, so it stays on the beat at any BPM.
 */

export type StyleId = "pop" | "lofi" | "lofi2" | "lofi3" | "matsuri" | "funk";

type Note = [step: number, midi: number, length: number];

interface Voices {
  kick(at: number, gain?: number): void;
  snare(at: number, gain?: number): void;
  clap(at: number, gain?: number): void;
  hat(at: number, gain?: number, open?: boolean): void;
  tom(at: number, freq: number, gain?: number): void;
  tone(at: number, midi: number, seconds: number, opts?: ToneOpts): void;
  crackle(at: number, seconds: number): void;
  rain(at: number, seconds: number): void;
  fizz(at: number): void;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  cutoff?: number;
  vibrato?: number;
  detune?: number;
  /** Amplitude wobble depth (0–1), for vibraphone-like tones. */
  tremolo?: number;
}

export interface Style {
  id: StyleId;
  bars: number;
  /** 0 = straight 16ths; 0.2 pushes every second 16th late. */
  swing: number;
  step(v: Voices, bar: number, step: number, at: number, sixteenth: number, fever: boolean): void;
}

const hits = (pattern: string, step: number) => pattern[step % pattern.length] === "x";

function notesAt(bars: Note[][], bar: number, step: number): Note[] {
  return bars[bar % bars.length].filter(([s]) => s === step);
}

// ---------- A. pop / chiptune (C major: C G Am F) ----------

const POP_CHORDS = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]];
const POP_BASS = [36, 43, 45, 41];
const POP_MELODY: Note[][] = [
  [[0, 76, 2], [2, 76, 2], [4, 79, 2], [6, 81, 2], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
  [[0, 74, 2], [2, 74, 2], [4, 76, 2], [6, 79, 2], [8, 74, 6], [14, 71, 2]],
  [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2], [8, 83, 4], [12, 79, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
];

const pop: Style = {
  id: "pop",
  bars: 4,
  swing: 0,
  step(v, bar, step, at, six, fever) {
    const b = bar % 4;
    if (hits("x.....x.x.......", step)) v.kick(at, 0.9);
    if (hits("....x.......x...", step)) v.snare(at, 0.5);
    if (step % 2 === 0) v.hat(at, 0.12);
    if (fever && step % 2 === 1) v.hat(at, 0.08);
    if (fever && step === 0 && b === 0) v.hat(at, 0.25, true);
    if (hits("x.....x.x.....x.", step)) v.tone(at, POP_BASS[b] + (step === 8 ? 12 : 0), six * 1.8, { type: "triangle", gain: 0.35 });
    if (step === 0 || step === 8) for (const n of POP_CHORDS[b]) v.tone(at, n, six * 3, { type: "square", gain: 0.035, release: 0.1 });
    for (const [, n, len] of notesAt(POP_MELODY, bar, step)) v.tone(at, n, six * len * 0.9, { type: "square", gain: 0.09, release: 0.05 });
    if (fever) {
      const chord = POP_CHORDS[b];
      v.tone(at, chord[step % 3] + 24, six * 0.8, { type: "square", gain: 0.035 });
    }
  },
};

// ---------- B. after-school lo-fi (Fmaj7 Em7 Dm7 Cmaj7, swung) ----------

const LOFI_CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
const LOFI_BASS = [41, 40, 38, 36];
const LOFI_MELODY: Note[][] = [
  [[6, 72, 2], [8, 69, 5]],
  [[4, 71, 2], [6, 67, 7]],
  [[2, 69, 2], [4, 72, 2], [8, 74, 5]],
  [[0, 72, 10]],
];

const lofi: Style = {
  id: "lofi",
  bars: 4,
  swing: 0.22,
  step(v, bar, step, at, six, fever) {
    const b = bar % 4;
    if (step === 0) v.crackle(at, six * 16);
    if (hits("x.......x.x.....", step)) v.kick(at, 0.6);
    if (hits("....x.......x...", step)) v.snare(at, 0.22);
    if (step % 2 === 0) v.hat(at, 0.06);
    if (fever && step % 2 === 1) v.hat(at, 0.05);
    if (step === 0 || step === 7) v.tone(at, LOFI_BASS[b], six * 5, { type: "sine", gain: 0.4, release: 0.2 });
    if (step === 0) for (const n of LOFI_CHORDS[b]) v.tone(at, n, six * 9, { type: "triangle", gain: 0.05, attack: 0.02, release: 0.4, detune: 6 });
    if (step === 10) for (const n of LOFI_CHORDS[b]) v.tone(at, n + 12, six * 4, { type: "sine", gain: 0.025, release: 0.3 });
    for (const [, n, len] of notesAt(LOFI_MELODY, bar, step)) v.tone(at, n, six * len, { type: "sine", gain: 0.1, attack: 0.02, release: 0.3, vibrato: 3 });
    if (fever && (step === 3 || step === 11)) v.tone(at, LOFI_CHORDS[b][3] + 12, six * 2, { type: "triangle", gain: 0.05 });
  },
};

// ---------- B2. dusk classroom: lo-fi jazz (Cm9 F13 Bbmaj9 Gm9) ----------

const DUSK_CHORDS = [[51, 55, 58, 62, 63], [51, 57, 60, 62, 65], [50, 53, 57, 60, 62], [46, 53, 57, 58, 62]];
const DUSK_BASS: Note[][] = [
  [[0, 36, 3], [4, 43, 2], [8, 39, 3], [12, 41, 2]],
  [[0, 41, 3], [4, 45, 2], [8, 48, 3], [12, 40, 2]],
  [[0, 46, 3], [4, 45, 2], [8, 41, 3], [12, 38, 2]],
  [[0, 43, 3], [4, 46, 2], [8, 50, 3], [12, 42, 2]],
];
const DUSK_VIBES: Note[][] = [
  [[2, 75, 2], [4, 74, 2], [6, 70, 4], [12, 67, 2]],
  [[0, 69, 3], [4, 72, 2], [8, 75, 6]],
  [[2, 74, 2], [4, 72, 2], [6, 69, 2], [8, 70, 6]],
  [[0, 67, 2], [2, 70, 2], [4, 74, 4], [10, 72, 4]],
];

const lofi2: Style = {
  id: "lofi2",
  bars: 4,
  swing: 0.3,
  step(v, bar, step, at, six, fever) {
    const b = bar % 4;
    if (step === 0) {
      v.crackle(at, six * 16);
      if (bar % 2 === 0) v.rain(at, six * 32);
    }
    if (hits("x.........x.....", step)) v.kick(at, 0.45);
    if (hits("....x.......x...", step)) v.snare(at, 0.12);
    v.hat(at, step % 2 ? 0.025 : 0.045);
    if (fever && step % 4 === 2) v.hat(at, 0.08, true);
    for (const [, n, len] of notesAt(DUSK_BASS, bar, step)) v.tone(at, n, six * len, { type: "sine", gain: 0.38, release: 0.15 });
    if (step === 0 || step === 11) for (const n of DUSK_CHORDS[b]) v.tone(at, n + 12, six * (step === 0 ? 8 : 4), { type: "triangle", gain: 0.035, attack: 0.03, release: 0.5, detune: 8 });
    for (const [, n, len] of notesAt(DUSK_VIBES, bar, step)) v.tone(at, n, six * len, { type: "sine", gain: 0.11, attack: 0.005, release: 0.6, tremolo: 0.35 });
    if (fever && step % 2 === 0) v.tone(at, DUSK_CHORDS[b][(step / 2) % 5] + 24, six * 1.2, { type: "sine", gain: 0.035, release: 0.3, tremolo: 0.3 });
  },
};

// ---------- B3. soda chill-hop (Dmaj7 Bm7 Gmaj7 A6, bubbly) ----------

const SODA_CHORDS = [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 66]];
const SODA_BASS = [38, 35, 43, 45];
const KALIMBA: Note[][] = [
  [[0, 78, 1], [2, 81, 1], [3, 78, 1], [6, 76, 2], [10, 74, 1], [12, 73, 2]],
  [[0, 74, 1], [2, 78, 1], [4, 81, 2], [8, 83, 1], [10, 81, 1], [12, 78, 2]],
  [[0, 79, 1], [2, 78, 1], [3, 74, 1], [6, 71, 2], [10, 74, 1], [12, 76, 2]],
  [[0, 73, 1], [2, 76, 1], [4, 78, 2], [6, 81, 1], [8, 85, 4]],
];

const lofi3: Style = {
  id: "lofi3",
  bars: 4,
  swing: 0.16,
  step(v, bar, step, at, six, fever) {
    const b = bar % 4;
    if (step === 0) v.crackle(at, six * 16);
    if (hits("x......x..x.....", step)) v.kick(at, 0.85);
    if (hits("....x.......x...", step)) v.snare(at, 0.3);
    if (step % 2 === 0) v.hat(at, 0.07);
    if (hits("......x.......x.", step)) v.hat(at, 0.06, true);
    if (fever && step % 2 === 1) v.hat(at, 0.05);
    if (step === 0 || step === 10) v.tone(at, SODA_BASS[b], six * 5, { type: "sine", gain: 0.42, release: 0.1 });
    if (step === 7) v.tone(at, SODA_BASS[b] + 7, six * 2, { type: "sine", gain: 0.3 });
    if (step % 4 === 0) for (const n of SODA_CHORDS[b]) v.tone(at + six * 0.4, n, six * 3, { type: "triangle", gain: 0.03, attack: 0.08, release: 0.2, detune: 5 });
    for (const [, n, len] of notesAt(KALIMBA, bar, step)) v.tone(at, n, six * len * 0.6, { type: "triangle", gain: 0.1, attack: 0.002, release: 0.35 });
    if (step % 8 === 5 || (fever && step % 4 === 1)) v.fizz(at);
    if (fever && step % 2 === 0) v.tone(at, SODA_CHORDS[b][(step / 2) % 4] + 24, six * 0.8, { type: "triangle", gain: 0.035, release: 0.2 });
  },
};

// ---------- C. summer festival (D yo scale: D E G A B, taiko + fue) ----------

const FUE: Note[][] = [
  [[0, 74, 4], [4, 76, 2], [6, 79, 2], [8, 81, 6], [14, 79, 2]],
  [[0, 76, 4], [4, 74, 4], [8, 71, 4], [12, 74, 4]],
  [[0, 79, 2], [2, 81, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 74, 8], [8, 76, 4], [12, 74, 4]],
];

const matsuri: Style = {
  id: "matsuri",
  bars: 4,
  swing: 0.08,
  step(v, bar, step, at, six, fever) {
    if (hits("x..x..x.x...x...", step)) v.tom(at, 70, 0.9);
    if (hits("..x...x...x...x.", step)) v.tom(at, 260, 0.25);
    if (hits("....x.......x...", step)) v.clap(at, 0.35);
    if (fever) {
      if (step % 2 === 1) v.tom(at, 180, 0.18);
      if (step === 15) v.tom(at, 90, 0.7);
    }
    if (step === 0) v.tone(at, 38, six * 15, { type: "sawtooth", gain: 0.05, cutoff: 500, release: 0.3 });
    if (step % 2 === 0) v.tone(at, step % 4 === 0 ? 62 : 69, six * 1.2, { type: "triangle", gain: 0.1, release: 0.05 });
    for (const [, n, len] of notesAt(FUE, bar, step)) v.tone(at, n, six * len * 0.95, { type: "sine", gain: 0.13, attack: 0.03, release: 0.1, vibrato: 6 });
    if (fever) for (const [, n] of notesAt(FUE, bar + 2, step)) v.tone(at, n + 12, six * 1.5, { type: "sine", gain: 0.05, vibrato: 8 });
  },
};

// ---------- D. electro funk (Em7 / A7, four on the floor) ----------

const FUNK_BASS: Note[][] = [
  [[0, 40, 2], [3, 52, 1], [6, 43, 2], [8, 45, 2], [11, 40, 1], [14, 50, 2]],
  [[0, 45, 2], [3, 57, 1], [6, 45, 1], [8, 47, 2], [10, 43, 2], [14, 40, 2]],
];
const FUNK_STABS = [[64, 67, 71, 74], [61, 64, 67, 69]];
const FUNK_LEAD: Note[][] = [
  [[12, 79, 1], [13, 81, 1], [14, 83, 2]],
  [[0, 81, 2], [4, 79, 2], [6, 76, 4]],
  [[12, 83, 1], [13, 86, 1], [14, 88, 2]],
  [[0, 86, 2], [2, 83, 2], [4, 81, 2], [8, 79, 6]],
];

const funk: Style = {
  id: "funk",
  bars: 4,
  swing: 0.05,
  step(v, bar, step, at, six, fever) {
    const b = bar % 2;
    if (step % 4 === 0) v.kick(at, 1);
    if (hits("....x.......x...", step)) v.clap(at, 0.45);
    if (hits("..x...x...x...x.", step)) v.hat(at, 0.14, true);
    v.hat(at, step % 2 ? 0.04 : 0.07);
    for (const [, n, len] of notesAt(FUNK_BASS, bar, step)) v.tone(at, n, six * len, { type: "sawtooth", gain: 0.2, cutoff: 900, release: 0.05 });
    if (step === 2 || step === 10) for (const n of FUNK_STABS[b]) v.tone(at, n, six * 0.9, { type: "sawtooth", gain: 0.03, cutoff: 2500 });
    for (const [, n, len] of notesAt(FUNK_LEAD, bar, step)) v.tone(at, n, six * len, { type: "square", gain: 0.06, cutoff: 3000 });
    if (fever) v.tone(at, FUNK_STABS[b][step % 4] + 12, six * 0.7, { type: "sawtooth", gain: 0.03, cutoff: 1800 + 1500 * Math.sin(step) });
  },
};

export const STYLES: Record<StyleId, Style> = { pop, lofi, lofi2, lofi3, matsuri, funk };

const LOOKAHEAD = 0.15;

/** Plays one style at a time; BPM and FEVER can change while it runs. */
export class MusicPlayer implements Voices {
  private master: GainNode;
  private noise: AudioBuffer;
  private timer: number | undefined;
  private nextAt = 0;
  private stepIndex = 0;
  style: Style = pop;
  bpm = 110;
  fever = false;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  get playing(): boolean {
    return this.timer !== undefined;
  }

  setVolume(v: number): void {
    this.master.gain.value = v;
  }

  /** Starts `style` with its first 16th at `at` (defaults to right away) — pass the beat clock's beat-0 time to lock the two together. */
  start(style: Style, at = this.ctx.currentTime + 0.1): void {
    this.stop();
    this.style = style;
    this.stepIndex = 0;
    this.nextAt = at;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    const six = 60 / this.bpm / 4;
    while (this.nextAt < this.ctx.currentTime + LOOKAHEAD) {
      const step = this.stepIndex % 16;
      const bar = Math.floor(this.stepIndex / 16) % this.style.bars;
      const swing = step % 2 === 1 ? this.style.swing * six : 0;
      this.style.step(this, bar, step, this.nextAt + swing, six, this.fever);
      this.nextAt += six;
      this.stepIndex++;
    }
  }

  private env(at: number, gain: number, attack: number, hold: number, release: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, gain), at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    g.connect(this.master);
    return g;
  }

  private burst(at: number, seconds: number, gain: number, type: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f);
    f.connect(this.env(at, gain, 0.002, 0, seconds));
    src.start(at, Math.random() * 0.5);
    src.stop(at + seconds + 0.05);
  }

  kick(at: number, gain = 0.8): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.15);
    osc.connect(this.env(at, gain, 0.002, 0.02, 0.2));
    osc.start(at);
    osc.stop(at + 0.3);
  }

  snare(at: number, gain = 0.4): void {
    this.burst(at, 0.14, gain, "bandpass", 1800);
    this.tone(at, 50, 0.08, { type: "triangle", gain: gain * 0.5 });
  }

  clap(at: number, gain = 0.4): void {
    for (const d of [0, 0.01, 0.022]) this.burst(at + d, 0.1, gain, "bandpass", 1300);
  }

  hat(at: number, gain = 0.1, open = false): void {
    this.burst(at, open ? 0.18 : 0.035, gain, "highpass", 7500);
  }

  tom(at: number, freq: number, gain = 0.6): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 1.6, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
    osc.connect(this.env(at, gain, 0.002, 0.01, freq < 120 ? 0.45 : 0.12));
    osc.start(at);
    osc.stop(at + 0.6);
    this.burst(at, 0.03, gain * 0.3, "lowpass", 900);
  }

  tone(at: number, midi: number, seconds: number, o: ToneOpts = {}): void {
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    if (o.detune) osc.detune.value = (Math.random() - 0.5) * o.detune * 2;
    let node: AudioNode = osc;
    if (o.cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.cutoff;
      osc.connect(f);
      node = f;
    }
    if (o.tremolo) {
      const trem = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = o.tremolo;
      lfo.connect(depth);
      depth.connect(trem.gain);
      node.connect(trem);
      node = trem;
      lfo.start(at);
      lfo.stop(at + seconds + 0.8);
    }
    if (o.vibrato) {
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = o.vibrato;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + seconds + 0.5);
    }
    const release = o.release ?? 0.08;
    node.connect(this.env(at, o.gain ?? 0.1, o.attack ?? 0.005, Math.max(0, seconds - (o.attack ?? 0.005)), release));
    osc.start(at);
    osc.stop(at + seconds + release + 0.05);
  }

  crackle(at: number, seconds: number): void {
    this.burst(at, seconds, 0.015, "bandpass", 3000);
  }

  rain(at: number, seconds: number): void {
    this.burst(at, seconds, 0.02, "lowpass", 1200);
  }

  /** A little soda-bubble "pop": a fast rising blip. */
  fizz(at: number): void {
    const osc = this.ctx.createOscillator();
    const start = 900 + Math.random() * 900;
    osc.frequency.setValueAtTime(start, at);
    osc.frequency.exponentialRampToValueAtTime(start * 2.2, at + 0.05);
    osc.connect(this.env(at, 0.04, 0.002, 0, 0.06));
    osc.start(at);
    osc.stop(at + 0.1);
  }
}
