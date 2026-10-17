import type { Ticker } from "pixi.js";

/**
 * A tiny promise-based tween/wait scheduler driven by the Pixi ticker.
 *
 * Every animation in the Megaways stage is written as `await seq.tween(...)`
 * / `await seq.wait(...)` so the choreography reads top to bottom. The
 * scheduler owns global speed (turbo), an "instant" mode (reduced motion)
 * and `skip()`, which fast-forwards everything in flight — and everything
 * scheduled afterwards — to its end state until the current spin settles.
 */

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const outCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const inQuad: Ease = (t) => t * t;
export const inCubic: Ease = (t) => t * t * t;
export const outQuad: Ease = (t) => 1 - (1 - t) * (1 - t);
export const outBack =
  (overshoot = 1.4): Ease =>
  (t) => {
    const c1 = overshoot;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
export const outBounce: Ease = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

type Numeric = Record<string, number>;

type Item = {
  elapsed: number;
  duration: number;
  target: Numeric;
  from: Numeric;
  to: Numeric;
  ease: Ease;
  onUpdate?: (t: number) => void;
  resolve: () => void;
  done: boolean;
};

export class Sequencer {
  /** 1 = normal, >1 = faster (turbo). */
  speed = 1;
  /** Everything completes on its first frame (reduced motion). */
  instant = false;

  private items: Item[] = [];
  private frameFns = new Set<(dtMs: number) => void>();
  private skipping = false;
  private dead = false;
  private readonly ticker: Ticker;
  private readonly onTick = (ticker: Ticker) => this.step(ticker.deltaMS);

  constructor(ticker: Ticker) {
    this.ticker = ticker;
    ticker.add(this.onTick);
  }

  /**
   * Stops the scheduler for good. Pending tweens are dropped without writing
   * their end values (their targets are being destroyed), and any `tween` /
   * `wait` requested afterwards never resolves — so a choreography that was
   * mid-flight simply suspends instead of touching dead display objects.
   */
  destroy(): void {
    this.dead = true;
    this.ticker.remove(this.onTick);
    this.frameFns.clear();
    this.items = [];
  }

  /** Registers a per-frame callback (receives speed-scaled delta ms). */
  onFrame(fn: (dtMs: number) => void): void {
    this.frameFns.add(fn);
  }

  offFrame(fn: (dtMs: number) => void): void {
    this.frameFns.delete(fn);
  }

  /** True while `skip()` is in force. */
  get isSkipping(): boolean {
    return this.skipping;
  }

  /** Fast-forward all current and future tweens/waits until `endSkip()`. */
  skip(): void {
    this.skipping = true;
    this.flush();
  }

  endSkip(): void {
    this.skipping = false;
  }

  /** Resolves everything in flight at its end state. */
  cancelAll(): void {
    this.flush();
  }

  private flush(): void {
    const items = this.items;
    this.items = [];
    for (const it of items) this.finish(it);
  }

  private finish(it: Item): void {
    if (it.done) return;
    it.done = true;
    for (const k in it.to) it.target[k] = it.to[k];
    it.onUpdate?.(1);
    it.resolve();
  }

  /**
   * Tweens numeric properties of `target` (e.g. a sprite's `position` or
   * `scale`) to `to` over `ms`. Resolves when complete.
   */
  tween(
    target: object,
    to: Numeric,
    ms: number,
    ease: Ease = outCubic,
    onUpdate?: (t: number) => void
  ): Promise<void> {
    if (this.dead) return new Promise<void>(() => {});
    const t = target as Numeric;
    return new Promise<void>((resolve) => {
      const from: Numeric = {};
      for (const k in to) from[k] = t[k];
      const item: Item = {
        elapsed: 0,
        duration: Math.max(0, ms),
        target: t,
        from,
        to,
        ease,
        onUpdate,
        resolve,
        done: false,
      };
      if (this.skipping || this.instant || item.duration === 0) {
        this.finish(item);
        return;
      }
      this.items.push(item);
    });
  }

  /** Pure delay, affected by speed/skip like a tween. */
  wait(ms: number): Promise<void> {
    if (this.dead) return new Promise<void>(() => {});
    if (this.skipping) return Promise.resolve();
    return this.tween({}, {}, this.instant ? Math.min(ms, 60) : ms, linear);
  }

  all(...promises: Promise<unknown>[]): Promise<void> {
    return Promise.all(promises).then(() => undefined);
  }

  private step(deltaMS: number): void {
    const dt = deltaMS * this.speed;
    for (const fn of this.frameFns) fn(dt);
    if (this.items.length === 0) return;
    const keep: Item[] = [];
    for (const it of this.items) {
      if (it.done) continue;
      it.elapsed += dt;
      const p = Math.min(1, it.elapsed / it.duration);
      if (p >= 1) {
        this.finish(it);
        continue;
      }
      const e = it.ease(p);
      for (const k in it.to) {
        it.target[k] = it.from[k] + (it.to[k] - it.from[k]) * e;
      }
      it.onUpdate?.(p);
      keep.push(it);
    }
    this.items = keep;
  }
}
