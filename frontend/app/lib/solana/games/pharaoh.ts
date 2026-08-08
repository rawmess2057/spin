// Mirrors pharaoh_eval in programs/spin/src/instructions/bet.rs exactly —
// must stay byte-for-byte identical to the on-chain evaluation, since this
// is purely for display (the program computes the real payout
// independently).

import {
  GRID_MAX_MULTIPLIER_BP,
  PHARAOH_BASE_BP,
  PHARAOH_CELLS,
  PHARAOH_FREE_SPINS,
  PHARAOH_FREE_SPINS_TRIGGER,
  PHARAOH_MIN_COUNT,
  PHARAOH_TRIGGER,
  PHARAOH_WILD,
} from "../config";
import { DigitStream, rawWord, scatterScore } from "./grid";

export type PharaohOutcome = {
  raw: bigint;
  /** 20 cells, row-major (5 reels x 4 rows). */
  cells: number[];
  multiplierBp: bigint;
  /** True when 4+ scarabs triggered the free-spins round. */
  freeSpins: boolean;
  /** Counts after wild expansion. */
  counts: number[];
  bestSymbol: number;
  bestCount: number;
  win: boolean;
};

export function pharaohEval(randomness: Uint8Array): PharaohOutcome {
  const stream = new DigitStream(randomness);

  const cells: number[] = [];
  for (let i = 0; i < PHARAOH_CELLS; i++) {
    cells.push(stream.next());
  }

  const base = scatterScore(
    cells,
    PHARAOH_BASE_BP,
    PHARAOH_WILD,
    PHARAOH_MIN_COUNT
  );
  let multiplierBp = base.multiplierBp;
  const freeSpins = base.counts[PHARAOH_TRIGGER] >= PHARAOH_FREE_SPINS_TRIGGER;

  if (freeSpins) {
    for (let k = 0; k < PHARAOH_FREE_SPINS; k++) {
      const fsCells: number[] = [];
      for (let i = 0; i < PHARAOH_CELLS; i++) {
        fsCells.push(stream.next());
      }
      const m = scatterScore(
        fsCells,
        PHARAOH_BASE_BP,
        PHARAOH_WILD,
        PHARAOH_MIN_COUNT
      ).multiplierBp;
      multiplierBp += m;
      if (multiplierBp > GRID_MAX_MULTIPLIER_BP) {
        multiplierBp = GRID_MAX_MULTIPLIER_BP;
      }
    }
  }

  return {
    raw: rawWord(randomness),
    cells,
    multiplierBp,
    freeSpins,
    counts: base.counts,
    bestSymbol: base.bestSymbol,
    bestCount: base.bestCount,
    win: multiplierBp > 0n,
  };
}
