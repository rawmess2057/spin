// Mirrors slots_eval in programs/spin/src/instructions/bet.rs exactly — must
// stay byte-for-byte identical to the on-chain evaluation, since this is
// purely for display (the program computes the real payout independently).
import {
  SLOTS_BASE_BP,
  SLOTS_MAX_MULTIPLIER_BP,
  SLOTS_REELS,
  SLOTS_SYMBOLS,
  SLOTS_X4,
  SLOTS_X5,
} from "../config";

export type SlotsOutcome = {
  raw: bigint;
  symbols: number[];
  bestSymbol: number;
  bestCount: number;
  multiplierBp: bigint;
  win: boolean;
};

export function slotsEval(randomness: Uint8Array): SlotsOutcome {
  const view = new DataView(
    randomness.buffer,
    randomness.byteOffset,
    randomness.byteLength
  );
  const raw = view.getBigUint64(0, true);

  const symbols: number[] = [];
  const counts = new Array(SLOTS_SYMBOLS).fill(0);
  for (let i = 0; i < SLOTS_REELS; i++) {
    const symbol = Number((raw / 10n ** BigInt(i)) % 10n);
    symbols.push(symbol);
    counts[symbol]++;
  }

  let bestSymbol = 0;
  let bestCount = 0;
  for (let s = 0; s < SLOTS_SYMBOLS; s++) {
    // Ties favor the higher symbol index — mirrors the Rust `>=` comparison.
    if (counts[s] >= bestCount) {
      bestCount = counts[s];
      bestSymbol = s;
    }
  }

  let multiplierBp = 0n;
  if (bestCount >= 3) {
    const x = bestCount >= 5 ? SLOTS_X5 : bestCount === 4 ? SLOTS_X4 : 1n;
    multiplierBp = SLOTS_BASE_BP[bestSymbol] * x;
    if (multiplierBp > SLOTS_MAX_MULTIPLIER_BP) {
      multiplierBp = SLOTS_MAX_MULTIPLIER_BP;
    }
  }

  return {
    raw,
    symbols,
    bestSymbol,
    bestCount,
    multiplierBp,
    win: multiplierBp > 0n,
  };
}
