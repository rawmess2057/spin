// Mirrors mines_eval in programs/spin/src/instructions/bet.rs exactly —
// must stay byte-for-byte identical to the on-chain evaluation, since this
// is purely for display (the program computes the real payout
// independently).

import {
  GRID_MAX_MULTIPLIER_BP,
  MINES_BASE_BP,
  MINES_CASCADE_MAX,
  MINES_MIN_COUNT,
  MINES_REELS,
  MINES_ROWS,
} from "../config";
import { DigitStream, rawWord, scatterScore } from "./grid";

export type MinesOutcome = {
  raw: bigint;
  /** Final 18 cells after all cascades, row-major (6 reels x 3 rows). */
  cells: number[];
  /**
   * Board state after each cascade stage: index 0 is the initial board,
   * then one entry per resolved cascade (max MINES_CASCADE_MAX). Used to
   * replay the drop animation deterministically.
   */
  boards: number[][];
  multiplierBp: bigint;
  /** Number of cascades that paid (0 = no win). */
  cascadeLevels: number;
  counts: number[];
  bestSymbol: number;
  bestCount: number;
  win: boolean;
};

export function minesEval(randomness: Uint8Array): MinesOutcome {
  const stream = new DigitStream(randomness);

  const grid: number[][] = [];
  for (let r = 0; r < MINES_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < MINES_REELS; c++) {
      row.push(stream.next());
    }
    grid.push(row);
  }

  let multiplierBp = 0n;
  let cascadeLevels = 0;
  let bestSymbol = 0;
  let bestCount = 0;
  let counts: number[] = [];
  const boards: number[][] = [grid.flat()];

  for (let level = 0; level < MINES_CASCADE_MAX; level++) {
    const cells = grid.flat();
    const s = scatterScore(cells, MINES_BASE_BP, null, MINES_MIN_COUNT);
    counts = s.counts;
    bestSymbol = s.bestSymbol;
    bestCount = s.bestCount;
    if (s.bestCount < MINES_MIN_COUNT) {
      break;
    }
    multiplierBp += s.multiplierBp * BigInt(level + 1);
    if (multiplierBp > GRID_MAX_MULTIPLIER_BP) {
      multiplierBp = GRID_MAX_MULTIPLIER_BP;
    }
    cascadeLevels = level + 1;

    // Remove cells of the best symbol; survivors drop, refills fall in
    // from the top of each reel (row 0 is the visual top).
    for (const row of grid) {
      const keep = row.filter((c) => c !== s.bestSymbol);
      const need = MINES_REELS - keep.length;
      const newRow: number[] = [];
      for (let i = 0; i < need; i++) {
        newRow.push(stream.next());
      }
      newRow.push(...keep);
      row.splice(0, row.length, ...newRow);
    }
    boards.push(grid.flat());
  }

  return {
    raw: rawWord(randomness),
    cells: grid.flat(),
    boards,
    multiplierBp,
    cascadeLevels,
    counts,
    bestSymbol,
    bestCount,
    win: multiplierBp > 0n,
  };
}
