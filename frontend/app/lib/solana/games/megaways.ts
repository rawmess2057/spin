import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Megaways cascading slot — client-side evaluator.
 *
 * This module is the *specification* of the game math. It is written to be
 * mirrored byte-for-byte into the Anchor program later (a `megaways_eval` arm
 * in `spin_chain` / `resolve_spin`, constants in `constants.rs`), so:
 *
 *  - every quantity is an integer: pays are basis points (bp) of the total
 *    bet per way, payouts are lamports, weights are plain counts;
 *  - `number` is only used for values provably < 2^32 (symbol ids, counts,
 *    ways ≤ 117,649, multipliers ≤ 600); anything in bp or lamports is bigint;
 *  - there are no floats, no `Math.random`, no iteration-order dependence,
 *    and the order in which random draws are consumed is part of the spec;
 *  - all randomness comes from the 64-byte reveal (`reveal || sha256(reveal)`)
 *    expanded with sha256 into a stream (see `RngStream`), bounded by
 *    `MAX_CASCADES` and `MAX_FREE_SPINS_TOTAL` so the on-chain compute is
 *    bounded too.
 *
 * Recording-only fields (dropped in the Rust port, which only needs
 * `totalWinBp` / `payout`): every `grid`, `wins`, `removed`, `refill`
 * snapshot inside `CascadeStep`, plus `rngBlocksUsed`. They exist so the
 * renderer can replay the outcome step by step.
 */

// ---------------------------------------------------------------------------
// Constants (mirror into programs/spin/src/constants.rs)
// ---------------------------------------------------------------------------

/** Reserved game id — Plinko is 7. */
export const GAME_MEGAWAYS = 8;

export const REELS = 6;
export const MIN_ROWS = 2;
export const MAX_ROWS = 7;
/** Π MAX_ROWS over 6 reels = 117,649. */
export const MAX_WAYS = 117_649;

export const SYMBOL_COUNT = 12;
export const SYM = {
  WILD: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
  L6: 6,
  H1: 7,
  H2: 8,
  H3: 9,
  H4: 10,
  SCATTER: 11,
} as const;
export type Symbol = (typeof SYM)[keyof typeof SYM];

export const SYMBOL_NAMES: readonly string[] = [
  "Wild",
  "Teal Gem",
  "Amethyst",
  "Sapphire",
  "Emerald",
  "Topaz",
  "Rose Quartz",
  "Ruby",
  "Bell",
  "Seven",
  "Diamond",
  "Scatter",
];

/** Minimum consecutive reels (from the left) for a way to pay. */
export const MIN_MATCH = 3;

/** Weight of each reel height 2..7. Sums to HEIGHT_WEIGHT_TOTAL. */
export const HEIGHT_WEIGHTS: readonly number[] = [14, 20, 22, 20, 14, 10];
export const HEIGHT_WEIGHT_TOTAL = 100;

/**
 * Symbol weights per reel, indexed [reel][symbol]. Every row sums to exactly
 * SYMBOL_WEIGHT_TOTAL. Wilds never land on the outer reels (0 and 5), which
 * is what makes the ways evaluation below unambiguous: the candidate symbols
 * are exactly the paying symbols physically present on reel 0.
 */
export const SYMBOL_WEIGHT_TOTAL = 1000;
const OUTER_REEL_WEIGHTS: readonly number[] = [
  //  W   L1   L2   L3   L4   L5   L6  H1  H2  H3  H4  SC
  0, 148, 138, 128, 118, 108, 96, 90, 72, 52, 30, 20,
];
const INNER_REEL_WEIGHTS: readonly number[] = [
  //  W   L1   L2   L3   L4   L5   L6  H1  H2  H3  H4  SC
  30, 145, 135, 125, 115, 105, 93, 86, 66, 48, 32, 20,
];
export const SYMBOL_WEIGHTS: readonly (readonly number[])[] = [
  OUTER_REEL_WEIGHTS,
  INNER_REEL_WEIGHTS,
  INNER_REEL_WEIGHTS,
  INNER_REEL_WEIGHTS,
  INNER_REEL_WEIGHTS,
  OUTER_REEL_WEIGHTS,
];

