import { Container, Graphics } from "pixi.js";

/**
 * Plinko ball manager.
 *
 * Owns the ball layer (and a trail layer beneath it), spawns balls that follow
 * a pre-computed trajectory, and animates them down the board with parabolic
 * arc interpolation, squash/stretch on each peg impact, and a fade-out after
 * landing.
 *
 * The trajectory keyframes are derived from the outcome path (peg-layout.ts),
 * so the visual drop is deterministic and matches what the program settled.
 *
 * Each ball is drawn as a glowing layered sphere in the site's mint accent —
 * a soft outer glow that stays circular, a shaded body that squashes on peg
 * contact, and a bright specular highlight.
 */

type Keyframe = { x: number; y: number };

type Ball = {
  id: number;
  sprite: Graphics; // body (squashes)
  glow: Graphics; // soft halo (stays round)
  trail: Graphics;
  keyframes: Keyframe[];
  seg: number; // current keyframe segment
  t: number; // progress within segment (0..1)
  scaleY: number;
  done: boolean;
  landed: boolean; // completion already reported on arrival
  fading: boolean;
  fadeMs: number; // remaining fade time
  holdMs: number; // hold at bucket before fade
  segmentMs: number[]; // per-segment duration (ms)
};

export type BallCallbacks = {
  onPegHit?: (peg: Keyframe) => void;
  onComplete?: (ballId: number) => void;
};

const HOLD_AT_BUCKET_MS = 200;
const FADE_MS = 300;
const GRAVITY_STRENGTH = 0.35; // parabolic arc intensity (positive = downward bulge)

const BALL_RADIUS = 7;
const BODY_COLOR = 0x00e096;
const BODY_EDGE_COLOR = 0x00b380;
const GLOW_COLOR = 0x00ffa3;

/** Draws the layered body of a ball centered on the origin. */
function buildBallSprite(): Graphics {
  const g = new Graphics();
  // Soft shaded rim (bottom-right) for volume.
  g.circle(1.4, 1.7, BALL_RADIUS * 0.98).fill({
    color: BODY_EDGE_COLOR,
    alpha: 0.9,
  });
  // Main body.
  g.circle(0, 0, BALL_RADIUS).fill({ color: BODY_COLOR });
  // Top-left inner light, then a crisp specular dot.
  g.circle(-1.6, -1.8, 3.1).fill({ color: 0x9effdd, alpha: 0.75 });
  g.circle(-2.2, -2.4, 1.4).fill({ color: 0xffffff, alpha: 0.95 });
  return g;
}

/** Draws the soft halo behind the ball, centered on the origin. */
function buildGlow(): Graphics {
  const g = new Graphics();
  g.circle(0, 0, BALL_RADIUS * 2.6).fill({ color: GLOW_COLOR, alpha: 0.12 });
  g.circle(0, 0, BALL_RADIUS * 1.7).fill({ color: GLOW_COLOR, alpha: 0.14 });
  return g;
}

export class BallManager {
  private container: Container;
  private trailContainer: Container;
  private balls = new Map<number, Ball>();
  /** Per-ball landing callbacks, dropped once fired or on clear(). */
  private landings = new Map<number, (id: number) => void>();
  private nextId = 1;
  private running: boolean = false;
  private frame: number | null = null;
  private lastTime = 0;
  private callbacks: BallCallbacks = {};

  constructor(parent: Container) {
    this.trailContainer = new Container();
    this.container = new Container();
    parent.addChild(this.trailContainer);
    parent.addChild(this.container);
  }

  setCallbacks(cb: BallCallbacks) {
    this.callbacks = cb;
  }

  get activeCount(): number {
    return this.balls.size;
  }

  drop(keyframes: Keyframe[], onComplete?: (id: number) => void): number {
    const id = this.nextId++;
    const sprite = buildBallSprite();
    const glow = buildGlow();
    const start = keyframes[0];
    sprite.position.set(start.x, start.y);
    glow.position.set(start.x, start.y);

    const trail = new Graphics();
    trail.visible = false;

    // Per-segment pacing: the opening drop and the final landing arc are the
    // two big travels; the middle peg-to-peg hops speed up toward the bottom
    // so the ball visibly accelerates, pachinko-style.
    const segmentMs = keyframes.slice(1).map((_, i) => {
      const total = keyframes.length - 1;
      if (i === 0) return 380; // opening drop
      if (i === total - 1) return 340; // final landing arc (slower + eased)
      const progress = (i - 1) / Math.max(1, total - 2);
      return Math.round(300 - progress * 130); // 300ms → 170ms
    });

    const ball: Ball = {
      id,
      sprite,
      glow,
      trail,
      keyframes,
      seg: 0,
      t: 0,
      scaleY: 1,
      done: false,
      landed: false,
      fading: false,
      fadeMs: 0,
      holdMs: HOLD_AT_BUCKET_MS,
      segmentMs,
    };

    this.trailContainer.addChild(trail);
    this.container.addChild(glow);
    this.container.addChild(sprite);
    this.balls.set(id, ball);

    if (onComplete) this.landings.set(id, onComplete);

    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
    return id;
  }

