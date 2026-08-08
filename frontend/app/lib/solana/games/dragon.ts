// Mirrors dragon_eval in programs/spin/src/instructions/bet.rs exactly —
// must stay byte-for-byte identical to the on-chain evaluation, since this
// is purely for display (the program computes the real payout
// independently).

import {
  DRAGON_BASE_BP,
  DRAGON_MIN_COUNT,
  DRAGON_PEARL,
  DRAGON_PEARL_BONUS,
  DRAGON_PEARL_JACKPOT,
  GRID_MAX_MULTIPLIER_BP,
} from "../config";
import { DigitStream, rawWord, scatterScore } from "./grid";

export type DragonOutcome = {
  raw: bigint;
  /** 15 cells, row-major (5 reels x 3 rows). */
  cells: number[];
  multiplierBp: bigint;
  /** Pearls on the board (symbol 8). */
  pearls: number;
  /** 0 = none, 2 = 5+ pearls (x2), 3 = 9+ pearls (x3). */
  pearlTier: 0 | 2 | 3;
  counts: number[];
  bestSymbol: number;
  bestCount: number;
  win: boolean;
};

export function dragonEval(randomness: Uint8Array): DragonOutcome {
  const stream = new DigitStream(randomness);

  const cells: number[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(stream.next());
  }

  const base = scatterScore(cells, DRAGON_BASE_BP, null, DRAGON_MIN_COUNT);
  let multiplierBp = base.multiplierBp;
  const pearls = base.counts[DRAGON_PEARL];
  let pearlTier: 0 | 2 | 3 = 0;

  if (pearls >= DRAGON_PEARL_JACKPOT) {
    multiplierBp *= 3n;
    if (multiplierBp > GRID_MAX_MULTIPLIER_BP) {
      multiplierBp = GRID_MAX_MULTIPLIER_BP;
    }
    pearlTier = 3;
  } else if (pearls >= DRAGON_PEARL_BONUS) {
    multiplierBp *= 2n;
    if (multiplierBp > GRID_MAX_MULTIPLIER_BP) {
      multiplierBp = GRID_MAX_MULTIPLIER_BP;
    }
    pearlTier = 2;
  }

  return {
    raw: rawWord(randomness),
    cells,
    multiplierBp,
    pearls,
    pearlTier,
    counts: base.counts,
    bestSymbol: base.bestSymbol,
    bestCount: base.bestCount,
    win: multiplierBp > 0n,
  };
}
