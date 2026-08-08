use anchor_lang::prelude::*;

/// ORAO VRF Callback program (devnet & mainnet).
pub const VRF_PROGRAM_ID: Pubkey =
    pubkey!("VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU");

/// ORAO VRF network state PDA seed.
pub const VRF_CONFIG_SEED: &[u8] = b"OraoVrfCbConfig";
/// ORAO VRF client PDA seed.
pub const VRF_CLIENT_SEED: &[u8] = b"OraoVrfCbClient";
/// ORAO VRF request account PDA seed.
pub const VRF_REQUEST_SEED: &[u8] = b"OraoVrfCbRequest";

/// Our program's house treasury PDA seed.
pub const HOUSE_SEED: &[u8] = b"house";
/// Our program's VRF request authority (state) PDA seed.
pub const VRF_STATE_SEED: &[u8] = b"vrf_state";
/// Per-bet pending spin PDA seed.
pub const PENDING_SEED: &[u8] = b"pending";
/// Per-game immutable config PDA seed.
pub const GAME_CONFIG_SEED: &[u8] = b"game_config";
/// Per-player credit vault PDA seed.
pub const VAULT_SEED: &[u8] = b"vault";
/// Global outstanding-player-credit ledger PDA seed.
pub const CREDITS_SEED: &[u8] = b"credits";
/// Per-player statistics PDA seed.
pub const SESSION_SEED: &[u8] = b"session";

/// Game IDs (stable on-chain identifiers).
pub const GAME_DICE: u8 = 1;
/// Neon Slots: scatter slot with 5 reels of 10 symbols.
pub const GAME_SLOTS: u8 = 2;
/// Pharaoh's Fortune: 5x4 grid slot with an expanding wild and simulated
/// free-spins round (settled in a single VRF callback).
pub const GAME_PHARAOH: u8 = 3;
/// Golden Dragon: 5x3 grid slot with pearl bonus tiers.
pub const GAME_DRAGON: u8 = 4;
/// Dynamite Mines: 6x3 cascading grid slot with escalating multipliers.
pub const GAME_MINES: u8 = 5;

/// House bankroll rule: a single bet may not exceed this fraction of the
/// treasury (1% => 100x coverage of the max payout).
pub const TREASURY_BANKROLL_DIVISOR: u64 = 100;

/// Neon Dice constants (roll is uniform over [0, 10_000)).
pub const DICE_ROLL_RANGE: u64 = 10_000;
/// House edge applied to Neon Dice payouts.
/// Multiplier (in basis points) = 98_000_000 / target, e.g. target 101
/// => ~970,297 bp = ~97.03x, target 9,800 => 10,000 bp = 1.00x.
pub const DICE_RTP_NUMERATOR: u64 = 98_000_000;

/// Neon Slots constants.
///
/// Five reels, each with 10 equiprobable symbols. The raw randomness is
/// split into base-10 digits, one per reel: symbol[i] = (raw / 10^i) % 10.
/// A spin wins when any symbol appears on at least 3 reels (scatter rules);
/// the best symbol is the most frequent one (ties break toward the higher
/// symbol index). Payout = base_bp[symbol] * X_{count}, capped at
/// `SLOTS_MAX_MULTIPLIER_BP` so a single bet can never pay out more than
/// `TREASURY_BANKROLL_DIVISOR` times its stake (bankroll invariant).
pub const SLOTS_REELS: u64 = 5;
pub const SLOTS_SYMBOLS: u64 = 10;
/// Base payout in basis points for a 3-of-a-kind of each symbol (index 0..=9).
/// 2x .. 26x; the top six symbols cap out at 100x on a 5-of-a-kind.
pub const SLOTS_BASE_BP: [u64; 10] = [
    20_000, 30_000, 40_000, 50_000, 60_000, 80_000, 100_000, 140_000, 180_000,
    260_000,
];
/// Multipliers applied to the base for 4-of-a-kind and 5-of-a-kind.
pub const SLOTS_X4: u64 = 4;
pub const SLOTS_X5: u64 = 20;
/// Max payout multiplier (100x), keeping payouts within the bankroll rule.
pub const SLOTS_MAX_MULTIPLIER_BP: u64 = 1_000_000;

