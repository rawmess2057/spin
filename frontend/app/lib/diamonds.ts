/**
 * Diamonds — the chip denomination the games are played in.
 *
 * Purely a display unit. The chain only ever deals in lamports: the player's
 * vault balance, the bet amount and the payout are all lamports, and this
 * module is the single place that converts. Keeping the conversion one-way
 * (a fixed power-of-ten rate, no rounding on the way in) means a bet can never
 * be mangled between what the player picked and what the program receives.
 *
 * 1 💎 = 0.0001 SOL, so a 0.1 SOL buy-in is 1,000 💎.
 */

export const DIAMOND_LAMPORTS = 100_000n;

/** Chip denominations offered, before clamping to the game's on-chain limits. */
const CHIP_LADDER = [10n, 25n, 50n, 100n, 250n, 500n, 1_000n] as const;

export function lamportsToDiamonds(lamports: bigint): bigint {
  return lamports / DIAMOND_LAMPORTS;
}

export function diamondsToLamports(diamonds: bigint): bigint {
  return diamonds * DIAMOND_LAMPORTS;
}

/** Grouped decimal, e.g. 1250n -> "1,250". */
export function diamondString(value: bigint): string {
  return value.toLocaleString("en-US");
}

/**
 * Parses a bet field. Returns null for anything that isn't a whole,
 * non-negative number of diamonds — the caller turns that into a bet error.
 */
export function parseDiamonds(input: string): bigint | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

/**
 * Chip buttons for a game, given its on-chain bet limits.
 *
 * The limits differ per game (devnet has dice at 1 SOL but the grid games at
 * ~0.0146 SOL), so the ladder is filtered rather than hardcoded — otherwise a
 * chip would render that the program rejects.
 */
export function diamondChips(
  minDiamonds: bigint | null,
  maxDiamonds: bigint | null
): bigint[] {
  if (minDiamonds == null || maxDiamonds == null) return [];
  const chips = CHIP_LADDER.filter((c) => c >= minDiamonds && c <= maxDiamonds);
  // Always offer something playable, even if the window falls between rungs.
  return chips.length > 0 ? [...chips] : [minDiamonds];
}

/** A sensible opening bet: the second chip up, or the minimum. */
export function defaultBet(
  minDiamonds: bigint | null,
  maxDiamonds: bigint | null
): bigint | null {
  const chips = diamondChips(minDiamonds, maxDiamonds);
  if (chips.length === 0) return null;
  return chips[Math.min(1, chips.length - 1)];
}
