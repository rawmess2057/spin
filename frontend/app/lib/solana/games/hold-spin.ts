import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Dragon's Vault — a 5×3 Hold & Spin slot. Client-side evaluator and the
 * specification for programs/spin/src/games/hold_spin.rs (byte-for-byte).
 *
 * Base game: 20 fixed paylines, left to right, 3+ of a kind. Wilds (reels
 * 2–4 only) substitute for every paying symbol. COINs don't pay on lines;
 * each one that lands carries a value drawn from `COIN_VALUE_BP`, and six or
 * more on the base grid trigger the bonus.
 *
 * Bonus (Hold & Spin): the coins lock in place, every other cell respins
 * showing either a new COIN (which locks and resets the respin counter to
 * `RESPINS`) or a blank. The bonus ends when the counter hits zero, the grid
 * is full of coins (GRAND, a fixed jackpot on top), or `MAX_RESPINS_TOTAL`
 * respins have been played (bounds the compute). It pays the sum of every
 * coin value.
 *
 * All quantities are integers; pays are bp of the total bet; the draw order
 * is part of the spec (see `drawBase` / `playBonus`).
 */

export const GAME_HOLD_SPIN = 10;
export const REELS = 5;
export const ROWS = 3;
export const CELLS = REELS * ROWS;

export const SYMBOL_COUNT = 10;
export const HS = {
  WILD: 0,
  TEN: 1,
  JACK: 2,
  QUEEN: 3,
  KING: 4,
  ACE: 5,
  LANTERN: 6,
  TIGER: 7,
  DRAGON: 8,
  COIN: 9,
} as const;
export type HoldSpinSymbol = (typeof HS)[keyof typeof HS];

export const SYMBOL_NAMES: readonly string[] = [
  "Wild",
  "Ten",
  "Jack",
  "Queen",
  "King",
  "Ace",
  "Lantern",
  "Tiger",
  "Dragon",
  "Coin",
];

/** Symbol weights per reel, [reel][symbol]; every row sums to 1000. */
export const SYMBOL_WEIGHT_TOTAL = 1000;
const OUTER: readonly number[] = [0, 135, 135, 125, 120, 110, 100, 80, 65, 130];
const INNER: readonly number[] = [40, 135, 130, 125, 115, 105, 95, 70, 55, 130];
export const SYMBOL_WEIGHTS: readonly (readonly number[])[] = [
  OUTER,
  INNER,
  INNER,
  INNER,
  OUTER,
];

/**
 * Coin values in bp of the total bet, drawn with `COIN_VALUE_WEIGHTS`
 * (sums to 1000). The last two are the MINOR and MAJOR jackpots.
 */
export const COIN_VALUE_BP: readonly number[] = [
  10_000, 20_000, 30_000, 50_000, 100_000, 150_000, 250_000, 500_000, 1_000_000,
  2_500_000,
];
export const COIN_VALUE_WEIGHTS: readonly number[] = [
  480, 250, 130, 70, 35, 18, 9, 5, 2, 1,
];
export const COIN_VALUE_WEIGHT_TOTAL = 1000;
export const COIN_MINOR_INDEX = 8;
export const COIN_MAJOR_INDEX = 9;
/** GRAND: every one of the 15 cells holds a coin. Paid on top of the coins. */
export const GRAND_BP = 10_000_000; // 1,000×

/** Coins on the base grid needed to start the bonus. */
export const BONUS_TRIGGER_COINS = 6;
/** Respins granted on trigger and after every new coin. */
export const RESPINS = 3;
/** Hard cap on respins in one bonus (bounds the compute). */
export const MAX_RESPINS_TOTAL = 40;
/** Chance a respun cell shows a coin: weight out of 1000. */
export const BONUS_COIN_WEIGHT = 65;
export const BONUS_WEIGHT_TOTAL = 1000;

/** Hard cap on the total win: 5,000× the bet, in bp. */
export const MAX_WIN_BP = 50_000_000n;

/**
 * Line pays in bp of the total bet, [symbol][count - 3] for 3, 4, 5 of a
 * kind. Scaled by the sim to land the RTP; WILD and COIN rows are zero.
 */
