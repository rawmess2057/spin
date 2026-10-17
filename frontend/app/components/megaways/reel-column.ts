import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import {
  COL_W,
  COL_H,
  REEL_TOP,
  cellCenterY,
  cellH,
  columnX,
  symbolScale,
} from "./board-layout";
import { Sequencer, inQuad, outBack, type Ease } from "./sequencer";
import { SYMBOL_COUNT } from "../../lib/solana/games/megaways";

/**
 * One Megaways reel.
 *
 * Owns a masked column: while spinning, a strip of motion-blurred symbols
 * scrolls down through the window; on `stopAt` the final symbols (at the
 * reel's new height) slide in from above with an overshoot and settle, while
 * the blur strip exits below. Cascades are expressed as the primitive steps
 * the stage sequences: `highlight` → `explode` → `collapse` → `refill`.
 *
 * Purely presentational: every symbol it shows comes from the evaluated
 * outcome, except the blur strip, whose contents are never read.
 */

export type SymbolTextures = {
  sharp: Texture[];
  blur: Texture[];
  glow: Texture;
};

export type BurstFn = (
  x: number,
  y: number,
  color: number,
  count: number
) => void;

const SPIN_SPEED = 2600; // px/s in design space
const STOP_MS = 460;
const ANTICIPATION_HOLD_MS = 520;
const ANTICIPATION_STRETCH = 1.7;

/** Gravity-ish fall with a small bounce at the end. */
const dropEase: Ease = (t) => {
  if (t < 0.72) {
    const u = t / 0.72;
    return u * u;
  }
  const u = (t - 0.72) / 0.28;
  return 1 - 0.07 * Math.sin(u * Math.PI) * (1 - u * 0.5);
};

export class ReelColumn {
  readonly container = new Container();
  readonly reelIndex: number;

  private readonly seq: Sequencer;
  private readonly textures: SymbolTextures;
  private readonly symbolColors: number[];
  private readonly glowLayer = new Container();
  private readonly symbolLayer = new Container();
  private readonly stripLayer = new Container();

  /** Sprites for the resting grid, index = row (0 = top). */
  private sprites: Sprite[] = [];
  private glows: Sprite[] = [];
  private height = 4;
  private symbols: number[] = [];

  private spinning = false;
  private stripOffset = 0;
  private stripSprites: Sprite[] = [];
  private stripCellH = 0;
  private spinTick = (dtMs: number) => this.advanceStrip(dtMs);

  constructor(
    parent: Container,
    reelIndex: number,
    textures: SymbolTextures,
    symbolColors: number[],
    seq: Sequencer
  ) {
    this.reelIndex = reelIndex;
    this.textures = textures;
    this.symbolColors = symbolColors;
    this.seq = seq;

    this.container.position.set(columnX(reelIndex), 0);
    const mask = new Graphics()
      .rect(-2, REEL_TOP, COL_W + 4, COL_H)
      .fill({ color: 0xffffff });
    this.container.addChild(mask);
    this.container.mask = mask;
    this.container.addChild(this.stripLayer, this.glowLayer, this.symbolLayer);
    parent.addChild(this.container);
  }

  get currentHeight(): number {
    return this.height;
  }

  get isSpinning(): boolean {
    return this.spinning;
  }

  // --- resting grid ---------------------------------------------------------

  private makeSprite(symbol: number, h: number): Sprite {
    const s = new Sprite(this.textures.sharp[symbol]);
    s.anchor.set(0.5);
    s.scale.set(symbolScale(h));
    s.position.x = COL_W / 2;
    return s;
  }

  private clearSprites(): void {
    for (const s of this.sprites) s.destroy();
    for (const g of this.glows) g.destroy();
    this.sprites = [];
    this.glows = [];
  }

  /** Places the given symbols at rest (idle / after a skip). */
  setStatic(symbols: number[], h: number): void {
    this.stopStrip();
    this.clearSprites();
    this.height = h;
    this.symbols = symbols.slice();
    for (let row = 0; row < h; row++) {
      const s = this.makeSprite(symbols[row], h);
      s.position.y = cellCenterY(row, h);
      this.symbolLayer.addChild(s);
      this.sprites.push(s);
    }
  }

  // --- spinning strip -------------------------------------------------------

