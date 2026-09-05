import { Container, Graphics } from "pixi.js";

/**
 * Plinko ball manager.
 *
 * Owns the `BallContainer` (and a `TrailContainer` layered beneath it), spawns
 * balls that follow a pre-computed trajectory, and animates them down the board
 * with parabolic arc interpolation, squash/stretch on each peg impact, and a
 * fade-out after landing.
 *
 * The trajectory keyframes are derived from the outcome path (peg-layout.ts),
 * so the visual drop is deterministic and matches what the program settled.
 */

type Keyframe = { x: number; y: number };

type Ball = {
  id: number;
  sprite: Graphics;
  trail: Graphics;
  keyframes: Keyframe[];
  seg: number; // current keyframe segment
  t: number; // progress within segment (0..1)
  scaleY: number;
  done: boolean;
  fading: boolean;
  fadeMs: number; // remaining fade time
  holdMs: number; // hold at bucket before fade
  segmentMs: number[]; // per-segment duration (ms)
};

export type BallCallbacks = {
  onPegHit?: (peg: Keyframe) => void;
  onComplete?: (ballId: number) => void;
};

const MAX_CONSECUTIVE = 15;
const HOLD_AT_BUCKET_MS = 250;
const FADE_MS = 350;
const GRAVITY_STRENGTH = 0.35; // parabolic arc intensity (positive = downward bulge)

export class BallManager {
  private container: Container;
  private trailContainer: Container;
  private balls = new Map<number, Ball>();
  private nextId = 1;
  private running: boolean = false;
  private lastTime = 0;
  private callbacks: BallCallbacks = {};

  constructor(parent: Container) {
    this.trailContainer = new Container();
    this.container = new Container();
    this.trailContainer.zIndex = 1;
    this.container.zIndex = 2;
    parent.addChild(this.trailContainer);
    parent.addChild(this.container);
  }

  setCallbacks(cb: BallCallbacks) {
    this.callbacks = cb;
  }

  get activeCount(): number {
    return this.balls.size;
  }

  /** Number of live consecutive balls; concurrent drops share this cursor. */
  get canDrop(): boolean {
    return this.balls.size < MAX_CONSECUTIVE;
  }

  drop(keyframes: Keyframe[], onComplete?: (id: number) => void): number {
    const id = this.nextId++;
    const sprite = new Graphics();
    sprite.circle(0, 0, 7).fill({ color: 0xff0000 });
    sprite.position.set(keyframes[0].x, keyframes[0].y);

    const trail = new Graphics();
    trail.visible = false;

    // Per-segment pacing: first segment (top → first peg) is longer for a
    // dramatic initial drop, then accelerate through subsequent peg-to-peg
    // segments.  The final segment (last peg → bucket) is moderate.
    const segmentMs = keyframes.slice(1).map((_, i) => {
      const total = keyframes.length - 1;
      if (i === 0) return 400; // dramatic initial drop
      if (i === total - 1) return 350; // final landing arc
      // Middle: slow near top, faster near bottom
      const progress = (i - 1) / Math.max(1, total - 2);
      return Math.round(380 - progress * 200); // 380ms → 180ms
    });

    const ball: Ball = {
      id,
      sprite,
      trail,
      keyframes,
      seg: 0,
      t: 0,
      scaleY: 1,
      done: false,
      fading: false,
      fadeMs: 0,
      holdMs: HOLD_AT_BUCKET_MS,
      segmentMs,
    };

    this.trailContainer.addChild(trail);
    this.container.addChild(sprite);
    this.balls.set(id, ball);

    if (onComplete) {
      const prev = this.callbacks.onComplete;
      this.callbacks.onComplete = (bid) => {
        if (bid === id) onComplete(id);
        prev?.(bid);
      };
    }

    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this.tick);
    }
    return id;
  }

  private tick = (now: number) => {
    const dt = Math.min(64, now - this.lastTime);
    this.lastTime = now;
    let anyAlive = false;

    for (const ball of this.balls.values()) {
      if (ball.done) {
        // Fade-out phase: decrement alpha, then clean up.
        if (ball.fading) {
          ball.fadeMs -= dt;
          ball.sprite.alpha = Math.max(0, ball.fadeMs / FADE_MS);
          if (ball.fadeMs <= 0) {
            ball.sprite.destroy();
            ball.trail.destroy();
            this.balls.delete(ball.id);
            this.callbacks.onComplete?.(ball.id);
            continue;
          }
        }
        anyAlive = true;
        continue;
      }
      this.advance(ball, dt);
      anyAlive = true;
    }

    if (anyAlive || this.balls.size > 0) {
      requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  private advance(ball: Ball, dt: number) {
    const kf = ball.keyframes;
    const seg = ball.seg;

    // Past all motion segments: hold at bucket, then fade.
    if (seg >= kf.length - 1) {
      if (ball.holdMs > 0) {
        ball.holdMs -= dt;
        return;
      }
      ball.done = true;
      ball.fading = true;
      ball.fadeMs = FADE_MS;
      ball.sprite.alpha = 1;
      ball.trail.clear();
      return;
    }

    ball.t += dt / ball.segmentMs[seg];
    if (ball.t >= 1) {
      ball.t = 1;
      ball.seg = seg + 1;
      ball.t = 0;

      // Fire onPegHit when arriving at a peg contact keyframe (not start or bucket).
      if (ball.seg > 0 && ball.seg < kf.length - 1) {
        this.callbacks.onPegHit?.(kf[ball.seg]);
      }
    }

    const a = kf[seg];
    const b = kf[seg + 1];
    const t = Math.min(1, ball.t);

    // Parabolic arc: x linear, y quadratic with gravity bulge.
    const dy = b.y - a.y;
    const gravity = Math.abs(dy) * GRAVITY_STRENGTH;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + dy * t + gravity * t * (t - 1); // bulges downward

    // Squash/stretch: stretch during freefall, squash briefly on peg contact.
    const segProgress = t;
    const isPegContact =
      ball.seg > 0 && ball.seg < kf.length - 1 && segProgress < 0.15;
    let targetScaleY: number;
    if (isPegContact) {
      targetScaleY = 0.7; // squash on impact
    } else {
      // Stretch proportional to vertical speed (faster = taller).
      const speed = Math.abs(dy) / ball.segmentMs[seg];
      targetScaleY = 1 + Math.min(0.2, speed * 0.015);
    }
    ball.scaleY += (targetScaleY - ball.scaleY) * 0.35;
    ball.sprite.scale.set(2 - ball.scaleY, ball.scaleY);
    ball.sprite.position.set(x, y);

    // Trail: fading ghosts behind the ball.
    if (seg < kf.length - 1) {
      const dx = b.x - a.x;
      const ddy = b.y - a.y;
      ball.trail.visible = true;
      ball.trail.clear();
      ball.trail
        .circle(x - dx * 0.05, y - ddy * 0.05, 5)
        .fill({ color: 0xff0000, alpha: 0.22 });
      ball.trail
        .circle(x - dx * 0.1, y - ddy * 0.1, 4)
        .fill({ color: 0xff0000, alpha: 0.1 });
    }
  }

  /** Remove every in-flight ball (e.g. config change / unmount). */
  clear() {
    for (const ball of this.balls.values()) {
      ball.sprite.destroy();
      ball.trail.destroy();
    }
    this.balls.clear();
    this.running = false;
  }
}