/**
 * Pay per way in bp of the total bet, indexed [symbol][matchLen - 2] for
 * matchLen 2..6. Column 0 (two of a kind) is zero for every symbol; it is
 * kept so the table shape stays fixed for the Rust port. WILD and SCATTER
 * rows are zero: wilds substitute, scatters trigger free spins.
 */
export const PAYTABLE: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0], // WILD
  [0, 365, 725, 1445, 2895], // L1
  [0, 435, 910, 1805, 3625], // L2
  [0, 545, 1090, 2170, 4340], // L3
  [0, 655, 1270, 2535, 5065], // L4
  [0, 725, 1445, 2895, 5795], // L5
  [0, 910, 1805, 3625, 7235], // L6
  [0, 1445, 2895, 7235, 14475], // H1
  [0, 2170, 3625, 10860, 21720], // H2
  [0, 2895, 5795, 14475, 28960], // H3
  [0, 3625, 7235, 21720, 72390], // H4
  [0, 0, 0, 0, 0], // SCATTER
];

/** Cascades evaluated per round before the game stops tumbling. */
export const MAX_CASCADES = 12;

/** Scatters needed on the base-game grid to trigger free spins. */
export const FS_TRIGGER_SCATTERS = 4;
/** Free spins for the trigger count, plus this many for each extra scatter. */
export const FS_BASE = 12;
export const FS_PER_EXTRA = 5;
/** Scatters needed during free spins to retrigger, and the spins awarded. */
export const FS_RETRIGGER_SCATTERS = 3;
export const FS_RETRIGGER_SPINS = 5;
/** Hard cap on free spins in one outcome (bounds the compute). */
export const MAX_FREE_SPINS_TOTAL = 50;

/** Hard cap on the total win: 10,000× the bet, in bp. */
export const MAX_WIN_BP = 100_000_000n;

// ---------------------------------------------------------------------------
// Randomness stream
// ---------------------------------------------------------------------------

/**
 * Expands the 64-byte reveal randomness into an unbounded stream of u32s.
 *
 * Block i = sha256(seed || u32_le(i)); each block yields eight little-endian
 * u32s. On-chain this is `hashv(&[&seed, &i.to_le_bytes()])`. `nextBelow`
 * uses a plain modulo: the bias is ≤ n / 2^32 for n ≤ 1000, which is
 * negligible and identical in Rust (`u32 % u32`).
 */
export class RngStream {
  private readonly seed: Uint8Array;
  private block: Uint8Array = new Uint8Array(0);
  private view: DataView = new DataView(new ArrayBuffer(0));
  private offset = 32;
  private counter = 0;
  /** Number of sha256 blocks consumed so far (compute-budget telemetry). */
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

  /** Uniform-ish integer in [0, n). */
  nextBelow(n: number): number {
    return this.nextU32() % n;
  }

