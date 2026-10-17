import {
  Application,
  Container,
  Graphics,
  ImageSource,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { inQuad, outBack, Sequencer } from "../megaways/sequencer";
import {
  COIN_VALUE_BP,
  COIN_MAJOR_INDEX,
  COIN_MINOR_INDEX,
  HS,
  PAYLINES,
  REELS,
  ROWS,
  SYMBOL_COUNT,
  type Bonus,
  type HoldSpinOutcome,
  type LineWin,
  type Respin,
} from "../../lib/solana/games/hold-spin";
import { SYMBOL_COLORS, symbolDataUrl } from "./hold-spin-art";

/**
 * Pixi scene for Dragon's Vault. Pure presentation of a recorded outcome:
 * reels stop on the base grid, winning lines light up, and if the bonus
 * triggered the coins lock while the other cells flip through the respins.
 */

export const CELL = 100;
export const GAP = 6;
export const HEADER_H = 64;
export const FOOT_H = 16;
export const BOARD_W = REELS * CELL + (REELS - 1) * GAP; // 524
export const BOARD_H = HEADER_H + ROWS * CELL + FOOT_H; // 380
export const FRAME_PAD = 14;
const TEX = 160;
const SPIN_SPEED = 2400; // px/s
const STOP_MS = 420;
const STOP_STAGGER_MS = 120;
const FONT_FALLBACK = "Impact, 'Arial Black', 'Helvetica Neue', sans-serif";

export type StageCallbacks = {
  onReelStop?: (reel: number, coinsSoFar: number) => void;
  onCoinLand?: (count: number) => void;
  onLineWin?: (win: LineWin, runningBp: bigint) => void;
  onBonusStart?: (coins: number) => Promise<void> | void;
  onRespin?: (respin: Respin, coins: number) => void;
  onBonusEnd?: (bonus: Bonus) => Promise<void> | void;
  onComplete?: (outcome: HoldSpinOutcome) => void;
  formatWin?: (bp: bigint) => string;
};

type Textures = {
  sharp: Texture[];
  blur: Texture[];
  glow: Texture;
  blank: Texture;
};

const hexToInt = (h: string) => parseInt(h.replace("#", ""), 16);

function cellX(reel: number): number {
  return reel * (CELL + GAP);
}
function cellY(row: number): number {
  return HEADER_H + row * CELL;
}

/** A 3-row reel: a scrolling blur strip while spinning, then a landing. */
class Reel {
  readonly container = new Container();
  private readonly symbolLayer = new Container();
  private readonly stripLayer = new Container();
  private sprites: Sprite[] = [];
  private stripSprites: Sprite[] = [];
  private spinning = false;
  private stripOffset = 0;
  private tick = (dt: number) => {
    this.stripOffset = (this.stripOffset + (SPIN_SPEED * dt) / 1000) % CELL;
    this.layoutStrip();
  };

  constructor(
    parent: Container,
    readonly index: number,
    private readonly tex: Textures,
    private readonly seq: Sequencer
  ) {
    this.container.position.set(cellX(index), 0);
    const mask = new Graphics()
      .rect(-2, HEADER_H, CELL + 4, ROWS * CELL)
      .fill({ color: 0xffffff });
    this.container.addChild(mask);
    this.container.mask = mask;
    this.container.addChild(this.stripLayer, this.symbolLayer);
    parent.addChild(this.container);
  }

  private make(symbol: number, blur = false): Sprite {
    const s = new Sprite(blur ? this.tex.blur[symbol] : this.tex.sharp[symbol]);
    s.anchor.set(0.5);
    s.width = CELL * 0.86;
    s.height = CELL * 0.86;
    s.position.x = CELL / 2;
    return s;
  }

  setStatic(symbols: number[]): void {
    this.stopStrip();
    for (const s of this.sprites) s.destroy();
    this.sprites = symbols.map((sym, row) => {
      const s = this.make(sym);
      s.position.y = cellY(row) + CELL / 2;
      this.symbolLayer.addChild(s);
      return s;
    });
  }

  /** Sprite for a row, or null. */
  sprite(row: number): Sprite | null {
    return this.sprites[row] ?? null;
  }

  private layoutStrip(): void {
    this.stripSprites.forEach((s, i) => {
      s.position.y = cellY(-1) + CELL / 2 + i * CELL + this.stripOffset;
    });
  }

  startSpin(): void {
    if (this.spinning) return;
    this.spinning = true;
    for (let i = 0; i < ROWS + 2; i++) {
      const s = this.make((i * 7 + this.index * 3) % SYMBOL_COUNT, true);
      this.stripLayer.addChild(s);
      this.stripSprites.push(s);
    }
    this.layoutStrip();
    const old = this.sprites;
    this.sprites = [];
    void Promise.all(
      old.map((s) =>
        this.seq.tween(
          s.position,
          { y: s.position.y + ROWS * CELL },
          240,
          inQuad
        )
      )
    ).then(() => old.forEach((s) => s.destroy()));
    this.seq.onFrame(this.tick);
  }

  private stopStrip(): void {
    this.spinning = false;
    this.seq.offFrame(this.tick);
    for (const s of this.stripSprites) s.destroy();
    this.stripSprites = [];
  }

  async stopAt(symbols: number[], anticipation = false): Promise<void> {
    if (!this.spinning) {
      this.setStatic(symbols);
      return;
    }
    if (anticipation) await this.seq.wait(480);
    const landing = new Container();
    landing.position.y = -ROWS * CELL;
    this.symbolLayer.addChild(landing);
    const incoming = symbols.map((sym, row) => {
      const s = this.make(sym, true);
      s.position.y = cellY(row) + CELL / 2;
      landing.addChild(s);
      return s;
    });
    const ms = anticipation ? STOP_MS * 1.6 : STOP_MS;
    let sharpened = false;
    await this.seq.tween(landing.position, { y: 0 }, ms, outBack(0.9), (t) => {
      if (!sharpened && t > 0.7) {
        sharpened = true;
        incoming.forEach(
          (s, row) => (s.texture = this.tex.sharp[symbols[row]])
        );
      }
    });
    this.stopStrip();
    incoming.forEach((s) => {
      s.texture =
        this.tex.sharp[symbols[s.parent === landing ? incoming.indexOf(s) : 0]];
      landing.removeChild(s);
      this.symbolLayer.addChild(s);
    });
    landing.destroy();
    this.sprites = incoming;
  }

  /** Flips a cell to a new symbol (bonus respin). */
  async flip(row: number, symbol: number | null): Promise<void> {
    const s = this.sprites[row];
    if (!s) return;
    await this.seq.tween(s.scale, { x: 0 }, 140, inQuad);
    s.texture = symbol == null ? this.tex.blank : this.tex.sharp[symbol];
    s.width = CELL * 0.86;
    s.height = CELL * 0.86;
    const sx = s.scale.y;
    s.scale.x = 0;
    await this.seq.tween(s.scale, { x: sx }, 160, outBack(1.1));
  }

  destroy(): void {
    this.stopStrip();
    this.container.destroy({ children: true });
  }
}

export class HoldSpinStage {
  private readonly app: Application;
  private readonly seq: Sequencer;
  private readonly root = new Container();
  private readonly reelLayer = new Container();
  private readonly lineLayer = new Graphics();
  private readonly glowLayer = new Container();
  private readonly coinLayer = new Container();
  private readonly uiLayer = new Container();
  private reels: Reel[] = [];
  private tex: Textures | null = null;
  private ready = false;
  private destroyed = false;
  private turbo = false;
  private displayFont: string;
  private titleText!: Text;
  private winText!: Text;
  private banner!: Container;
  private bannerText!: Text;
  private coinLabels = new Map<string, Container>();
  private pending: { outcome: HoldSpinOutcome; cb: StageCallbacks } | null =
    null;
  private spinStartedAt = 0;

  constructor(app: Application, opts: { fontFamily?: string } = {}) {
    this.app = app;
    this.displayFont = opts.fontFamily
      ? `${opts.fontFamily}, ${FONT_FALLBACK}`
      : FONT_FALLBACK;
    this.seq = new Sequencer(app.ticker);
    app.stage.addChild(this.root);
  }

  async init(): Promise<void> {
    const sharp: Texture[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      const img = new Image();
      img.src = symbolDataUrl(s, TEX * 2);
      await img.decode();
      if (this.destroyed) return;
      sharp.push(
        new Texture({
          source: new ImageSource({
            resource: img,
            resolution: 2,
            autoGenerateMipmaps: true,
          }),
        })
      );
    }
    const blur: Texture[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      const c = new Container();
      const frame = new Graphics()
        .rect(0, -40, TEX, TEX + 80)
        .fill({ color: 0xffffff, alpha: 0 });
      c.addChild(frame);
      for (const [dy, a, sy] of [
        [-24, 0.3, 1.2],
        [0, 0.55, 1.1],
        [24, 0.3, 1.2],
      ] as const) {
        const sp = new Sprite(sharp[s]);
        sp.anchor.set(0.5);
        sp.position.set(TEX / 2, TEX / 2 + dy);
        sp.scale.set(1, sy);
        sp.alpha = a;
        c.addChild(sp);
      }
      blur.push(
        this.app.renderer.generateTexture({ target: c, resolution: 1 })
      );
      c.destroy({ children: true });
    }
    const glowG = new Graphics();
    for (let i = 0; i < 7; i++) {
      const inset = i * 8;
      glowG
        .roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, 28 - i * 2)
        .fill({ color: 0xffffff, alpha: 0.16 });
    }
    const glow = this.app.renderer.generateTexture({ target: glowG });
    glowG.destroy();
    const blankG = new Graphics()
      .roundRect(4, 4, TEX - 8, TEX - 8, 22)
      .fill({ color: 0x14172a })
      .stroke({ color: 0x2b2f45, width: 4 });
    const blank = this.app.renderer.generateTexture({ target: blankG });
    blankG.destroy();
    if (this.destroyed) return;
    this.tex = { sharp, blur, glow, blank };
    this.buildScene();
    this.ready = true;
    this.resize();
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      void this.playOutcome(p.outcome, p.cb);
    }
  }

  private buildScene(): void {
    const tex = this.tex!;
    // Cabinet.
    const frame = new Graphics()
      .roundRect(
        -FRAME_PAD,
        -FRAME_PAD,
        BOARD_W + FRAME_PAD * 2,
        BOARD_H + FRAME_PAD * 2,
        24
      )
      .fill({ color: 0x0b0d16 })
      .stroke({ color: 0x3a2a08, width: 4 });
    this.root.addChild(frame);
    for (let r = 0; r < REELS; r++) {
      const col = new Graphics()
        .roundRect(cellX(r), HEADER_H, CELL, ROWS * CELL, 14)
        .fill({ color: 0x151827 })
        .stroke({ color: 0x2b2f45, width: 2 });
      this.root.addChild(col);
    }
    this.root.addChild(
      this.reelLayer,
      this.glowLayer,
      this.lineLayer,
      this.coinLayer,
      this.uiLayer
    );
    this.reels = [];
    for (let r = 0; r < REELS; r++) {
      const reel = new Reel(this.reelLayer, r, tex, this.seq);
      reel.setStatic([HS.TEN + (r % 5), HS.LANTERN + (r % 3), HS.COIN]);
      this.reels.push(reel);
    }
    this.titleText = new Text({
      text: "DRAGON'S VAULT",
      style: {
        fontFamily: this.displayFont,
        fontSize: 26,
        fill: 0xffc057,
        letterSpacing: 4,
      },
    });
    this.titleText.anchor.set(0, 0.5);
    this.titleText.position.set(4, HEADER_H / 2);
    this.winText = new Text({
      text: "",
      style: { fontFamily: this.displayFont, fontSize: 28, fill: 0x00ffa3 },
    });
    this.winText.anchor.set(1, 0.5);
    this.winText.position.set(BOARD_W - 4, HEADER_H / 2);
    this.uiLayer.addChild(this.titleText, this.winText);

    this.banner = new Container();
    const bg = new Graphics()
      .roundRect(-BOARD_W / 2 + 20, -40, BOARD_W - 40, 80, 20)
      .fill({ color: 0x0b0d16, alpha: 0.92 })
      .stroke({ color: 0xffc057, width: 3 });
    this.bannerText = new Text({
      text: "",
      style: {
        fontFamily: this.displayFont,
        fontSize: 40,
        fill: 0xffd700,
        letterSpacing: 3,
      },
    });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(bg, this.bannerText);
    this.banner.position.set(BOARD_W / 2, HEADER_H + (ROWS * CELL) / 2);
    this.banner.visible = false;
    this.uiLayer.addChild(this.banner);
  }

  resize(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const s = Math.min(
      w / (BOARD_W + FRAME_PAD * 2),
      h / (BOARD_H + FRAME_PAD * 2)
    );
    this.root.scale.set(s);
    this.root.position.set((w - BOARD_W * s) / 2, (h - BOARD_H * s) / 2);
  }

  setTurbo(on: boolean): void {
    this.turbo = on;
    this.seq.speed = on ? 2.4 : 1;
  }
  setReducedMotion(on: boolean): void {
    this.seq.instant = on;
  }

  // --- choreography ----------------------------------------------------------

  spinUp(): void {
    if (!this.ready) return;
    this.clearDecor();
    this.winText.text = "";
    this.spinStartedAt = performance.now();
    for (const r of this.reels) r.startSpin();
  }

  private clearDecor(): void {
    this.lineLayer.clear();
    this.glowLayer.removeChildren().forEach((c) => c.destroy());
    this.coinLabels.forEach((c) => c.destroy());
    this.coinLabels.clear();
    this.coinLayer.removeChildren();
  }

  private coinLabel(reel: number, row: number, valueIndex: number): void {
    const key = `${reel}:${row}`;
    this.coinLabels.get(key)?.destroy();
    const c = new Container();
    const isJackpot = valueIndex >= COIN_MINOR_INDEX;
    const text = isJackpot
      ? valueIndex === COIN_MAJOR_INDEX
        ? "MAJOR"
        : "MINOR"
      : `${(COIN_VALUE_BP[valueIndex] / 10_000).toFixed(0)}×`;
    const t = new Text({
      text,
      style: {
        fontFamily: this.displayFont,
        fontSize: isJackpot ? 20 : 30,
        fill: isJackpot ? 0xfff2b3 : 0x3a2a08,
        stroke: { color: isJackpot ? 0x7a1e1e : 0xfff2b3, width: 3 },
      },
    });
    t.anchor.set(0.5);
    c.addChild(t);
    c.position.set(cellX(reel) + CELL / 2, cellY(row) + CELL / 2 + 4);
    c.scale.set(0);
    this.coinLayer.addChild(c);
    this.coinLabels.set(key, c);
    void this.seq.tween(c.scale, { x: 1, y: 1 }, 220, outBack(1.4));
  }

  private glowCell(reel: number, row: number, color: number): void {
    const g = new Sprite(this.tex!.glow);
    g.anchor.set(0.5);
    g.tint = color;
    g.blendMode = "add";
    g.width = CELL * 1.05;
    g.height = CELL * 1.05;
    g.alpha = 0;
    g.position.set(cellX(reel) + CELL / 2, cellY(row) + CELL / 2);
    this.glowLayer.addChild(g);
    void this.seq.tween(g, { alpha: 0.9 }, 140);
  }

  private drawLine(win: LineWin, color: number): void {
    const line = PAYLINES[win.line];
    const pts = line.map((row, r) => ({
      x: cellX(r) + CELL / 2,
      y: cellY(row) + CELL / 2,
    }));
    this.lineLayer.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++)
      this.lineLayer.lineTo(pts[i].x, pts[i].y);
    this.lineLayer.stroke({
      color,
      width: 5,
      alpha: 0.85,
      cap: "round",
      join: "round",
    });
  }

  private async flashBanner(text: string, holdMs: number): Promise<void> {
    this.bannerText.text = text;
    this.banner.visible = true;
    this.banner.alpha = 0;
    this.banner.scale.set(0.8);
    await this.seq.all(
      this.seq.tween(this.banner, { alpha: 1 }, 180),
      this.seq.tween(this.banner.scale, { x: 1, y: 1 }, 320, outBack(1.3))
    );
    await this.seq.wait(holdMs);
    await this.seq.tween(this.banner, { alpha: 0 }, 220, inQuad);
    this.banner.visible = false;
  }

  async playOutcome(o: HoldSpinOutcome, cb: StageCallbacks): Promise<void> {
    if (!this.ready) {
      this.pending = { outcome: o, cb };
      return;
    }
    const fmt = cb.formatWin ?? ((bp: bigint) => `${bp}`);
    // Let the reels show visibly before stopping.
    const elapsed = performance.now() - this.spinStartedAt;
    if (elapsed < 450 && !this.seq.instant) await this.seq.wait(450 - elapsed);

    // 1. Stop reels left to right; hang when a bonus is still on the cards.
    let coins = 0;
    for (let r = 0; r < REELS; r++) {
      const col = o.base.cells[r];
      const coinsAhead = o.base.cells
        .slice(r)
        .flat()
        .filter((s) => s === HS.COIN).length;
      const anticipation =
        r >= 3 && coins >= 3 && coins + coinsAhead >= 6 && !this.turbo;
      await this.reels[r].stopAt(col, anticipation);
      for (let row = 0; row < ROWS; row++) {
        if (col[row] === HS.COIN) {
          coins++;
          this.coinLabel(r, row, o.base.coinValue[r][row]);
          cb.onCoinLand?.(coins);
        }
      }
      cb.onReelStop?.(r, coins);
      if (r < REELS - 1) await this.seq.wait(this.turbo ? 50 : STOP_STAGGER_MS);
    }

    // 2. Line wins.
    let running = 0n;
    const palette = [0x00ffa3, 0xffc057, 0x9945ff, 0xff4d5e, 0x60a5fa];
    for (let i = 0; i < o.lineWins.length; i++) {
      const w = o.lineWins[i];
      running += w.payBp;
      const color = palette[i % palette.length];
      this.drawLine(w, color);
      for (const [r, row] of w.positions) {
        this.glowCell(r, row, hexToInt(SYMBOL_COLORS[w.symbol]));
        const s = this.reels[r].sprite(row);
        if (s) {
          const base = s.scale.x;
          void this.seq
            .tween(
              s.scale,
              { x: base * 1.14, y: base * 1.14 },
              160,
              outBack(1.2)
            )
            .then(() => this.seq.tween(s.scale, { x: base, y: base }, 160));
        }
      }
      this.winText.text = fmt(running);
      cb.onLineWin?.(w, running);
      await this.seq.wait(this.turbo ? 120 : 360);
    }

    // 3. Bonus.
    if (o.bonus) {
      const b = o.bonus;
      await this.seq.wait(300);
      await this.flashBanner("HOLD & SPIN", 900);
      if (this.seq.isSkipping) void cb.onBonusStart?.(coins);
      else await cb.onBonusStart?.(coins);
      // Blank every non-coin cell.
      await Promise.all(
        this.reels.flatMap((reel, r) =>
          Array.from({ length: ROWS }, (_, row) =>
            o.base.cells[r][row] === HS.COIN
              ? Promise.resolve()
              : reel.flip(row, null)
          )
        )
      );
      let locked = coins;
      for (const respin of b.respins) {
        this.titleText.text = `RESPINS LEFT: ${respin.respinsLeft}`;
        const flips = respin.revealed.map(async (cell) => {
          await this.seq.wait(Math.random() * (this.turbo ? 60 : 160));
          await this.reels[cell.reel].flip(
            cell.row,
            cell.coinValue >= 0 ? HS.COIN : null
          );
          if (cell.coinValue >= 0) {
            locked++;
            this.coinLabel(cell.reel, cell.row, cell.coinValue);
            this.glowCell(cell.reel, cell.row, 0xffd700);
            cb.onCoinLand?.(locked);
          }
        });
        await Promise.all(flips);
        cb.onRespin?.(respin, locked);
        await this.seq.wait(this.turbo ? 160 : 420);
      }
      if (b.grand) await this.flashBanner("GRAND JACKPOT", 1500);
      this.titleText.text = "DRAGON'S VAULT";
      this.winText.text = fmt(o.totalWinBp);
      if (this.seq.isSkipping) void cb.onBonusEnd?.(b);
      else await cb.onBonusEnd?.(b);
    }

    if (o.capped) await this.flashBanner("MAX WIN", 1200);
    cb.onComplete?.(o);
  }

  skip(): void {
    this.seq.skip();
    this.seq.endSkip();
  }

  reset(): void {
    this.clearDecor();
    this.winText.text = "";
    this.titleText.text = "DRAGON'S VAULT";
    for (const r of this.reels) r.setStatic([HS.TEN, HS.LANTERN, HS.ACE]);
  }

  destroy(): void {
    this.destroyed = true;
    this.seq.destroy();
    for (const r of this.reels) r.destroy();
    this.reels = [];
    if (this.tex) {
      for (const t of this.tex.sharp) t.destroy(true);
      for (const t of this.tex.blur) t.destroy(true);
      this.tex.glow.destroy(true);
      this.tex.blank.destroy(true);
      this.tex = null;
    }
    this.root.destroy({ children: true });
  }
}
