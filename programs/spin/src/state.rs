use anchor_lang::prelude::*;

use crate::constants::*;

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

/// Central house bankroll PDA. Holds every player deposit and the house's own
/// bankroll in one lamport balance; [`CreditLedger`] records how much of it
/// is owed to players.
#[account]
pub struct HouseTreasury {
    pub authority: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

impl HouseTreasury {
    pub const SIZE: usize = 8 + 32 + 1 + 1;
}

/// Per-game bet limits. Created once per game id; the limits can be adjusted
/// by the authority with `set_game_limits`. The paytable itself is code
/// (`crate::games`) and never changes under a live bet.
#[account]
pub struct GameConfig {
    pub game_id: u8,
    pub min_bet: u64,
    pub max_bet: u64,
    /// Per-game pause switch (the treasury has a house-wide one).
    pub paused: bool,
    pub bump: u8,
}

impl GameConfig {
    pub const SIZE: usize = 8 + 1 + 8 + 8 + 1 + 1;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/// Per-player credit vault.
///
/// `balance` is a plain number: the lamports themselves sit in
/// [`HouseTreasury`] (moved there by `deposit`), and [`CreditLedger::total`]
/// tracks the sum of every vault balance so the house can be prevented from
/// withdrawing money it owes players.
///
/// `delegate` is an optional session key that may place bets on the player's
/// behalf without the wallet signing each one. It is bounded by a slot
/// deadline and a *net-loss* allowance: `delegate_spend_left` goes down by the
/// stake on every bet and back up by the payout when it settles (or by the
/// stake when it is cancelled), so winnings can be re-wagered without a new
/// wallet prompt while a stolen key can still lose at most the allowance. It
/// can never withdraw.
#[account]
pub struct PlayerVault {
    pub player: Pubkey,
    /// Wagerable lamports credited to this player.
    pub balance: u64,
    /// Session key authorized to bet for this player; default() = none.
    pub delegate: Pubkey,
    /// Slot after which `delegate` is no longer accepted.
    pub delegate_expiry: u64,
    /// Net lamports the delegate may still lose before re-authorization.
    pub delegate_spend_left: u64,
    pub bump: u8,
}

impl PlayerVault {
    pub const SIZE: usize = 8 + 32 + 8 + 32 + 8 + 8 + 1;

    /// True when `key` may place bets for this vault at `slot`.
    pub fn delegate_valid(&self, key: &Pubkey, slot: u64) -> bool {
        self.delegate != Pubkey::default() && &self.delegate == key && slot < self.delegate_expiry
    }
}

/// Global accounting of what the treasury does *not* own.
///
/// `total` is the sum of every [`PlayerVault::balance`]; `reserved` is the
/// sum of the maximum possible payout of every open bet. Together they gate
/// `treasury_withdraw` and the bankroll check in `place_bet`, which is what
/// keeps the house solvent: a bet is only accepted if its best case can be
/// paid from lamports nobody else has a claim on.
#[account]
pub struct CreditLedger {
    pub total: u64,
    pub reserved: u64,
    pub bump: u8,
}

impl CreditLedger {
    pub const SIZE: usize = 8 + 8 + 8 + 1;
}

/// Per-player statistics.
#[account]
pub struct PlayerSession {
    pub player: Pubkey,
    pub wagered: u64,
    pub won: u64,
    pub bets: u64,
    pub bump: u8,
}

impl PlayerSession {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1;
}

// ---------------------------------------------------------------------------
// Commit-reveal chain
// ---------------------------------------------------------------------------

/// The house's commit-reveal hash chain.
///
/// Offline, the house draws a secret and computes `s_N = sha256(secret)`,
/// `s_i = sha256(s_{i+1})`. It publishes only `s_0` (`genesis`), which
/// becomes the first `commitment`. Settling bet after bet, the house reveals
/// `s_1, s_2, …`: each must hash to the current commitment and then becomes
/// the new commitment. Every value was fixed when the chain was generated and
/// nobody can invert the hash, so the house cannot pick a reveal and a player
/// cannot predict one.
///
/// Bets are settled strictly in the order they were placed (`cursor` chases
/// `next_seq`). Stalling one bet therefore stalls every later one — publicly —
/// and after [`BET_TIMEOUT_SLOTS`] anyone may cancel the head bet, refund its
/// stake and bump `stalls`.
#[account]
pub struct ChainState {
    /// House authority that published this epoch.
    pub house: Pubkey,
    /// Incremented on every rotation; bets bind to the epoch they were
    /// placed in and can only settle within it.
    pub epoch: u64,
    /// `s_0` of this epoch, kept for verifying historical bets.
    pub genesis: [u8; 32],
    /// Current tip: the hash the next reveal must have as its image.
    pub commitment: [u8; 32],
    /// Reveals consumed in this epoch (the index of `commitment`).
    pub index: u64,
    /// Reveals available in this epoch.
    pub length: u64,
    /// FIFO ticket handed to the next bet placed.
    pub next_seq: u64,
    /// Ticket of the bet that must be settled or cancelled next.
    pub cursor: u64,
    /// Bets cancelled after a timeout — a public record of house stalls.
    pub stalls: u64,
    /// Whether the chain accepts new bets.
    pub active: bool,
    pub bump: u8,
}

impl ChainState {
    pub const SIZE: usize = 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1;

