import { Synth } from "./synth";

export type BarSound = "call" | "rest";

const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_MS = 25;
const OFFSET_KEY = "cc-lemon:input-offset";

/**
 * Beat clock driven by `AudioContext.currentTime` (never frame time), so judging follows what the
 * player hears. Beats are scheduled a little ahead on the audio thread; `update()` turns the
 * currently-heard position into `onBeat` / `onOffbeat` callbacks each frame.
 */
export class BeatClock {
  readonly ctx: AudioContext;
  readonly synth: Synth;
  bpm = 100;
  running = false;
  /** Extra delay between hearing a beat and the key press arriving, found by calibration. */
  inputOffset = 0;
  onBeat: (beat: number) => void = () => {};
  onOffbeat: (beat: number) => void = () => {};
  /** Asked when a beat is scheduled, so rest bars can sound different. */
  barSound: (bar: number) => BarSound = () => "call";
  groove = true;

  private t0 = 0;
  private nextScheduled = 0;
  private lastBeat = -1;
  private lastOffbeat = -1;
  private timer: number | undefined;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.synth = new Synth(this.ctx);
    try {
      this.inputOffset = Number(localStorage.getItem(OFFSET_KEY) ?? 0) || 0;
    } catch {
      this.inputOffset = 0;
    }
  }

  get secondsPerBeat(): number {
    return 60 / this.bpm;
  }

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  async unlock(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  start(bpm: number, leadInSeconds = 0.35): void {
    this.stop();
    this.bpm = bpm;
    this.t0 = this.ctx.currentTime + leadInSeconds;
    this.nextScheduled = 0;
    this.lastBeat = -1;
    this.lastOffbeat = -1;
    this.running = true;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private latency(): number {
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  /** Beat position the player is hearing right now. */
  heardBeat(): number {
    return (this.ctx.currentTime - this.latency() - this.t0) / this.secondsPerBeat;
  }

  /** Beat position of an input event, backdated to when the event actually happened. */
  inputBeat(event?: { timeStamp: number }): number {
    const age = event ? Math.max(0, (performance.now() - event.timeStamp) / 1000) : 0;
    const time = this.ctx.currentTime - age - this.latency() - this.inputOffset;
    return (time - this.t0) / this.secondsPerBeat;
  }

  setInputOffset(seconds: number): void {
    this.inputOffset = seconds;
    try {
      localStorage.setItem(OFFSET_KEY, String(seconds));
    } catch {
      // kept for this visit only
    }
  }

  update(): void {
    if (!this.running) return;
    const pos = this.heardBeat();
    while (this.lastBeat + 1 <= Math.floor(pos)) {
      this.lastBeat++;
      this.onBeat(this.lastBeat);
      if (!this.running) return;
    }
    while (this.lastOffbeat + 1 <= Math.floor(pos - 0.5)) {
      this.lastOffbeat++;
      this.onOffbeat(this.lastOffbeat);
      if (!this.running) return;
    }
  }

  private schedule(): void {
    if (!this.running) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD_SECONDS;
    while (this.t0 + this.nextScheduled * this.secondsPerBeat < horizon) {
      const beat = this.nextScheduled;
      const at = this.t0 + beat * this.secondsPerBeat;
      if (at >= this.ctx.currentTime - 0.01) {
        this.synth.beat(at, beat % 4, this.barSound(Math.floor(beat / 4)), this.secondsPerBeat, this.groove);
      }
      this.nextScheduled++;
    }
  }
}
