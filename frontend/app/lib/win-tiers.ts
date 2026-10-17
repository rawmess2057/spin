// Big-win celebration tiers. Thresholds are per game: Plinko's High risk tops
// out near 920x at 16 rows (programs/spin/src/constants.rs), so 100x is a
// "jackpot" there, while Megaways runs to 10,000x and its tiers sit higher.
// Multipliers are in basis points.
export type WinTier = "none" | "nice" | "big" | "huge" | "jackpot";

export type WinTierScale = {
  /** Multiplier (×) at or above which a win is "big" / "huge" / "jackpot". */
  big: number;
  huge: number;
  jackpot: number;
};

/** Original Lucky Sevens / Plinko thresholds. */
export const DEFAULT_SCALE: WinTierScale = { big: 10, huge: 30, jackpot: 100 };

/** Megaways: 15× is already a big win on a cascading slot; 200× is a jackpot. */
export const MEGAWAYS_SCALE: WinTierScale = { big: 15, huge: 50, jackpot: 200 };

/** Hold & Spin: coins stack up, so "big" starts at 10× and the GRAND is a jackpot. */
export const HOLD_SPIN_SCALE: WinTierScale = {
  big: 10,
  huge: 50,
  jackpot: 200,
};

export function winTier(
  multiplierBp: bigint,
  scale: WinTierScale = DEFAULT_SCALE
): WinTier {
  const mult = Number(multiplierBp) / 10_000;
  if (mult <= 0) return "none";
  if (mult >= scale.jackpot) return "jackpot";
  if (mult < scale.big) return "nice";
  if (mult < scale.huge) return "big";
  return "huge";
}

export const WIN_TIER_LABEL: Record<WinTier, string> = {
  none: "",
  nice: "Nice Win",
  big: "Big Win",
  huge: "Huge Win",
  jackpot: "Jackpot",
};
