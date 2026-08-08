export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const DEVNET_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const DEVNET_WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

export const CLUSTER_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

export const WS_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_WS_URL ?? "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

export const WALLET_CHAINS: Record<ClusterMoniker, `solana:${string}`> = {
  devnet: "solana:devnet",
  testnet: "solana:testnet",
  mainnet: "solana:mainnet",
  // Wallets don't advertise a localnet chain — sign against devnet while the
  // RPC endpoint above targets the local validator.
  localnet: "solana:devnet",
};

// Game ids, mirrors programs/spin/src/constants.rs exactly.
export const GAME_DICE = 1;
export const GAME_SLOTS = 2;
export const GAME_PHARAOH = 3;
export const GAME_DRAGON = 4;
export const GAME_MINES = 5;

// ---------------------------------------------------------------------------
// Neon Dice — target is a "roll under" value in [min_target, max_target],
// out of DICE_ROLL_RANGE. multiplierBp = DICE_RTP_NUMERATOR / target.
// ---------------------------------------------------------------------------
export const DICE_ROLL_RANGE = 10_000n;
export const DICE_RTP_NUMERATOR = 98_000_000n;
export const DICE_MIN_TARGET = 101n;
export const DICE_MAX_TARGET = 9_800n;

// ---------------------------------------------------------------------------
// Neon Slots — 5 reels of 10 symbols, scatter paytable.
// ---------------------------------------------------------------------------
export const SLOTS_REELS = 5;
export const SLOTS_SYMBOLS = 10;

/**
 * Reel symbols, index = on-chain digit (symbol[i] = (raw / 10^i) % 10),
 * ordered low → high value to match SLOTS_BASE_BP.
 *
 * Plain serializable data only — this is embedded in the provably-fair
 * paytable JSON download. The artwork lives in
 * components/game/slots/symbols/ keyed by the same index.
 */
export const SLOT_SYMBOLS = [
  { name: "Cherry" },
  { name: "Lemon" },
  { name: "Orange" },
  { name: "Plum" },
  { name: "Diamond" },
  { name: "Bell" },
  { name: "BAR" },
  { name: "SEVEN" },
  { name: "Horseshoe" },
  { name: "Crown" },
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
/** Max payout multiplier (100x) — the hard cap enforced on-chain. */
export const SLOTS_MAX_MULTIPLIER_BP = 1_000_000n;
export const SLOTS_HIT_RATE = 0.0856;
export const SLOTS_RTP = 0.9574;

// ---------------------------------------------------------------------------
// Grid games (Pharaoh's Fortune, Golden Dragon, Dynamite Mines) — scatter
// boards settled in a single VRF callback. All values mirror
// programs/spin/src/constants.rs exactly.
// ---------------------------------------------------------------------------

/** Common multiplier cap (100x) enforced on-chain for every game. */
export const GRID_MAX_MULTIPLIER_BP = 1_000_000n;

/** Board layouts, mirrors GRID_*_REELS / GRID_*_ROWS. */
export const PHARAOH_REELS = 5;
export const PHARAOH_ROWS = 4;
export const PHARAOH_CELLS = 20;
export const DRAGON_REELS = 5;
export const DRAGON_ROWS = 3;
export const DRAGON_CELLS = 15;
export const MINES_REELS = 6;
export const MINES_ROWS = 3;
export const MINES_CELLS = 18;

/** Cells of a symbol required to win, mirrors GRID_MIN_COUNT_* constants. */
export const PHARAOH_MIN_COUNT = 6;
export const DRAGON_MIN_COUNT = 4;
export const MINES_MIN_COUNT = 5;

/**
 * Pharaoh's Fortune symbols, index = on-chain digit, ordered low → high
 * value to match PHARAOH_BASE_BP. Symbol 9 is the expanding wild, 8 the
 * scarab free-spin trigger. Artwork lives in
 * components/game/pharaoh/symbols/ keyed by the same index.
 */
export const PHARAOH_SYMBOLS = [
  { name: "Dune" },
  { name: "Lotus" },
  { name: "Beetle" },
  { name: "Cat" },
  { name: "Eye" },
  { name: "Ankh" },
  { name: "Horus" },
  { name: "Sphinx" },
  { name: "Scarab" },
  { name: "Pharaoh" },
] as const;

/**
 * Golden Dragon symbols, index = on-chain digit, ordered low → high value
 * to match DRAGON_BASE_BP. Symbol 8 is the pearl (5+ doubles the win,
 * 9+ triples it).
 */
export const DRAGON_SYMBOLS = [
  { name: "Coin" },
  { name: "Fan" },
  { name: "Lantern" },
  { name: "Pagoda" },
  { name: "Koi" },
  { name: "Lotus" },
  { name: "Turtle" },
  { name: "Feng" },
  { name: "Pearl" },
  { name: "Dragon" },
] as const;

/**
 * Dynamite Mines symbols, index = on-chain digit, ordered low → high value
 * to match MINES_BASE_BP. The board cascades: winning symbols detonate,
 * survivors drop, fresh symbols fall in.
 */
export const MINES_SYMBOLS = [
  { name: "Pebble" },
  { name: "Mushroom" },
  { name: "Coal" },
  { name: "Cart" },
  { name: "Pickaxe" },
  { name: "Helmet" },
  { name: "Lamp" },
  { name: "Nugget" },
  { name: "Crate" },
  { name: "Dynamite" },
] as const;

/**
 * Base payout in basis points for the winning count of each symbol
 * (multiplier applied via 2^(count - min_count), capped at 4x and 100x).
 * Values mirror the on-chain *BASE_BP tables exactly.
 */
export const PHARAOH_BASE_BP = [
  1_275n,
  1_900n,
  2_525n,
  3_175n,
  3_800n,
  5_050n,
  6_325n,
  8_850n,
  11_375n,
  16_425n,
] as const;
export const DRAGON_BASE_BP = [
  2_725n,
  4_050n,
  5_425n,
  6_750n,
  8_100n,
  10_800n,
  13_500n,
  18_900n,
  24_300n,
  35_125n,
] as const;
export const MINES_BASE_BP = [
  3_125n,
  4_675n,
  6_250n,
  7_800n,
  9_350n,
  12_475n,
  15_575n,
  21_775n,
  27_975n,
  40_400n,
] as const;

/** Measured RTP per game (2M-sample Monte-Carlo, devnet program tables). */
export const PHARAOH_RTP = 0.9616;
export const DRAGON_RTP = 0.9621;
export const MINES_RTP = 0.9689;

/** Max free-spins round length and cascade depth, mirror on-chain. */
export const PHARAOH_WILD = 9;
export const PHARAOH_TRIGGER = 8;
export const PHARAOH_FREE_SPINS_TRIGGER = 4;
export const PHARAOH_FREE_SPINS = 3;
export const MINES_CASCADE_MAX = 5;

/** Dragon pearl tiers: 5+ doubles the win, 9+ triples it. */
export const DRAGON_PEARL = 8;
export const DRAGON_PEARL_BONUS = 5;
export const DRAGON_PEARL_JACKPOT = 9;
