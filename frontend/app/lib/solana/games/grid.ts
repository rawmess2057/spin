// Shared machinery for the grid games, mirrors
// programs/spin/src/instructions/bet.rs (DigitStream, count_curve,
// scatter_score) exactly — must stay byte-for-byte identical to the
// on-chain evaluation, since this is purely for display (the program
// computes the real payout independently).

import { GRID_MAX_MULTIPLIER_BP } from "../config";

/** Raw base-10 digit i of the little-endian u64 word at `wordIndex`. */
function digitOf(word: bigint, digitIndex: number): number {
  return Number((word / 10n ** BigInt(digitIndex)) % 10n);
}

/**
 * Streams base-10 digits out of the 64-byte VRF output. Each of the 8
 * little-endian u64 words yields up to 20 decimal digits; grid cells are
 * filled sequentially from this stream, so cascades and free spins consume
 * further digits deterministically.
 */
export class DigitStream {
  private readonly randomness: Uint8Array;
  private cursor = 0;

  constructor(randomness: Uint8Array) {
    this.randomness = randomness;
  }

  next(): number {
    const pos = this.cursor;
    this.cursor += 1;
    const wordIdx = Math.floor(pos / 20);
    const digitIdx = pos % 20;
    const view = new DataView(
      this.randomness.buffer,
      this.randomness.byteOffset,
      this.randomness.byteLength
    );
    const word = view.getBigUint64(wordIdx * 8, true);
    return digitOf(word, digitIdx);
  }
}

/** First 8 bytes of the randomness as a little-endian u64. */
export function rawWord(randomness: Uint8Array): bigint {
  const view = new DataView(
    randomness.buffer,
    randomness.byteOffset,
    randomness.byteLength
  );
  return view.getBigUint64(0, true);
}

/** `2^(c - min_count)`, capped at 4 — mirrors count_curve. */
function countCurve(c: number, minCount: number): bigint {
  return BigInt(Math.min(2 ** Math.max(c - minCount, 0), 4));
}

export type ScatterResult = {
  multiplierBp: bigint;
  /** Counts after wild expansion (if any). */
  counts: number[];
  bestSymbol: number;
  bestCount: number;
};

/**
 * Scatter scoring over an arbitrary grid — mirrors scatter_score. The
 * winner is the most frequent symbol, ties breaking toward the higher
 * index. A wild symbol (where set) expands into the most frequent non-wild
 * symbol, adding its occurrences to that symbol's tally before scoring.
 */
export function scatterScore(
  cells: number[],
  baseBp: readonly bigint[],
  wild: number | null,
  minCount: number
): ScatterResult {
  const counts = new Array(10).fill(0);
  for (const c of cells) {
    counts[c]++;
  }
  if (wild !== null) {
    const wildCount = counts[wild];
    if (wildCount > 0) {
      let target = 0;
      let targetCount = 0;
      for (let s = 0; s < counts.length; s++) {
        if (s !== wild && counts[s] >= targetCount) {
          target = s;
          targetCount = counts[s];
        }
      }
      counts[target] += wildCount;
    }
  }
  let best = 0;
  let bestCount = 0;
  for (let s = 0; s < counts.length; s++) {
    if (counts[s] >= bestCount) {
      best = s;
      bestCount = counts[s];
    }
  }
  let multiplierBp = 0n;
  if (bestCount >= minCount) {
    multiplierBp = countCurve(bestCount, minCount) * baseBp[best];
    if (multiplierBp > GRID_MAX_MULTIPLIER_BP) {
      multiplierBp = GRID_MAX_MULTIPLIER_BP;
    }
  }
  return { multiplierBp, counts, bestSymbol: best, bestCount };
}
