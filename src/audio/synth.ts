import type { BarSound } from "./clock";

const MASTER = 0.55;

/** Every sound in the game is synthesized here; there are no audio files. */
export class Synth {
  private master: GainNode;
  private noise: AudioBuffer;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** 0–1; 1 is the original full level. */
  setVolume(v: number): void {
    this.master.gain.value = MASTER * v;
  }

  /** One beat of the groove: kick on 1 and 3, hats between, a clap and bright ping on 「モン」. */
  /** Beat ticks (quieter when music plays); `groove` adds the built-in kick/hat for when there is no music. */
  beat(at: number, beatInBar: number, bar: BarSound, spb: number, groove: boolean, tickLevel = 1): void {
    const rest = bar === "rest";
    const level = (rest ? 0.45 : 1) * tickLevel;
    if (groove) {
      if (beatInBar === 0 || beatInBar === 2) this.kick(at, 0.8 * level);
      this.hat(at + spb / 2, 0.12 * level);
    }
    if (beatInBar === 3) {
      if (!rest) this.clap(at, 0.5 * tickLevel);
      this.tone(at, rest ? 660 : 1320, 0.09, rest ? 0.1 : 0.28, "triangle");
    } else {
      this.tone(at, rest ? 440 : 880, 0.05, rest ? 0.07 : 0.16, "sine");
    }
  }

  private out(gain: number, at: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    g.connect(this.master);
    return g;
  }

  tone(at: number, freq: number, decay: number, gain: number, type: OscillatorType = "sine", toFreq?: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, at + decay);
    osc.connect(this.out(gain, at, decay));
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  private burst(at: number, decay: number, gain: number, filter: BiquadFilterType, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    src.connect(f);
    f.connect(this.out(gain, at, decay));
    src.start(at, Math.random() * 0.5);
    src.stop(at + decay + 0.02);
  }

  private kick(at: number, gain: number): void {
    this.tone(at, 150, 0.18, gain, "sine", 45);
  }

  private hat(at: number, gain: number): void {
    this.burst(at, 0.04, gain, "highpass", 7000);
  }

  private clap(at: number, gain: number): void {
    this.burst(at, 0.12, gain, "bandpass", 1500);
  }

  private now(): number {
    return this.ctx.currentTime;
  }

  hit(): void {
    const t = this.now();
    this.tone(t, 180, 0.2, 0.6, "square", 60);
    this.burst(t, 0.15, 0.5, "lowpass", 2000);
  }

  guard(): void {
    const t = this.now();
    this.tone(t, 1600, 0.25, 0.2, "triangle", 1200);
    this.tone(t, 2400, 0.18, 0.1, "sine");
  }

  clash(): void {
    const t = this.now();
    this.burst(t, 0.25, 0.5, "bandpass", 3000);
    this.tone(t, 900, 0.2, 0.25, "sawtooth", 300);
  }

  charge(): void {
    this.tone(this.now(), 300, 0.3, 0.2, "sine", 900);
  }

  special(): void {
    const t = this.now();
    this.tone(t, 200, 0.5, 0.35, "sawtooth", 1200);
    this.burst(t + 0.05, 0.4, 0.3, "highpass", 1500);
  }

  /** The special's lemon landing: a deep boom with a splash on top. */
  specialImpact(): void {
    const t = this.now();
    this.tone(t, 110, 0.5, 0.5, "sine", 40);
    this.burst(t, 0.35, 0.35, "lowpass", 900);
    this.burst(t + 0.02, 0.25, 0.2, "highpass", 3000);
  }

  item(): void {
    const t = this.now();
    [988, 1319, 1760].forEach((f, i) => this.tone(t + i * 0.05, f, 0.15, 0.18, "triangle"));
  }

  coin(): void {
    const t = this.now();
    this.tone(t, 1319, 0.08, 0.2, "square");
    this.tone(t + 0.07, 1976, 0.25, 0.2, "square");
  }

  perfect(): void {
    this.tone(this.now(), 2093, 0.12, 0.12, "sine");
  }

  fever(): void {
    const t = this.now();
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.06, f, 0.2, 0.2, "square"));
  }

  win(): void {
    const t = this.now();
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.12, f, 0.35, 0.25, "triangle"));
  }

  lose(): void {
    const t = this.now();
    [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.18, f, 0.4, 0.22, "triangle"));
  }

  /** Treasure chest: a wooden rattle, then a sparkly pop as the lid flies open, then a chime on the pick. */
  chest(phase: "shake" | "open" | "pick"): void {
    const t = this.now();
    if (phase === "shake") {
      for (let i = 0; i < 4; i++) {
        this.tone(t + i * 0.17, 180 + (i % 2) * 40, 0.07, 0.22, "square", 120);
        this.burst(t + i * 0.17, 0.05, 0.12, "bandpass", 900);
      }
    } else if (phase === "open") {
      this.burst(t, 0.35, 0.25, "highpass", 2500);
      this.tone(t, 300, 0.25, 0.2, "triangle", 900);
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(t + 0.08 + i * 0.05, f, 0.3, 0.14, "sine"));
    } else {
      [784, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.06, f, 0.25, 0.18, "triangle"));
    }
  }

  ui(): void {
    this.tone(this.now(), 1200, 0.05, 0.1, "sine");
  }
}