export const LINE_PAYS: readonly (readonly number[])[] = [
  [0, 0, 0], // WILD
  [7800, 19600, 58800], // TEN
  [7800, 19600, 58800], // JACK
  [9800, 22900, 78400], // QUEEN
  [9800, 22900, 78400], // KING
  [11750, 30000, 98000], // ACE
  [19600, 58800, 195950], // LANTERN
  [26100, 98000, 313550], // TIGER
  [39150, 156750, 587900], // DRAGON
  [0, 0, 0], // COIN
];

/** 20 fixed paylines: row index per reel (0 = top). */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 0, 2, 0],
];

// ---------------------------------------------------------------------------
// Randomness stream (identical to Megaways: sha256 counter mode)
// ---------------------------------------------------------------------------

export class RngStream {
  private readonly seed: Uint8Array;
  private block = new Uint8Array(0);
  private view = new DataView(new ArrayBuffer(0));
  private offset = 32;
  private counter = 0;
  blocksUsed = 0;

  constructor(seed: Uint8Array) {
    this.seed = seed;
  }

  private refill(): void {
    const input = new Uint8Array(this.seed.length + 4);
    input.set(this.seed, 0);
    const c = this.counter;
    input[this.seed.length] = c & 0xff;
    input[this.seed.length + 1] = (c >>> 8) & 0xff;
    input[this.seed.length + 2] = (c >>> 16) & 0xff;
    input[this.seed.length + 3] = (c >>> 24) & 0xff;
    this.block = sha256(input);
    this.view = new DataView(
      this.block.buffer,
      this.block.byteOffset,
      this.block.byteLength
    );
    this.offset = 0;
    this.counter += 1;
    this.blocksUsed += 1;
  }

