import { Application, Container, Graphics, Text } from "pixi.js";
import { outCubic, Sequencer } from "../megaways/sequencer";
import { WHEEL_SEGMENTS } from "../../lib/solana/games/wheel";

/**
 * Pixi scene for the Spin Wheel. Pure presentation: `spinTo(segment)` only
 * ever lands on the segment the evaluator picked.
 *
 * Design space is a 720×720 square; the container is scaled to fit the
 * canvas. Segment 0 sits under the pointer (top centre) at rotation 0 and
 * segments run clockwise.
 */

export const WHEEL_DESIGN = 720;
const R = 300; // wheel radius
const STEP = (Math.PI * 2) / WHEEL_SEGMENTS;
const IDLE_SPEED = (Math.PI * 2 * 1.4) / 1000; // rad per ms while waiting
const LAND_MS = 3400;
const LAND_MS_TURBO = 1500;
const EXTRA_TURNS = 3;

export type WheelCallbacks = {
  /** The pointer passed a segment boundary (tick sound). */
  onTick?: (segment: number) => void;
  /** The wheel came to rest on `segment`. */
  onLand?: (segment: number) => void;
};

/** Segment colours by multiplier, in 0.01× units. */
function segmentColor(mult: number, max: number): number {
  if (mult === 0) return 0x171a2b;
  if (mult === max && max >= 500) return 0xff4d5e; // top prize
  if (mult >= 300) return 0xffc057; // gold
  if (mult >= 200) return 0x9945ff; // accent purple
  return 0x00c98a; // small win, mint
}

export class WheelStage {
  private readonly app: Application;
  private readonly seq: Sequencer;
  private readonly root = new Container();
  private readonly wheel = new Container();
  private readonly segmentsLayer = new Container();
  private readonly pointer = new Graphics();
  private readonly highlight = new Graphics();
  private readonly fontFamily?: string;
  private table: readonly number[] = new Array(WHEEL_SEGMENTS).fill(0);
  private idle = false;
  private landing = false;
  private lastTickSegment = -1;
  private turbo = false;
  private destroyed = false;

  constructor(app: Application, opts: { fontFamily?: string } = {}) {
    this.app = app;
    this.fontFamily = opts.fontFamily;
    this.seq = new Sequencer(app.ticker);
    app.stage.addChild(this.root);
    this.root.addChild(this.wheel);
    this.wheel.addChild(this.segmentsLayer);
    this.wheel.addChild(this.highlight);
    this.drawChrome();
    this.root.addChild(this.pointer);
    this.seq.onFrame(this.frame);
    this.resize();
  }

  // --- drawing ---------------------------------------------------------------

  private drawChrome(): void {
    // Rim with alternating "bulbs".
    const rim = new Graphics();
    rim.circle(0, 0, R + 26).fill({ color: 0x0b0d16 });
    rim.circle(0, 0, R + 26).stroke({ color: 0x2b2f45, width: 4 });
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      rim.circle(Math.cos(a) * (R + 14), Math.sin(a) * (R + 14), 4).fill({
        color: i % 2 === 0 ? 0xffe3a1 : 0x00ffa3,
        alpha: 0.9,
      });
    }
    this.wheel.addChildAt(rim, 0);