    pub fn open_bets(&self) -> u64 {
        self.next_seq.saturating_sub(self.cursor)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BetStatus {
    None,
    Open,
    Settled,
    Cancelled,
}

/// A player's bet account (`["bet", player]`): one per player, created on
/// their first bet and reused for every later one. While `status == Open` the
/// stake has been debited and `reserved` lamports of bankroll are held; the
/// result fields are filled by `settle_bet` and stay readable until the next
/// `place_bet` overwrites them.
#[account]
pub struct BetState {
    pub player: Pubkey,
    /// Per-player bet counter; mixed into the randomness.
    pub nonce: u64,
    /// Global FIFO ticket from `ChainState::next_seq`.
    pub seq: u64,
    pub chain_epoch: u64,
    pub game_id: u8,
    pub status: BetStatus,
    pub amount: u64,
    pub target: u64,
    /// 32 random bytes chosen by the player's client at bet time.
    pub client_seed: [u8; 32],
    /// Maximum payout held against the bankroll while the bet is open.
    pub reserved: u64,
    pub placed_slot: u64,
    /// `ChainState::index` when the bet was placed.
    pub index_at_place: u64,
    /// `ChainState::commitment` when the bet was placed. Verifying a bet is
    /// `sha256^(reveal_index - index_at_place)(reveal) == commitment`.
    pub commitment: [u8; 32],
    // --- filled by settle_bet ---
    pub reveal: [u8; 32],
    /// `ChainState::index` after this bet's reveal was consumed.
    pub reveal_index: u64,
    /// Game-specific outcome summary (Plinko bucket, Megaways total bp, ...).
    pub roll: u64,
    pub payout: u64,
    pub settled_slot: u64,
    pub bump: u8,
}

impl BetState {
    pub const SIZE: usize =
        8 + 32 + 8 + 8 + 8 + 1 + 1 + 8 + 8 + 32 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1;
}

// ---------------------------------------------------------------------------
// PDA helpers (used by tests and off-chain tooling)
// ---------------------------------------------------------------------------

pub fn house_address() -> Pubkey {
    Pubkey::find_program_address(&[HOUSE_SEED], &crate::ID).0
}

pub fn game_config_address(game_id: u8) -> Pubkey {
    Pubkey::find_program_address(&[GAME_CONFIG_SEED, &[game_id]], &crate::ID).0
}

pub fn player_session_address(player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SESSION_SEED, player.as_ref()], &crate::ID).0
}

pub fn player_vault_address(player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[VAULT_SEED, player.as_ref()], &crate::ID).0
}

pub fn credits_address() -> Pubkey {
    Pubkey::find_program_address(&[CREDITS_SEED], &crate::ID).0
}

pub fn chain_address() -> Pubkey {
    Pubkey::find_program_address(&[CHAIN_SEED], &crate::ID).0
}

pub fn bet_address(player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[BET_SEED, player.as_ref()], &crate::ID).0
}