  private buildStrip(h: number): void {
    for (const s of this.stripSprites) s.destroy();
    this.stripSprites = [];
    this.stripCellH = cellH(h);
    const count = h + 2;
    for (let i = 0; i < count; i++) {
      const sym = Math.floor(Math.random() * SYMBOL_COUNT);
      const s = new Sprite(this.textures.blur[sym]);
      s.anchor.set(0.5);
      s.scale.set(symbolScale(h));
      s.position.x = COL_W / 2;
      this.stripLayer.addChild(s);
      this.stripSprites.push(s);
    }
    this.stripOffset = 0;
    this.layoutStrip();
  }

  private layoutStrip(): void {
    const n = this.stripSprites.length;
    const period = n * this.stripCellH;
    for (let i = 0; i < n; i++) {
      const raw = (i * this.stripCellH + this.stripOffset) % period;
      this.stripSprites[i].position.y = REEL_TOP - this.stripCellH / 2 + raw;
    }
  }

  private advanceStrip(dtMs: number): void {
    if (!this.spinning) return;
    this.stripOffset += (SPIN_SPEED * dtMs) / 1000;
    this.layoutStrip();
  }

  /** Starts the blur strip scrolling; the resting symbols slide out below. */
  startSpin(): void {
    if (this.spinning) return;
    this.spinning = true;
    this.stripLayer.position.y = 0;
    this.stripLayer.alpha = 1;
    this.buildStrip(this.height);
    // The resting symbols drop away under the incoming strip.
    const old = this.sprites;
    const oldGlows = this.glows;
    this.sprites = [];
    this.glows = [];
    for (const g of oldGlows) g.destroy();
    const fall = old.map((s) =>
      this.seq.tween(s.position, { y: s.position.y + COL_H }, 260, inQuad)
    );
    void Promise.all(fall).then(() => {
      for (const s of old) s.destroy();
    });
    this.seq.onFrame(this.spinTick);
  }

  private stopStrip(): void {
    this.spinning = false;
    this.seq.offFrame(this.spinTick);
    for (const s of this.stripSprites) s.destroy();
    this.stripSprites = [];
  }

  /**
   * Lands the reel on `symbols` at height `h`. Resolves at the moment of
   * impact so the stop sound can sync. With `anticipation` the reel hangs and
   * lands slowly — pure theatre, the outcome is already fixed.
   */
  async stopAt(
    symbols: number[],
    h: number,
    opts: { anticipation?: boolean } = {}
  ): Promise<void> {
    if (!this.spinning) {
      this.setStatic(symbols, h);
      return;
    }
    if (opts.anticipation) await this.seq.wait(ANTICIPATION_HOLD_MS);

    const stretch = opts.anticipation ? ANTICIPATION_STRETCH : 1;
    const ms = STOP_MS * stretch;

    // Final symbols enter from above while the blur strip exits below.
    const landing = new Container();
    landing.position.y = -COL_H;
    this.symbolLayer.addChild(landing);
    const incoming: Sprite[] = [];
    for (let row = 0; row < h; row++) {
      const s = this.makeSprite(symbols[row], h);
      s.texture = this.textures.blur[symbols[row]];
      s.position.y = cellCenterY(row, h);
      landing.addChild(s);
      incoming.push(s);
    }

    let sharpened = false;
    const slideIn = this.seq.tween(
      landing.position,
      { y: 0 },
      ms,
      outBack(0.9),
      (p) => {
        if (!sharpened && p > 0.62) {
          sharpened = true;
          for (let row = 0; row < h; row++) {
            incoming[row].texture = this.textures.sharp[symbols[row]];
          }
        }
      }
    );
    const slideOut = this.seq.tween(
      this.stripLayer.position,
      { y: COL_H },
      ms * 0.8,
      inQuad
    );
    await Promise.all([slideIn, slideOut]);

    this.stopStrip();
    // Re-parent the landed sprites into the flat symbol layer.
    this.height = h;
    this.symbols = symbols.slice();
    this.clearSprites();
    for (const s of incoming) {
      landing.removeChild(s);
      s.position.y = cellCenterY(incoming.indexOf(s), h);
      this.symbolLayer.addChild(s);
      this.sprites.push(s);
    }
    landing.destroy();
  }

  // --- cascade primitives ---------------------------------------------------