    // Pointer: a down-pointing triangle just inside the rim at the top.
    this.pointer
      .poly([-20, -R - 48, 20, -R - 48, 0, -R + 2])
      .fill({ color: 0xffffff })
      .stroke({ color: 0x0b0d16, width: 3 });
    this.pointer.circle(0, -R - 50, 10).fill({ color: 0xffc057 });
  }

  /** Redraws the segments for a multiplier table (0.01× units). */
  setTable(table: readonly number[]): void {
    this.table = table;
    this.segmentsLayer.removeChildren().forEach((c) => c.destroy());
    const max = Math.max(...table);
    for (let i = 0; i < WHEEL_SEGMENTS; i++) {
      // Segment i is centred on angle i*STEP measured clockwise from the
      // pointer (which sits at -90°).
      const a0 = -Math.PI / 2 + i * STEP - STEP / 2;
      const a1 = a0 + STEP;
      const g = new Graphics();
      g.moveTo(0, 0)
        .arc(0, 0, R, a0, a1)
        .closePath()
        .fill({ color: segmentColor(table[i], max) })
        .stroke({ color: 0x0b0d16, width: 3 });
      this.segmentsLayer.addChild(g);

      const label = new Text({
        text:
          table[i] === 0
            ? ""
            : `${(table[i] / 100).toFixed(2).replace(/\.?0+$/, "")}×`,
        style: {
          fontFamily: this.fontFamily ?? "Oswald, sans-serif",
          fontSize: table[i] >= 1000 ? 30 : 24,
          fontWeight: "700",
          fill: table[i] === 0 ? 0x5b6078 : 0x0b0d16,
        },
      });
      label.anchor.set(0.5);
      const mid = -Math.PI / 2 + i * STEP;
      label.position.set(Math.cos(mid) * R * 0.74, Math.sin(mid) * R * 0.74);
      label.rotation = mid + Math.PI / 2;
      this.segmentsLayer.addChild(label);
    }
    // Hub.
    const hub = new Graphics();
    hub.circle(0, 0, 54).fill({ color: 0x0b0d16 });
    hub.circle(0, 0, 54).stroke({ color: 0xffc057, width: 4 });
    hub.circle(0, 0, 22).fill({ color: 0xffc057 });
    this.segmentsLayer.addChild(hub);
    this.highlight.clear();
  }

  resize(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const s = Math.min(w, h) / WHEEL_DESIGN;
    this.root.scale.set(s);
    this.root.position.set(w / 2, h / 2 + 14 * s);
  }

  setTurbo(on: boolean): void {
    this.turbo = on;
  }

  setReducedMotion(on: boolean): void {
    this.seq.instant = on;
  }

  // --- motion ----------------------------------------------------------------

  /** Segment currently under the pointer for a given wheel rotation. */
  private segmentAt(rotation: number): number {
    const turn = Math.PI * 2;
    const a = (((-rotation + STEP / 2) % turn) + turn) % turn;
    return Math.floor(a / STEP) % WHEEL_SEGMENTS;
  }

  private frame = (dtMs: number): void => {
    if (this.idle && !this.landing) {
      this.wheel.rotation += IDLE_SPEED * dtMs;
      this.checkTick();
    }
  };

  private checkTick(): void {
    const seg = this.segmentAt(this.wheel.rotation);
    if (seg !== this.lastTickSegment) {
      this.lastTickSegment = seg;
      this.kickPointer();
      this.cb?.onTick?.(seg);
    }
  }

  private cb: WheelCallbacks | null = null;

  private kickPointer(): void {
    this.pointer.rotation = -0.12;
    void this.seq.tween(this.pointer, { rotation: 0 }, 140, outCubic);
  }

  /** Starts the idle spin while the bet is in flight. */
  spinUp(cb?: WheelCallbacks): void {
    if (this.destroyed) return;
    this.cb = cb ?? this.cb;
    this.highlight.clear();
    this.idle = true;
    this.lastTickSegment = this.segmentAt(this.wheel.rotation);
  }

  /** Decelerates onto `segment` and resolves when the wheel is at rest. */
  async spinTo(segment: number, cb: WheelCallbacks): Promise<void> {
    if (this.destroyed) return;
    this.cb = cb;
    this.landing = true;
    this.idle = false;
    const turn = Math.PI * 2;
    const current = this.wheel.rotation;
    // Rotation that puts `segment` under the pointer, plus a little jitter
    // inside the segment so the needle doesn't always stop dead centre.
    const jitter = (Math.random() - 0.5) * STEP * 0.6;
    const base = -segment * STEP + jitter;
    const ahead = (((base - current) % turn) + turn) % turn;
    const target = current + ahead + (this.turbo ? 1 : EXTRA_TURNS) * turn;
    const ms = this.turbo ? LAND_MS_TURBO : LAND_MS;
    await this.seq.tween(this.wheel, { rotation: target }, ms, outCubic, () =>
      this.checkTick()
    );
    this.landing = false;
    if (this.destroyed) return;
    this.flashSegment(segment);
    cb.onLand?.(segment);
  }

  private flashSegment(segment: number): void {
    const a0 = -Math.PI / 2 + segment * STEP - STEP / 2;
    this.highlight
      .clear()
      .moveTo(0, 0)
      .arc(0, 0, R, a0, a0 + STEP)
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.55 });
    this.highlight.alpha = 1;
    void this.seq.tween(this.highlight, { alpha: 0.25 }, 900, outCubic);
  }

  skip(): void {
    this.seq.skip();
    this.seq.endSkip();
  }

  reset(): void {
    this.idle = false;
    this.landing = false;
    this.highlight.clear();
  }

  destroy(): void {
    this.destroyed = true;
    this.seq.offFrame(this.frame);
    this.seq.destroy();
    this.root.destroy({ children: true });
  }
}
