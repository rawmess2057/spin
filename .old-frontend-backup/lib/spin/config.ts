export const PROGRAM_ID = "9sd7ASeBUmcCNm4eVFfQ7rSujtbVLmu8wMUh9PwdNWvP";
export const VRF_PROGRAM_ID = "VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

export const SEEDS = {
  HOUSE: "house",
  VRF_STATE: "vrf_state",
  PENDING: "pending",
  GAME_CONFIG: "game_config",
  SESSION: "session",
  VRF_CONFIG: "OraoVrfCbConfig",
  VRF_CLIENT: "OraoVrfCbClient",
  VRF_REQUEST: "OraoVrfCbRequest",
} as const;

/** Neon Dice remains supported on-chain but is not exposed in the UI. */
export const GAME_DICE = 1;
/** Neon Slots: 5 reels of 10 symbols, scatter paytable. */
export const GAME_SLOTS = 2;

// ---------------------------------------------------------------------------
// Neon Slots constants — mirrors programs/spin/src/constants.rs exactly.
// ---------------------------------------------------------------------------

export const SLOTS_REELS = 5;
export const SLOTS_SYMBOLS = 10;

/**
 * Reel symbols, index = on-chain digit (symbol[i] = (raw / 10^i) % 10).
 * The first field is the rendered glyph.
 */
export const SLOT_SYMBOLS = [
  { glyph: "🍒", name: "Cherry", mult3x: "2x" },
  { glyph: "🍋", name: "Lemon", mult3x: "3x" },
  { glyph: "🍊", name: "Orange", mult3x: "4x" },
  { glyph: "🔔", name: "Bell", mult3x: "5x" },
  { glyph: "💎", name: "Gem", mult3x: "6x" },
  { glyph: "⭐", name: "Star", mult3x: "8x" },
  { glyph: "🎰", name: "Machine", mult3x: "10x" },
  { glyph: "7️⃣", name: "Seven", mult3x: "14x" },
  { glyph: "🚀", name: "Rocket", mult3x: "18x" },
  { glyph: "👑", name: "Crown", mult3x: "26x" },
] as const;

/** Base payout in basis points for a 3-of-a-kind of each symbol. */
export const SLOTS_BASE_BP = [
  20_000n,
  30_000n,
  40_000n,
  50_000n,
  60_000n,
  80_000n,
  100_000n,
  140_000n,
  180_000n,
  260_000n,
] as const;
export const SLOTS_X4 = 4n;
export const SLOTS_X5 = 20n;
/** Max payout multiplier (100x), keeping payouts within the bankroll rule. */
export const SLOTS_MAX_MULTIPLIER_BP = 1_000_000n;
/** Exact stats from the on-chain brute-force evaluation. */
export const SLOTS_HIT_RATE = 0.0856;
export const SLOTS_RTP = 0.9574;
