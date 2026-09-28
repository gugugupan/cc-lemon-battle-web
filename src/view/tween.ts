type Tween = { start: number; duration: number; update: (k: number) => void; done?: () => void };

/** Minimal frame-driven tweens; `k` runs 0→1. */
export class Tweens {
  private list: Tween[] = [];
  private time = 0;

  add(duration: number, update: (k: number) => void, done?: () => void): void {
    this.list.push({ start: this.time, duration, update, done });
  }

  delay(seconds: number, fn: () => void): void {
    this.add(seconds, () => {}, fn);
  }

  tick(dt: number): void {
    this.time += dt;
    const current = this.list;
    this.list = [];
    for (const tw of current) {
      const k = Math.min(1, (this.time - tw.start) / tw.duration);
      tw.update(k);
      if (k >= 1) tw.done?.();
      else this.list.push(tw);
    }
  }

  clear(): void {
    this.list = [];
  }
}

export const ease = {
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  outBack: (k: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  },
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
};
