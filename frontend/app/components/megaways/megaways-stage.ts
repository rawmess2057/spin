import {
  Application,
  Container,
  Graphics,
  ImageSource,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import {
  BOARD_H,
  BOARD_W,
  COL_W,
  FRAME_PAD,
  HEADER_H,
  REEL_BOTTOM,
  REEL_TOP,
  TEX_SIZE,
  columnX,
} from "./board-layout";
import { ReelColumn, type SymbolTextures } from "./reel-column";
import { Sequencer, inQuad, outBack, outCubic } from "./sequencer";
import { SYMBOL_COLORS, symbolDataUrl } from "./symbol-art";
import {
  REELS,
  SYMBOL_COUNT,
  SYM,
  waysCount,
  type CascadeStep,
  type Grid,
  type MegawaysOutcome,
  type SpinRound,
} from "../../lib/solana/games/megaways";
import { winTier, MEGAWAYS_SCALE, type WinTier } from "../../lib/win-tiers";

/**
 * The Megaways scene: cabinet, six reels, ways counter, multiplier badge,
 * particles and floating win text — plus the choreography that replays a
 * precomputed `MegawaysOutcome` step by step.
 *
 * Pure presentation. The stage never decides anything about the result; it
 * reads the outcome's recorded grids, removals and refills and animates them
 * in order. Callbacks let the page layer sounds and DOM overlays on top.
 */

export type StageCallbacks = {
  onReelStop?: (reel: number, scattersSoFar: number) => void;
  onScatterLand?: (count: number) => void;
  onStepWin?: (
    round: SpinRound,
    step: CascadeStep,
    runningTotalBp: bigint
  ) => void;
  onTumble?: () => void;
  onRoundStart?: (round: SpinRound, index: number, total: number) => void;
  onMultiplierUp?: (multiplier: number) => void;
  onFreeSpinsTriggered?: (count: number) => Promise<void> | void;
  onFreeSpinsRetrigger?: (added: number) => void;
  onFreeSpinsEnd?: (totalBp: bigint) => Promise<void> | void;
  onBigWin?: (tier: WinTier, totalBp: bigint) => Promise<void> | void;
  onComplete?: (outcome: MegawaysOutcome) => void;
  /** Formats a bp win for the floating text (the stage doesn't know the bet). */
  formatWin?: (bp: bigint) => string;
};

type Particle = {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  spin: number;
};

const STOP_STAGGER_MS = 115;
const TURBO_SPEED = 2.6;
const MIN_VISIBLE_SPIN_MS = 520;
const FREE_SPIN_SPINUP_MS = 620;
const MAX_PARTICLES = 90;
const FONT_FALLBACK = "Impact, 'Arial Black', 'Helvetica Neue', sans-serif";

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export class MegawaysStage {
  private readonly app: Application;
  private readonly seq: Sequencer;
  private readonly root = new Container();
  private readonly reelLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly uiLayer = new Container();
  private columns: ReelColumn[] = [];
  private textures: SymbolTextures | null = null;
  private particleTexture: Texture | null = null;
  private particles: Particle[] = [];
  private particlePool: Sprite[] = [];
  private symbolColors = SYMBOL_COLORS.map(hexToInt);
  private displayFont: string;

  private waysText!: Text;
  private waysLabel!: Text;
  private multText!: Text;
  private multBadge!: Container;
  private roundText!: Text;
  private banner!: Container;
  private bannerText!: Text;

  private ready = false;
  private destroyed = false;
  private spinStartedAt = 0;
  private turbo = false;
  private playing: Promise<void> | null = null;
  private pendingOutcome: {
    outcome: MegawaysOutcome;
    cb: StageCallbacks;
  } | null = null;
  private lastGrid: Grid | null = null;
  private waysCounter = { v: 0 };
  private particleTick = (dt: number) => this.updateParticles(dt);

  constructor(app: Application, opts: { fontFamily?: string } = {}) {
    this.app = app;
    this.displayFont = opts.fontFamily
      ? `${opts.fontFamily}, ${FONT_FALLBACK}`
      : FONT_FALLBACK;
    this.seq = new Sequencer(app.ticker);
    app.stage.addChild(this.root);
  }

  // --- lifecycle ------------------------------------------------------------

  async init(): Promise<void> {
    const sharp: Texture[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      const img = new Image();
      img.src = symbolDataUrl(s, TEX_SIZE * 2);
      await img.decode();
      if (this.destroyed) return;
      const source = new ImageSource({
        resource: img,
        resolution: 2,
        autoGenerateMipmaps: true,
      });
      sharp.push(new Texture({ source }));
    }

    // Motion blur: three ghost copies stretched vertically, baked once.
    const blur: Texture[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      const c = new Container();
      for (const [dy, a, sy] of [
        [-26, 0.3, 1.25],
        [0, 0.55, 1.15],
        [26, 0.3, 1.25],
      ] as const) {
        const sp = new Sprite(sharp[s]);
        sp.anchor.set(0.5);
        sp.position.set(TEX_SIZE / 2, TEX_SIZE / 2 + dy);
        sp.scale.set(1, sy);
        sp.alpha = a;
        c.addChild(sp);
      }
      // Fixed frame so blur and sharp textures share the same centre/size.
      const frame = new Graphics()
        .rect(0, -40, TEX_SIZE, TEX_SIZE + 80)
        .fill({ color: 0xffffff, alpha: 0 });
      c.addChildAt(frame, 0);
      blur.push(
        this.app.renderer.generateTexture({ target: c, resolution: 1 })
      );
      c.destroy({ children: true });
    }

    // Soft square glow for winning cells (tinted per symbol at use).
    const glowG = new Graphics();
    for (let i = 0; i < 7; i++) {
      const inset = i * 8;
      glowG
        .roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, 28 - i * 2)
        .fill({ color: 0xffffff, alpha: 0.16 });
    }
    const glow = this.app.renderer.generateTexture({ target: glowG });
    glowG.destroy();

    const pg = new Graphics().circle(6, 6, 6).fill({ color: 0xffffff });
    this.particleTexture = this.app.renderer.generateTexture({ target: pg });
    pg.destroy();

    if (this.destroyed) return;
    this.textures = { sharp, blur, glow };
    this.buildScene();
    this.seq.onFrame(this.particleTick);
    this.ready = true;
    this.resize();

    if (this.pendingOutcome) {
      const p = this.pendingOutcome;
      this.pendingOutcome = null;
      void this.playOutcome(p.outcome, p.cb);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.seq.offFrame(this.particleTick);
    this.seq.destroy();
    for (const c of this.columns) c.destroy();
    this.columns = [];
    for (const p of this.particles) p.sprite.destroy();
    this.particles = [];
    for (const sprite of this.particlePool) sprite.destroy();
    this.particlePool = [];
    if (this.textures) {
      for (const t of this.textures.blur) t.destroy(true);
      for (const t of this.textures.sharp) t.destroy(true);
      this.textures.glow.destroy(true);
      this.textures = null;
    }
    this.particleTexture?.destroy(true);
    this.root.destroy({ children: true });
  }

  // --- scene ----------------------------------------------------------------

  private buildScene(): void {
    const textures = this.textures!;
    const cabinet = new Graphics();
    // Outer frame.
    cabinet
      .roundRect(
        -FRAME_PAD,
        -FRAME_PAD,
        BOARD_W + FRAME_PAD * 2,
        BOARD_H + FRAME_PAD * 2,
        26
      )
      .fill({ color: 0x1a1426 })
      .stroke({ color: 0x9945ff, width: 2, alpha: 0.55 });
    cabinet
      .roundRect(
        -FRAME_PAD + 3,
        -FRAME_PAD + 3,
        BOARD_W + FRAME_PAD * 2 - 6,
        BOARD_H + FRAME_PAD * 2 - 6,
        23
      )
      .stroke({ color: 0xffd700, width: 1.5, alpha: 0.35 });
    // Reel well.
    cabinet
      .roundRect(
        -6,
        REEL_TOP - 6,
        BOARD_W + 12,
        REEL_BOTTOM - REEL_TOP + 12,
        14
      )
      .fill({ color: 0x07070d });
    for (let r = 0; r < REELS; r++) {
      const x = columnX(r);
      cabinet.rect(x, REEL_TOP, COL_W, REEL_BOTTOM - REEL_TOP).fill({
        color: r % 2 === 0 ? 0x11111c : 0x0d0d17,
      });
      // Top/bottom vignette bands so the window reads as a drum.
      for (let i = 0; i < 6; i++) {
        const a = 0.22 - i * 0.035;
        cabinet
          .rect(x, REEL_TOP + i * 9, COL_W, 9)
          .fill({ color: 0x000000, alpha: a });
        cabinet
          .rect(x, REEL_BOTTOM - (i + 1) * 9, COL_W, 9)
          .fill({ color: 0x000000, alpha: a });
      }
    }
    this.root.addChild(cabinet);

    this.root.addChild(this.reelLayer, this.fxLayer, this.uiLayer);

    for (let r = 0; r < REELS; r++) {
      this.columns.push(
        new ReelColumn(this.reelLayer, r, textures, this.symbolColors, this.seq)
      );
    }

    // Header: ways counter (left), round label (centre), multiplier (right).
    this.waysText = new Text({
      text: "0",
      style: {
        fontFamily: this.displayFont,
        fontSize: 40,
        fill: 0xffd700,
        letterSpacing: 1,
        dropShadow: { color: 0xffa500, blur: 10, distance: 0, alpha: 0.6 },
      },
    });
    this.waysText.anchor.set(0, 0.5);
    this.waysText.position.set(6, HEADER_H / 2 - 2);
    this.waysLabel = new Text({
      text: "WAYS TO WIN",
      style: {
        fontFamily: this.displayFont,
        fontSize: 15,
        fill: 0xa0a0b0,
        letterSpacing: 3,
      },
    });
    this.waysLabel.anchor.set(0, 0.5);
    this.waysLabel.position.set(6, HEADER_H / 2 + 2);

    this.roundText = new Text({
      text: "",
      style: {
        fontFamily: this.displayFont,
        fontSize: 22,
        fill: 0x00ffa3,
        letterSpacing: 3,
      },
    });
    this.roundText.anchor.set(0.5);
    this.roundText.position.set(BOARD_W / 2, HEADER_H / 2 - 2);

    this.multBadge = new Container();
    const badgeBg = new Graphics()
      .roundRect(-62, -24, 124, 48, 24)
      .fill({ color: 0x9945ff })
      .stroke({ color: 0xffd700, width: 2 });
    this.multText = new Text({
      text: "x1",
      style: {
        fontFamily: this.displayFont,
        fontSize: 30,
        fill: 0xffffff,
        letterSpacing: 1,
      },
    });
    this.multText.anchor.set(0.5);
    this.multBadge.addChild(badgeBg, this.multText);
    this.multBadge.position.set(BOARD_W - 66, HEADER_H / 2 - 2);
    this.multBadge.visible = false;

    this.banner = new Container();
    const bannerBg = new Graphics()
      .roundRect(-250, -46, 500, 92, 20)
      .fill({ color: 0x000000, alpha: 0.78 })
      .stroke({ color: 0xffd700, width: 3 });
    this.bannerText = new Text({
      text: "",
      style: {
        fontFamily: this.displayFont,
        fontSize: 44,
        fill: 0xffd700,
        letterSpacing: 4,
        dropShadow: { color: 0xff6b35, blur: 14, distance: 0, alpha: 0.8 },
      },
    });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(bannerBg, this.bannerText);
    this.banner.position.set(BOARD_W / 2, (REEL_TOP + REEL_BOTTOM) / 2);
    this.banner.visible = false;

    this.uiLayer.addChild(
      this.waysText,
      this.waysLabel,
      this.roundText,
      this.multBadge,
      this.banner
    );
    this.layoutWays();

    // Idle grid: a pleasant, non-winning arrangement so the board isn't empty.
    const idle: Grid = {
      heights: [3, 4, 5, 5, 4, 3],
      cells: [
        [SYM.H4, SYM.L1, SYM.H2],
        [SYM.L3, SYM.H1, SYM.L5, SYM.L2],
        [SYM.L6, SYM.L2, SYM.H3, SYM.L4, SYM.L1],
        [SYM.L4, SYM.L5, SYM.WILD, SYM.H2, SYM.L3],
        [SYM.H1, SYM.L6, SYM.L2, SYM.L5],
        [SYM.L2, SYM.H4, SYM.L4],
      ],
    };
    this.showGrid(idle);
  }

  private layoutWays(): void {
    // Big number sits above the small label, both left aligned in the header.
    this.waysText.position.set(6, HEADER_H / 2 - 12);
    this.waysLabel.position.set(8, HEADER_H / 2 + 20);
  }

  private showGrid(grid: Grid): void {
    for (let r = 0; r < REELS; r++) {
      this.columns[r].setStatic(grid.cells[r], grid.heights[r]);
    }
    this.lastGrid = grid;
    this.setWays(waysCount(grid), false);
  }

  private setWays(n: number, animate: boolean): void {
    if (!animate) {
      this.waysCounter.v = n;
      this.waysText.text = n.toLocaleString("en-US");
      return;
    }
    let frame = 0;
    void this.seq.tween(this.waysCounter, { v: n }, 520, outCubic, () => {
      if (frame++ % 2 === 0 || this.waysCounter.v === n) {
        this.waysText.text = Math.round(this.waysCounter.v).toLocaleString(
          "en-US"
        );
      }
    });
  }

  /** Fits the design-space board into the renderer's current size. */
  resize(): void {
    if (!this.ready) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const fullW = BOARD_W + FRAME_PAD * 2;
    const fullH = BOARD_H + FRAME_PAD * 2;
    const scale = Math.min(w / fullW, h / fullH);
    this.root.scale.set(scale);
    this.root.position.set(
      (w - BOARD_W * scale) / 2,
      (h - BOARD_H * scale) / 2
    );
  }

  setTurbo(on: boolean): void {
    this.turbo = on;
    this.seq.speed = on ? TURBO_SPEED : 1;
  }

  setReducedMotion(on: boolean): void {
    this.seq.instant = on;
  }

  /** Fast-forwards the current spin to its final state. */
  skip(): void {
    if (this.playing) this.seq.skip();
  }

  /** Returns the board to the last resting grid (e.g. after a failed bet). */
  reset(): void {
    if (!this.ready || this.playing) return;
    if (this.lastGrid) this.showGrid(this.lastGrid);
  }

  // --- choreography ---------------------------------------------------------

  /** All reels start spinning. Safe to call before the outcome is known. */
  spinUp(): void {
    if (!this.ready || this.playing) return;
    this.spinStartedAt = performance.now();
    this.banner.visible = false;
    for (const c of this.columns) c.startSpin();
  }

  /** Replays the outcome. Resolves after `onComplete`. */
  playOutcome(outcome: MegawaysOutcome, cb: StageCallbacks): Promise<void> {
    if (!this.ready) {
      this.pendingOutcome = { outcome, cb };
      return Promise.resolve();
    }
    if (this.playing) return this.playing;
    const run = this.run(outcome, cb).finally(() => {
      this.seq.endSkip();
      this.playing = null;
    });
    this.playing = run;
    return run;
  }

  private async run(o: MegawaysOutcome, cb: StageCallbacks): Promise<void> {
    if (!this.columns[0].isSpinning) this.spinUp();
    const sinceSpin = performance.now() - this.spinStartedAt;
    if (sinceSpin < MIN_VISIBLE_SPIN_MS) {
      await this.seq.wait(MIN_VISIBLE_SPIN_MS - sinceSpin);
    }

    let total = 0n;
    const totalRounds = 1 + o.freeSpins.length;

    cb.onRoundStart?.(o.base, 0, totalRounds);
    total = await this.playRound(o.base, total, cb, false);

    if (o.base.freeSpinsAwarded > 0 && o.freeSpins.length > 0) {
      await this.seq.wait(350);
      await this.flashBanner(`${o.base.freeSpinsAwarded} FREE SPINS`, 900);
      if (this.seq.isSkipping)
        void cb.onFreeSpinsTriggered?.(o.base.freeSpinsAwarded);
      else await cb.onFreeSpinsTriggered?.(o.base.freeSpinsAwarded);

      let spinsTotal = o.base.freeSpinsAwarded;
      this.multBadge.visible = true;
      this.setMultiplier(1, false);
      for (let i = 0; i < o.freeSpins.length; i++) {
        const round = o.freeSpins[i];
        this.roundText.text = `FREE SPIN ${i + 1} / ${spinsTotal}`;
        cb.onRoundStart?.(round, i + 1, totalRounds);
        this.spinStartedAt = performance.now();
        for (const c of this.columns) c.startSpin();
        await this.seq.wait(this.turbo ? 260 : FREE_SPIN_SPINUP_MS);
        total = await this.playRound(round, total, cb, true);
        if (round.freeSpinsAwarded > 0) {
          spinsTotal += round.freeSpinsAwarded;
          cb.onFreeSpinsRetrigger?.(round.freeSpinsAwarded);
          await this.flashBanner(`+${round.freeSpinsAwarded} FREE SPINS`, 700);
        }
        if (o.capped && total >= o.totalWinBp) break;
      }
      this.roundText.text = "";
      this.multBadge.visible = false;
      if (this.seq.isSkipping) void cb.onFreeSpinsEnd?.(o.totalWinBp);
      else await cb.onFreeSpinsEnd?.(o.totalWinBp);
    }

    if (o.capped) {
      await this.flashBanner("MAX WIN", 1400);
    }
    const tier = winTier(o.totalWinBp, MEGAWAYS_SCALE);
    if (tier === "big" || tier === "huge" || tier === "jackpot") {
      await cb.onBigWin?.(tier, o.totalWinBp);
    }
    cb.onComplete?.(o);
  }

  private async playRound(
    round: SpinRound,
    totalIn: bigint,
    cb: StageCallbacks,
    free: boolean
  ): Promise<bigint> {
    let total = totalIn;
    const first = round.steps[0].grid;
    await this.stopReels(first, cb);
    this.lastGrid = round.finalGrid;

    for (let i = 0; i < round.steps.length; i++) {
      const step = round.steps[i];
      if (step.wins.length === 0) break;
      total += step.stepWinBp;

      // Highlight all winning cells, then show the step's win.
      const rowsByReel = this.rowsByReel(step.removed);
      await Promise.all(
        rowsByReel.map((rows, r) => this.columns[r].highlight(rows))
      );
      cb.onStepWin?.(round, step, total);
      this.floatWin(cb.formatWin?.(step.stepWinBp) ?? `+${step.stepWinBp}`);
      await this.seq.wait(420);

      const tumbles = step.refill.some((f) => f.length > 0);
      if (!tumbles) {
        // Cascade cap or max win: the grid stays, just dim the glow. The
        // evaluator still counts this winning step toward the free-spin
        // multiplier, so the badge must advance to `multiplierAfter`.
        if (free) {
          const nextMult = step.multiplier + 1;
          this.setMultiplier(nextMult, true);
          cb.onMultiplierUp?.(nextMult);
        }
        break;
      }

      await Promise.all(
        rowsByReel.map((rows, r) =>
          this.columns[r].explode(rows, (x, y, color, n) =>
            this.burst(x, y, color, n)
          )
        )
      );
      cb.onTumble?.();
      await Promise.all(
        rowsByReel.map((rows, r) => this.columns[r].collapse(rows))
      );
      await Promise.all(
        step.refill.map((fresh, r) => this.columns[r].refill(fresh))
      );

      if (free) {
        const nextMult = step.multiplier + 1;
        this.setMultiplier(nextMult, true);
        cb.onMultiplierUp?.(nextMult);
      }
      await this.seq.wait(120);
    }
    return total;
  }

  private rowsByReel(positions: [number, number][]): number[][] {
    const out: number[][] = Array.from({ length: REELS }, () => []);
    for (const [r, row] of positions) out[r].push(row);
    return out;
  }

  /** Staggered reel stops with scatter anticipation. */
  private async stopReels(grid: Grid, cb: StageCallbacks): Promise<void> {
    let scatters = 0;
    for (let r = 0; r < REELS; r++) {
      const remaining = REELS - 1 - r;
      // Theatre only: hang when a trigger is still reachable with 2+ seen.
      const anticipate =
        scatters >= 2 && scatters < 4 && scatters + remaining >= 4 && r >= 2;
      const stop = this.columns[r].stopAt(grid.cells[r], grid.heights[r], {
        anticipation: anticipate,
      });
      if (r < REELS - 1) {
        await this.seq.wait(this.turbo ? 45 : STOP_STAGGER_MS);
      }
      await stop;
      const here = grid.cells[r].filter((c) => c === SYM.SCATTER).length;
      scatters += here;
      cb.onReelStop?.(r, scatters);
      if (here > 0) cb.onScatterLand?.(scatters);
    }
    this.setWays(waysCount(grid), true);
  }

  private setMultiplier(m: number, pop: boolean): void {
    this.multText.text = `x${m}`;
    if (!pop) {
      this.multBadge.scale.set(1);
      return;
    }
    void this.seq
      .tween(this.multBadge.scale, { x: 1.28, y: 1.28 }, 150, outBack(1.5))
      .then(() => this.seq.tween(this.multBadge.scale, { x: 1, y: 1 }, 180));
  }

  private floatWin(text: string): void {
    const t = new Text({
      text,
      style: {
        fontFamily: this.displayFont,
        fontSize: 54,
        fill: 0xffffff,
        stroke: { color: 0x9945ff, width: 6 },
        letterSpacing: 2,
        dropShadow: { color: 0x000000, blur: 8, distance: 3, alpha: 0.7 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(BOARD_W / 2, (REEL_TOP + REEL_BOTTOM) / 2 + 30);
    t.scale.set(0.4);
    t.alpha = 0;
    this.fxLayer.addChild(t);
    void this.seq
      .all(
        this.seq.tween(t.scale, { x: 1, y: 1 }, 260, outBack(1.3)),
        this.seq.tween(t, { alpha: 1 }, 140)
      )
      .then(() =>
        this.seq.all(
          this.seq.tween(t.position, { y: t.position.y - 90 }, 560, outCubic),
          this.seq.wait(260).then(() => this.seq.tween(t, { alpha: 0 }, 300))
        )
      )
      .then(() => t.destroy());
  }

  private async flashBanner(text: string, holdMs: number): Promise<void> {
    this.bannerText.text = text;
    this.banner.visible = true;
    this.banner.alpha = 0;
    this.banner.scale.set(0.6);
    await this.seq.all(
      this.seq.tween(this.banner, { alpha: 1 }, 160),
      this.seq.tween(this.banner.scale, { x: 1, y: 1 }, 320, outBack(1.4))
    );
    await this.seq.wait(holdMs);
    await this.seq.tween(this.banner, { alpha: 0 }, 220, inQuad);
    this.banner.visible = false;
  }

  // --- particles ------------------------------------------------------------

  private burst(x: number, y: number, color: number, count: number): void {
    if (!this.particleTexture || this.seq.instant) return;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const sprite =
        this.particlePool.pop() ?? new Sprite(this.particleTexture);
      sprite.anchor.set(0.5);
      sprite.tint = color;
      sprite.alpha = 1;
      const size = 0.5 + Math.random() * 0.9;
      sprite.scale.set(size);
      sprite.position.set(x, y);
      this.fxLayer.addChild(sprite);
      const angle = Math.random() * Math.PI * 2;
      const speed = 220 + Math.random() * 380;
      this.particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 160,
        life: 0,
        ttl: 420 + Math.random() * 300,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  private updateParticles(dtMs: number): void {
    if (this.particles.length === 0) return;
    const dt = dtMs / 1000;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += dtMs;
      if (p.life >= p.ttl) {
        this.fxLayer.removeChild(p.sprite);
        this.particlePool.push(p.sprite);
        continue;
      }
      p.vy += 1500 * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      const t = p.life / p.ttl;
      p.sprite.alpha = 1 - t * t;
      keep.push(p);
    }
    this.particles = keep;
  }
}
