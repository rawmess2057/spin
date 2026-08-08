import {
  SLOTS_BASE_BP,
  SLOTS_MAX_MULTIPLIER_BP,
  SLOTS_REELS,
  SLOTS_SYMBOLS,
  SLOTS_X4,
  SLOTS_X5,
} from "./config";

export type SlotsOutcome = {
  raw: bigint;
  symbols: number[];
  bestSymbol: number;
  bestCount: number;
  multiplierBp: bigint;
  win: boolean;
};

function u64LeFromBytes(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] ?? 0);
  return v;
}

/**
 * Mirrors `slots_eval` in programs/spin/src/instructions/bet.rs: the raw
 * randomness is split into base-10 digits (one per reel), the best symbol is
 * the most frequent one (ties to the higher index), and a win requires at
 * least three matches; the multiplier is capped at 100x.
 */
export function slotsEval(randomness: Uint8Array): SlotsOutcome {
  const raw = u64LeFromBytes(randomness.subarray(0, 8));
  const symbols = Array.from({ length: SLOTS_REELS }, (_, i) =>
    Number((raw / 10n ** BigInt(i)) % BigInt(SLOTS_SYMBOLS))
  );
  const counts = new Array<number>(SLOTS_SYMBOLS).fill(0);
  for (const s of symbols) counts[s] += 1;
  let best = 0;
  let bestCount = 0;
  counts.forEach((c, s) => {
    if (c >= bestCount) {
      best = s;
      bestCount = c;
    }
  });
  let multiplierBp = 0n;
  if (bestCount >= 3) {
    const x = bestCount === 5 ? SLOTS_X5 : bestCount === 4 ? SLOTS_X4 : 1n;
    multiplierBp = SLOTS_BASE_BP[best] * x;
    if (multiplierBp > SLOTS_MAX_MULTIPLIER_BP) {
      multiplierBp = SLOTS_MAX_MULTIPLIER_BP;
    }
  }
  return {
    raw,
    symbols,
    bestSymbol: best,
    bestCount,
    multiplierBp,
    win: multiplierBp > 0n,
  };
}