  /** Index into `weights` chosen proportionally; `total` must equal Σ weights. */
  pickWeighted(weights: readonly number[], total: number): number {
    let x = this.nextBelow(total);
    for (let i = 0; i < weights.length; i++) {
      if (x < weights[i]) return i;
      x -= weights[i];
    }
    // Unreachable when `total` is correct; keep the last index as a guard.
    return weights.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** `cells[reel][row]`, row 0 is the top of the reel window. */
export type Grid = {
  heights: number[];
  cells: number[][];
};

export type Pos = [reel: number, row: number];

export type WayWin = {
  symbol: number;
  /** Consecutive reels from the left that carry the symbol (or a wild). */
  matchLen: number;
  ways: number;
  /** PAYTABLE[symbol][matchLen - 2] × ways, before the round multiplier. */
  payBp: bigint;
  positions: Pos[];
};

export type CascadeStep = {
  /** Grid that was evaluated at this step. */
  grid: Grid;
  /** Empty on the terminal step. */
  wins: WayWin[];
  /** Union of all winning positions. */
  removed: Pos[];
  /** New symbols per reel, top to bottom (one per removed cell on that reel). */
  refill: number[][];
  /** Multiplier applied to this step's wins (1 in the base game). */
  multiplier: number;
  /** Σ payBp × multiplier. */
  stepWinBp: bigint;
  /** Scatters on `grid`. */
  scatters: number;
};

export type SpinRound = {
  kind: "base" | "free";
  /** 0 for the base round; 0-based free-spin number otherwise. */
  index: number;
  steps: CascadeStep[];
  /** The grid left on screen when the round ended. */
  finalGrid: Grid;
  roundWinBp: bigint;
  /** Scatters on the final grid (never removed, so this is the maximum). */
  scatters: number;
  /** Free spins this round added to the total (trigger or retrigger). */
  freeSpinsAwarded: number;
  /** Multiplier carried into the next free spin. */
  multiplierAfter: number;
  /** True when MAX_CASCADES stopped the tumbling. */
  cascadeCapHit: boolean;
};

export type MegawaysOutcome = {
  base: SpinRound;
  freeSpins: SpinRound[];
  /** Free spins actually played (≤ MAX_FREE_SPINS_TOTAL). */
  totalFreeSpins: number;
  /** True when a trigger/retrigger was cut by MAX_FREE_SPINS_TOTAL. */
  fsCapped: boolean;
  /** Total win in bp of the bet, clamped to MAX_WIN_BP. */
  totalWinBp: bigint;
  /** Alias of `totalWinBp` so shared helpers (win tiers, history) work. */
  multiplierBp: bigint;
  /** Payout in lamports. */
  payout: bigint;
  /** True when MAX_WIN_BP was reached. */
  capped: boolean;
  rngBlocksUsed: number;
};

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/** Draws a fresh grid: heights reel 0..5, then symbols reel 0..5 top→bottom. */
export function drawGrid(rng: RngStream): Grid {
  const heights: number[] = new Array(REELS);
  for (let r = 0; r < REELS; r++) {
    heights[r] =
      MIN_ROWS + rng.pickWeighted(HEIGHT_WEIGHTS, HEIGHT_WEIGHT_TOTAL);
  }
  const cells: number[][] = new Array(REELS);
  for (let r = 0; r < REELS; r++) {
    const col: number[] = new Array(heights[r]);
    for (let row = 0; row < heights[r]; row++) {
      col[row] = rng.pickWeighted(SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
    }
    cells[r] = col;
  }
  return { heights, cells };
}

/** Number of ways on a grid: the product of the reel heights. */
export function waysCount(grid: Grid): number {
  let w = 1;
  for (let r = 0; r < REELS; r++) w *= grid.heights[r];
  return w;
}

export function countScatters(grid: Grid): number {
  let n = 0;
  for (let r = 0; r < REELS; r++) {
    const col = grid.cells[r];
    for (let row = 0; row < col.length; row++) {
      if (col[row] === SYM.SCATTER) n++;
    }
  }
  return n;
}

/**
 * Ways evaluation, left to right. For every paying symbol present on reel 0
 * (ascending id, so the order is deterministic in any language), count the
 * matching cells (symbol or wild) on each consecutive reel; the way pays when
 * at least MIN_MATCH reels match, `ways` being the product of the counts.
 */
export function evaluateWays(grid: Grid): WayWin[] {
  const wins: WayWin[] = [];
  const present: boolean[] = new Array(SYMBOL_COUNT).fill(false);
  const first = grid.cells[0];
  for (let row = 0; row < first.length; row++) present[first[row]] = true;

  for (let s = 1; s < SYMBOL_COUNT; s++) {
    if (s === SYM.SCATTER || !present[s]) continue;
    let ways = 1;
    let matchLen = 0;
    const positions: Pos[] = [];
    for (let r = 0; r < REELS; r++) {
      const col = grid.cells[r];
      let count = 0;
      for (let row = 0; row < col.length; row++) {
        const c = col[row];
        if (c === s || c === SYM.WILD) {
          count++;
          positions.push([r, row]);
        }
      }
      if (count === 0) break;
      ways *= count;
      matchLen++;
    }
    if (matchLen < MIN_MATCH) continue;
    const payBp = BigInt(PAYTABLE[s][matchLen - 2]) * BigInt(ways);
    if (payBp === 0n) continue;
    wins.push({ symbol: s, matchLen, ways, payBp, positions });
  }
  return wins;
}

/** Union of winning positions, ordered reel 0..5 then top→bottom. */
export function removedPositions(grid: Grid, wins: WayWin[]): Pos[] {
  const marks: boolean[][] = grid.cells.map((col) =>
    new Array<boolean>(col.length).fill(false)
  );
  for (const w of wins) {
    for (const [r, row] of w.positions) marks[r][row] = true;
  }
  const out: Pos[] = [];
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < marks[r].length; row++) {
      if (marks[r][row]) out.push([r, row]);
    }
  }
  return out;
}

/**
 * Removes the given cells, lets the survivors fall to the bottom of each reel
 * (order preserved), and fills the vacated top cells with new draws for that
 * reel, top→bottom, reel 0..5. Heights never change inside a round.
 */
export function applyCascade(
  grid: Grid,
  removed: Pos[],
  rng: RngStream
): { grid: Grid; refill: number[][] } {
  const marks: boolean[][] = grid.cells.map((col) =>
    new Array<boolean>(col.length).fill(false)
  );
  for (const [r, row] of removed) marks[r][row] = true;

  const cells: number[][] = new Array(REELS);
  const refill: number[][] = new Array(REELS);
  for (let r = 0; r < REELS; r++) {
    const col = grid.cells[r];
    const survivors: number[] = [];
    for (let row = 0; row < col.length; row++) {
      if (!marks[r][row]) survivors.push(col[row]);
    }
    const gap = col.length - survivors.length;
    const fresh: number[] = new Array(gap);
    for (let i = 0; i < gap; i++) {
      fresh[i] = rng.pickWeighted(SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
    }
    cells[r] = fresh.concat(survivors);
    refill[r] = fresh;
  }
  return { grid: { heights: grid.heights.slice(), cells }, refill };
}

// ---------------------------------------------------------------------------
// Round + outcome
// ---------------------------------------------------------------------------

function sumWins(wins: WayWin[]): bigint {
  let s = 0n;
  for (const w of wins) s += w.payBp;
  return s;
}

/**
 * Plays one round (a base spin or one free spin): draw, then tumble until a
 * grid has no wins, MAX_CASCADES is reached, or the win budget is exhausted.
 * `budgetBp` is how much more may be won before MAX_WIN_BP (the caller
 * clamps the running total).
 */
function playRound(
  rng: RngStream,
  kind: "base" | "free",
  index: number,
  multiplierStart: number,
  budgetBp: bigint
): SpinRound {
  let grid = drawGrid(rng);
  const steps: CascadeStep[] = [];
  let multiplier = multiplierStart;
  let roundWinBp = 0n;
  let cascadeCapHit = false;

  for (let step = 0; ; step++) {
    const wins = evaluateWays(grid);
    const scatters = countScatters(grid);
    if (wins.length === 0) {
      steps.push({
        grid,
        wins,
        removed: [],
        refill: [],
        multiplier,
        stepWinBp: 0n,
        scatters,
      });
      break;
    }

    const removed = removedPositions(grid, wins);
    const stepWinBp = sumWins(wins) * BigInt(multiplier);
    roundWinBp += stepWinBp;
    const budgetHit = roundWinBp >= budgetBp;

    if (step >= MAX_CASCADES || budgetHit) {
      // Record the win but stop tumbling: the grid stays as is.
      steps.push({
        grid,
        wins,
        removed,
        refill: grid.cells.map(() => []),
        multiplier,
        stepWinBp,
        scatters,
      });
      if (!budgetHit) cascadeCapHit = true;
      if (kind === "free") multiplier += 1;
      break;
    }

    const next = applyCascade(grid, removed, rng);
    steps.push({
      grid,
      wins,
      removed,
      refill: next.refill,
      multiplier,
      stepWinBp,
      scatters,
    });
    if (kind === "free") multiplier += 1;
    grid = next.grid;
  }

  // Scatters are never removed, so the final grid holds the round's maximum.
  const finalGrid = steps[steps.length - 1].refill.some((r) => r.length > 0)
    ? grid
    : steps[steps.length - 1].grid;

  return {
    kind,
    index,
    steps,
    finalGrid,
    roundWinBp,
    scatters: countScatters(finalGrid),
    freeSpinsAwarded: 0,
    multiplierAfter: multiplier,
    cascadeCapHit,
  };
}

/** Mirrors the program's integer payout (amount × bp / 10_000, truncated). */
export function megawaysPayout(amount: bigint, totalWinBp: bigint): bigint {
  return (amount * totalWinBp) / 10_000n;
}

/** The `target` field is unused in v1 (reserved for a future bonus buy). */
export function megawaysEncodeTarget(): bigint {
  return 0n;
}

/**
 * Evaluates a full Megaways outcome — base spin, cascades, free spins — from
 * 64 bytes of randomness. `target` is accepted for signature parity with the
 * other games and ignored.
 */
export function megawaysEval(
  randomness: Uint8Array,
  bet: bigint,
  target: bigint = 0n
): MegawaysOutcome {
  void target; // reserved (bonus buy); accepted for signature parity
  const rng = new RngStream(randomness);

  const base = playRound(rng, "base", 0, 1, MAX_WIN_BP);
  let total = base.roundWinBp;
  let capped = total >= MAX_WIN_BP;

  let awarded = 0;
  if (base.scatters >= FS_TRIGGER_SCATTERS) {
    awarded = FS_BASE + (base.scatters - FS_TRIGGER_SCATTERS) * FS_PER_EXTRA;
  }
  let fsCapped = awarded > MAX_FREE_SPINS_TOTAL;
  let totalFreeSpins = Math.min(awarded, MAX_FREE_SPINS_TOTAL);
  base.freeSpinsAwarded = totalFreeSpins;

  const freeSpins: SpinRound[] = [];
  let multiplier = 1;
  for (let i = 0; i < totalFreeSpins && !capped; i++) {
    const round = playRound(rng, "free", i, multiplier, MAX_WIN_BP - total);
    total += round.roundWinBp;
    multiplier = round.multiplierAfter;
    if (round.scatters >= FS_RETRIGGER_SCATTERS) {
      let next = totalFreeSpins + FS_RETRIGGER_SPINS;
      if (next > MAX_FREE_SPINS_TOTAL) {
        fsCapped = true;
        next = MAX_FREE_SPINS_TOTAL;
      }
      round.freeSpinsAwarded = next - totalFreeSpins;
      totalFreeSpins = next;
    }
    if (total >= MAX_WIN_BP) capped = true;
    freeSpins.push(round);
  }

  if (total > MAX_WIN_BP) total = MAX_WIN_BP;
  // Free spins that were never played because the cap ended the round early.
  if (capped && freeSpins.length < totalFreeSpins) {
    totalFreeSpins = freeSpins.length;
  }

  return {
    base,
    freeSpins,
    totalFreeSpins,
    fsCapped,
    totalWinBp: total,
    multiplierBp: total,
    payout: megawaysPayout(bet, total),
    capped,
    rngBlocksUsed: rng.blocksUsed,
  };
}