// ---------------------------------------------------------------------------
// Grid games (Pharaoh's Fortune, Golden Dragon, Dynamite Mines).
//
// All three share the same scatter engine as Neon Slots, generalized to a
// two-dimensional grid: cells are filled from the randomness digit stream
// (each of the 8 u64 words of the VRF output yields 20 base-10 digits). A
// spin wins when a symbol appears on `min_count` or more cells anywhere on
// the grid — 4 for the 15-cell board, 5 for the 18/20-cell boards, whose
// larger fields would otherwise hit a 4-of-a-kind on nearly every spin.
// The winner is the most frequent symbol (ties break toward the higher
// index), and the payout is `base_bp[symbol] * 2^(count - min_count)`
// (capped at x4), never exceeding `SLOTS_MAX_MULTIPLIER_BP` so a single
// bet can never pay more than `TREASURY_BANKROLL_DIVISOR` times its stake.
// ---------------------------------------------------------------------------

/// Minimum winning count for the 15-cell Golden Dragon board.
pub const GRID_MIN_COUNT_DRAGON: u8 = 4;
/// Minimum winning count for the 18-cell Dynamite Mines board.
pub const GRID_MIN_COUNT_MINES: u8 = 5;
/// Minimum winning count for the 20-cell Pharaoh's Fortune board: raised to
/// 6 because the expanding wild makes 5-of-a-kinds too frequent on 20 cells.
pub const GRID_MIN_COUNT_PHARAOH: u8 = 6;

/// Pharaoh's Fortune: 5 reels x 4 rows = 20 cells.
pub const PHARAOH_REELS: u64 = 5;
pub const PHARAOH_ROWS: u64 = 4;
pub const PHARAOH_CELLS: usize = (PHARAOH_REELS * PHARAOH_ROWS) as usize;
/// The Pharaoh symbol expands: every Pharaoh substitutes into the most
/// frequent non-wild symbol before scoring.
pub const PHARAOH_WILD: u8 = 9;
/// The Scarab symbol triggers the free-spins round.
pub const PHARAOH_TRIGGER: u8 = 8;
/// 4+ scarabs award a simulated free-spins round of 3 extra boards.
pub const PHARAOH_FREE_SPINS_TRIGGER: u8 = 4;
pub const PHARAOH_FREE_SPINS: u32 = 3;
/// Base payout in basis points (calibrated via Monte-Carlo to ~95.5% RTP).
pub const PHARAOH_BASE_BP: [u64; 10] = [
    1_275, 1_900, 2_525, 3_175, 3_800, 5_050, 6_325, 8_850, 11_375, 16_425,
];

/// Golden Dragon: 5 reels x 3 rows = 15 cells.
pub const DRAGON_REELS: u64 = 5;
pub const DRAGON_ROWS: u64 = 3;
pub const DRAGON_CELLS: usize = (DRAGON_REELS * DRAGON_ROWS) as usize;
/// The Pearl symbol drives the bonus tiers.
pub const DRAGON_PEARL: u8 = 8;
/// 5+ pearls double the win.
pub const DRAGON_PEARL_BONUS: u8 = 5;
/// 9+ pearls triple the win.
pub const DRAGON_PEARL_JACKPOT: u8 = 9;
/// Base payout in basis points (calibrated via Monte-Carlo to ~95.5% RTP).
pub const DRAGON_BASE_BP: [u64; 10] = [
    2_725, 4_050, 5_425, 6_750, 8_100, 10_800, 13_500, 18_900, 24_300, 35_125,
];

/// Dynamite Mines: 6 reels x 3 rows = 18 cells, cascading.
pub const MINES_REELS: u64 = 6;
pub const MINES_ROWS: u64 = 3;
pub const MINES_CELLS: usize = (MINES_REELS * MINES_ROWS) as usize;
/// Up to 5 cascades per spin; each cascade level multiplies its win.
pub const MINES_CASCADE_MAX: u32 = 5;
/// Base payout in basis points (calibrated via Monte-Carlo to ~95.5% RTP).
pub const MINES_BASE_BP: [u64; 10] = [
    3_125, 4_675, 6_250, 7_800, 9_350, 12_475, 15_575, 21_775, 27_975, 40_400,
];

/// Anchor instruction discriminator prefix.
pub const IX_DISCRIMINATOR_NAMESPACE: &str = "global:";