  private reportLanding(id: number) {
    const cb = this.landings.get(id);
    this.landings.delete(id);
    cb?.(id);
    this.callbacks.onComplete?.(id);
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
          const a = Math.max(0, ball.fadeMs / FADE_MS);
          ball.sprite.alpha = a;
          ball.glow.alpha = a;
          if (ball.fadeMs <= 0) {
            ball.sprite.destroy();
            ball.glow.destroy();
            ball.trail.destroy();
            this.balls.delete(ball.id);
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
      this.frame = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      this.frame = null;
    }
  };

  private advance(ball: Ball, dt: number) {
    const kf = ball.keyframes;
    const seg = ball.seg;

    // Past all motion segments: rest in the bucket, then fade.
    if (seg >= kf.length - 1) {
      // The comet trail is only for flight — drop it the instant the ball
      // arrives so no ghost discs linger beside/above the bucket.
      ball.trail.clear();
      ball.trail.visible = false;
      // Report the landing now (bucket celebration + result), while the ball
      // is still visible in its pocket.
      if (!ball.landed) {
        ball.landed = true;
        this.reportLanding(ball.id);
      }
      if (ball.holdMs > 0) {
        ball.holdMs -= dt;
        // The final arc decelerates, but ease out any residual squash so the
        // resting ball is perfectly round instead of freezing stretched.
        if (Math.abs(ball.scaleY - 1) > 0.001) {
          ball.scaleY += (1 - ball.scaleY) * Math.min(1, dt / 70);
          ball.sprite.scale.set(2 - ball.scaleY, ball.scaleY);
        }
        return;
      }
      ball.done = true;
      ball.fading = true;
      ball.fadeMs = FADE_MS;
      ball.sprite.alpha = 1;
      ball.glow.alpha = 1;
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
    const isLanding = seg === kf.length - 2;
    // Ease the last arc (last peg → bucket) out so the ball decelerates into
    // the pocket instead of arriving at full speed and freezing.
    const e = isLanding ? 1 - Math.pow(1 - t, 3) : t;

    // Parabolic arc: x linear, y quadratic with gravity bulge.
    const dy = b.y - a.y;
    const gravity = Math.abs(dy) * GRAVITY_STRENGTH;
    const x = a.x + (b.x - a.x) * e;
    const y = a.y + dy * e + gravity * e * (e - 1); // bulges downward

    // Squash/stretch: stretch during freefall, squash briefly on peg contact.
    const isPegContact = ball.seg > 0 && ball.seg < kf.length - 1 && t < 0.15;
    let targetScaleY: number;
    if (isPegContact) {
      targetScaleY = 0.62; // squash on impact
    } else if (isLanding) {
      targetScaleY = 1; // arrive round — the bucket does the catching
    } else {
      // Stretch proportional to vertical speed (faster = taller).
      const speed = Math.abs(dy) / ball.segmentMs[seg];
      targetScaleY = 1 + Math.min(0.22, speed * 0.015);
    }
    ball.scaleY += (targetScaleY - ball.scaleY) * 0.4;
    ball.sprite.scale.set(2 - ball.scaleY, ball.scaleY);
    ball.sprite.position.set(x, y);
    ball.glow.position.set(x, y);

    // Comet trail: fading ghost discs behind the ball.
    if (seg < kf.length - 1) {
      const dx = b.x - a.x;
      const ddy = b.y - a.y;
      ball.trail.visible = true;
      ball.trail.clear();
      ball.trail
        .circle(x - dx * 0.045, y - ddy * 0.045, BALL_RADIUS * 0.72)
        .fill({ color: GLOW_COLOR, alpha: 0.2 });
      ball.trail
        .circle(x - dx * 0.09, y - ddy * 0.09, BALL_RADIUS * 0.55)
        .fill({ color: GLOW_COLOR, alpha: 0.1 });
      ball.trail
        .circle(x - dx * 0.14, y - ddy * 0.14, BALL_RADIUS * 0.38)
        .fill({ color: GLOW_COLOR, alpha: 0.05 });
    }
  }

  /** Remove every in-flight ball (e.g. config change / unmount). */
  clear() {
    for (const ball of this.balls.values()) {
      ball.sprite.destroy();
      ball.glow.destroy();
      ball.trail.destroy();
    }
    this.balls.clear();
    this.landings.clear();
    // Cancel the queued frame too, or the next drop would start a second
    // loop alongside the old one and everything would run at double speed.
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.running = false;
  }
}