  nextU32(): number {
    if (this.offset + 4 > this.block.length) this.refill();
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  nextBelow(n: number): number {
    return this.nextU32() % n;
  }

  pickWeighted(weights: readonly number[], total: number): number {
    let x = this.nextBelow(total);
    for (let i = 0; i < weights.length; i++) {
      if (x < weights[i]) return i;
      x -= weights[i];
    }
    return weights.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** `cells[reel][row]`; `coinValue[reel][row]` is an index into COIN_VALUE_BP or -1. */
export type BaseGrid = {
  cells: number[][];
  coinValue: number[][];
};

export type LineWin = {
  line: number;
  symbol: number;
  count: number;
  payBp: bigint;
  /** [reel, row] of the paying cells. */
  positions: [number, number][];
};

export type Respin = {
  /** Cells that were respun this time and what they showed: coin value index or -1. */
  revealed: { reel: number; row: number; coinValue: number }[];
  /** Respins left after this one. */
  respinsLeft: number;
};

export type Bonus = {
  /** Locked coins after the bonus, as value indices (-1 = no coin). */
  coins: number[][];
  respins: Respin[];
  coinCount: number;
  grand: boolean;
  /** Σ coin values (+ GRAND). */
  bonusWinBp: bigint;
  capped: boolean;
};

export type HoldSpinOutcome = {
  base: BaseGrid;
  lineWins: LineWin[];
  linesWinBp: bigint;
  bonus: Bonus | null;
  totalWinBp: bigint;
  multiplierBp: bigint;
  payout: bigint;
  capped: boolean;
  rngBlocksUsed: number;
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Reel 0..4, row 0..2; a COIN draws its value right away. */
export function drawBase(rng: RngStream): BaseGrid {
  const cells: number[][] = [];
  const coinValue: number[][] = [];
  for (let r = 0; r < REELS; r++) {
    const col: number[] = [];
    const vals: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      const s = rng.pickWeighted(SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
      col.push(s);
      vals.push(
        s === HS.COIN
          ? rng.pickWeighted(COIN_VALUE_WEIGHTS, COIN_VALUE_WEIGHT_TOTAL)
          : -1
      );
    }
    cells.push(col);
    coinValue.push(vals);
  }
  return { cells, coinValue };
}

/** Left-to-right line evaluation; wilds substitute for the first paying symbol. */
export function evaluateLines(grid: BaseGrid): LineWin[] {
  const wins: LineWin[] = [];
  for (let li = 0; li < PAYLINES.length; li++) {
    const line = PAYLINES[li];
    // The line's symbol is the first non-wild it shows; a line starting
    // with wilds on reel 0 can't exist (no wilds on the outer reels).
    const first = grid.cells[0][line[0]];
    if (first === HS.COIN) continue;
    let count = 0;
    const positions: [number, number][] = [];
    for (let r = 0; r < REELS; r++) {
      const c = grid.cells[r][line[r]];
      if (c === first || c === HS.WILD) {
        count++;
        positions.push([r, line[r]]);
      } else break;
    }
    if (count < 3) continue;
    const payBp = BigInt(LINE_PAYS[first][count - 3]);
    if (payBp === 0n) continue;
    wins.push({ line: li, symbol: first, count, payBp, positions });
  }
  return wins;
}

export function countCoins(grid: BaseGrid): number {
  let n = 0;
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++)
      if (grid.cells[r][row] === HS.COIN) n++;
  }
  return n;
}

/** Hold & Spin: lock the base coins, respin the rest until the counter runs out. */
export function playBonus(rng: RngStream, base: BaseGrid): Bonus {
  const coins: number[][] = base.coinValue.map((col) => col.slice());
  let coinCount = countCoins(base);
  let respinsLeft = RESPINS;
  let played = 0;
  const respins: Respin[] = [];

  while (respinsLeft > 0 && coinCount < CELLS && played < MAX_RESPINS_TOTAL) {
    const revealed: Respin["revealed"] = [];
    let landed = false;
    for (let r = 0; r < REELS; r++) {
      for (let row = 0; row < ROWS; row++) {
        if (coins[r][row] >= 0) continue;
        const hit = rng.nextBelow(BONUS_WEIGHT_TOTAL) < BONUS_COIN_WEIGHT;
        let value = -1;
        if (hit) {
          value = rng.pickWeighted(COIN_VALUE_WEIGHTS, COIN_VALUE_WEIGHT_TOTAL);
          coins[r][row] = value;
          coinCount++;
          landed = true;
        }
        revealed.push({ reel: r, row, coinValue: value });
      }
    }
    played++;
    respinsLeft = landed ? RESPINS : respinsLeft - 1;
    respins.push({ revealed, respinsLeft });
  }

  let bonusWinBp = 0n;
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      const v = coins[r][row];
      if (v >= 0) bonusWinBp += BigInt(COIN_VALUE_BP[v]);
    }
  }
  const grand = coinCount === CELLS;
  if (grand) bonusWinBp += BigInt(GRAND_BP);

  return {
    coins,
    respins,
    coinCount,
    grand,
    bonusWinBp,
    capped: played >= MAX_RESPINS_TOTAL && respinsLeft > 0 && !grand,
  };
}

export function holdSpinPayout(amount: bigint, totalWinBp: bigint): bigint {
  return (amount * totalWinBp) / 10_000n;
}

/** `target` is reserved (bonus buy); v1 accepts only 0. */
export function holdSpinEncodeTarget(): bigint {
  return 0n;
}

export function holdSpinEval(
  randomness: Uint8Array,
  bet: bigint,
  target: bigint = 0n
): HoldSpinOutcome {
  void target;
  const rng = new RngStream(randomness);
  const base = drawBase(rng);
  const lineWins = evaluateLines(base);
  let linesWinBp = 0n;
  for (const w of lineWins) linesWinBp += w.payBp;

  let bonus: Bonus | null = null;
  if (countCoins(base) >= BONUS_TRIGGER_COINS) {
    bonus = playBonus(rng, base);
  }

  let total = linesWinBp + (bonus?.bonusWinBp ?? 0n);
  const capped = total > MAX_WIN_BP;
  if (capped) total = MAX_WIN_BP;

  return {
    base,
    lineWins,
    linesWinBp,
    bonus,
    totalWinBp: total,
    multiplierBp: total,
    payout: holdSpinPayout(bet, total),
    capped,
    rngBlocksUsed: rng.blocksUsed,
  };
}
