// Big-win celebration tiers, rescaled to Lucky Sevens' real 100x hard cap
// (programs/spin/src/constants.rs SLOTS_MAX_MULTIPLIER_BP). The written
// design plan's "Mega Win" (500-1000x) tier is unreachable on this program
// and is dropped rather than faked — but the 100x cap itself gets its own
// "JACKPOT" tier so the hardest hit on the machine reads as one.
export type WinTier = "none" | "nice" | "big" | "huge" | "jackpot";

export function winTier(multiplierBp: bigint): WinTier {
  const mult = Number(multiplierBp) / 10_000;
  if (mult <= 0) return "none";
  if (mult >= 100) return "jackpot";
  if (mult < 10) return "nice";
  if (mult < 30) return "big";
  return "huge";
}

export const WIN_TIER_LABEL: Record<WinTier, string> = {
  none: "",
  nice: "Nice Win",
  big: "Big Win",
  huge: "Huge Win",
  jackpot: "Jackpot",
};