  /** Pulses the winning cells and lights a glow behind each. */
  highlight(rows: number[]): Promise<void> {
    const h = this.height;
    const base = symbolScale(h);
    const jobs: Promise<void>[] = [];
    for (const row of rows) {
      const s = this.sprites[row];
      if (!s) continue;
      const glow = new Sprite(this.textures.glow);
      glow.anchor.set(0.5);
      glow.tint = this.symbolColors[this.symbols[row]] ?? 0xffffff;
      glow.blendMode = "add";
      glow.alpha = 0;
      const size = Math.min(COL_W, cellH(h)) * 1.05;
      glow.width = size;
      glow.height = size;
      glow.position.set(COL_W / 2, s.position.y);
      this.glowLayer.addChild(glow);
      this.glows.push(glow);
      jobs.push(this.seq.tween(glow, { alpha: 0.95 }, 140));
      jobs.push(
        this.seq
          .tween(s.scale, { x: base * 1.16, y: base * 1.16 }, 170, outBack(1.2))
          .then(() => this.seq.tween(s.scale, { x: base, y: base }, 160))
      );
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /** Shrinks and pops the winning cells away, bursting particles. */
  explode(rows: number[], burst: BurstFn): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const row of rows) {
      const s = this.sprites[row];
      if (!s) continue;
      const color = this.symbolColors[this.symbols[row]] ?? 0xffffff;
      burst(
        this.container.position.x + COL_W / 2,
        s.position.y,
        color,
        Math.max(5, Math.round(10 * symbolScale(this.height) * 2))
      );
      jobs.push(this.seq.tween(s.scale, { x: 0.01, y: 0.01 }, 190, inQuad));
      jobs.push(this.seq.tween(s, { alpha: 0 }, 190));
    }
    for (const g of this.glows) jobs.push(this.seq.tween(g, { alpha: 0 }, 160));
    return Promise.all(jobs).then(() => {
      for (const row of rows) {
        const s = this.sprites[row];
        if (s) s.destroy();
      }
      for (const g of this.glows) g.destroy();
      this.glows = [];
      // Keep the array shape; removed rows become holes until `collapse`.
      for (const row of rows) delete this.sprites[row];
    });
  }

  /**
   * Lets the survivors fall into the removed rows (they drop as far as the
   * number of removed cells below them). Updates the row bookkeeping.
   */
  collapse(removedRows: number[]): Promise<void> {
    const h = this.height;
    const removed = new Set(removedRows);
    const survivors: { sprite: Sprite; from: number; to: number }[] = [];
    const removedBelow = (row: number) => {
      let n = 0;
      for (const r of removed) if (r > row) n++;
      return n;
    };
    for (let row = 0; row < h; row++) {
      if (removed.has(row)) continue;
      const s = this.sprites[row];
      if (!s) continue;
      survivors.push({ sprite: s, from: row, to: row + removedBelow(row) });
    }
    const jobs = survivors.map(({ sprite, from, to }) => {
      if (from === to) return Promise.resolve();
      const dist = to - from;
      return this.seq.tween(
        sprite.position,
        { y: cellCenterY(to, h) },
        150 + 80 * dist,
        dropEase
      );
    });

    const next: Sprite[] = new Array(h);
    const nextSymbols: number[] = new Array(h).fill(-1);
    for (const { sprite, from, to } of survivors) {
      next[to] = sprite;
      nextSymbols[to] = this.symbols[from];
    }
    this.sprites = next;
    this.symbols = nextSymbols;
    return Promise.all(jobs).then(() => undefined);
  }

  /** Drops `fresh` new symbols into the vacated top rows, top first. */
  refill(fresh: number[]): Promise<void> {
    const h = this.height;
    const n = fresh.length;
    const jobs: Promise<void>[] = [];
    for (let row = 0; row < n; row++) {
      const s = this.makeSprite(fresh[row], h);
      const target = cellCenterY(row, h);
      s.position.y = target - (n + 0.5) * cellH(h);
      this.symbolLayer.addChild(s);
      this.sprites[row] = s;
      this.symbols[row] = fresh[row];
      const dist = n + 0.5;
      jobs.push(
        this.seq
          .wait((n - 1 - row) * 45)
          .then(() =>
            this.seq.tween(s.position, { y: target }, 170 + 70 * dist, dropEase)
          )
      );
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /** Y (design space) of a row's centre, for effects positioned by the stage. */
  rowCenterY(row: number): number {
    return cellCenterY(row, this.height);
  }

  destroy(): void {
    this.stopStrip();
    this.container.destroy({ children: true });
  }
}
