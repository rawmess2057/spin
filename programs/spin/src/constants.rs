//! Program-wide constants: PDA seeds, chain and bankroll parameters, game ids.
//!
//! Per-game paytables live next to their evaluators in `crate::games`.

/// House treasury PDA seed.
pub const HOUSE_SEED: &[u8] = b"house";
/// Per-game configuration PDA seed (`["game", game_id]`).
///
/// The v1 program used `"game_config"`, `"credits"` and `"chain"`; those
/// accounts have a different layout and still exist on devnet, so the v2
/// seeds differ and the old accounts are simply never read again.
pub const GAME_CONFIG_SEED: &[u8] = b"game";
/// Per-player credit vault PDA seed (`["vault", player]`).
pub const VAULT_SEED: &[u8] = b"vault";
/// Global outstanding-player-credit ledger PDA seed.
pub const CREDITS_SEED: &[u8] = b"ledger";
/// Per-player statistics PDA seed (`["session", player]`).
pub const SESSION_SEED: &[u8] = b"session";
/// House commit-reveal chain PDA seed.
pub const CHAIN_SEED: &[u8] = b"chain2";
/// Per-player bet PDA seed (`["bet", player]`): one open bet per player.
pub const BET_SEED: &[u8] = b"bet";

/// Maximum number of reveals a single chain epoch may hold.
pub const MAX_CHAIN_LENGTH: u64 = 1_000_000;

/// Bankroll rule: the maximum possible payout of a single bet may not exceed
/// this fraction of the house's *free* bankroll (treasury lamports minus
/// rent, minus every credit owed to players, minus every payout already
/// reserved by an open bet). 4 => one bet can risk at most 25% of it.
pub const MAX_PAYOUT_BANKROLL_DIVISOR: u64 = 4;

/// Slots after which an unsettled bet may be cancelled by anyone and the
/// stake refunded (~60 s at 400 ms slots). Bounds how long the house can
/// stall a settlement.
pub const BET_TIMEOUT_SLOTS: u64 = 150;

// ---------------------------------------------------------------------------
// Game ids — mirrored in frontend/app/lib/games/registry.ts
// ---------------------------------------------------------------------------

pub const GAME_PLINKO: u8 = 7;
pub const GAME_MEGAWAYS: u8 = 8;
pub const GAME_WHEEL: u8 = 9;
pub const GAME_HOLD_SPIN: u8 = 10;
