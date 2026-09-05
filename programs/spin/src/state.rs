use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::*;

// ---------------------------------------------------------------------------
// Our program state
// ---------------------------------------------------------------------------

/// Central house bankroll PDA. Holds all SOL bets and pays out wins.
#[account]
pub struct HouseTreasury {
    pub authority: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

impl HouseTreasury {
    pub const SIZE: usize = 8 + 32 + 1 + 1;
}

/// Immutable per-game configuration (set once at initialization).
#[account]
pub struct GameConfig {
    pub game_id: u8,
    pub min_bet: u64,
    pub max_bet: u64,
    /// House edge in basis points (e.g. 200 = 2%).
    pub house_edge_bp: u16,
    /// Game-specific params (reserved; grid/slot games ignore these).
    pub params: [u8; 32],
    pub bump: u8,
}

impl GameConfig {
    pub const SIZE: usize = 8 + 1 + 8 + 8 + 2 + 32 + 1;
}

/// Per-player credit vault.
///
/// Holds the lamports a player has bought in with, expressed as a plain
/// balance rather than lamports sitting in this account: the lamports
/// themselves live in [`HouseTreasury`] (deposited there by `deposit`), and
/// [`CreditLedger::total`] tracks the sum of every vault balance so the house
/// can be prevented from withdrawing money it owes players.
///
/// `delegate` is an optional session key that may place bets on the player's
/// behalf without the player's wallet signing each one. It is deliberately
/// bounded on two axes — a slot deadline and a remaining spend cap — so a
/// stolen session key can lose a known maximum. It can never withdraw.
#[account]
pub struct PlayerVault {
    pub player: Pubkey,
    /// Wagerable lamports credited to this player.
    pub balance: u64,
    /// Session key authorized to bet for this player; default() = none.
    pub delegate: Pubkey,
    /// Slot after which `delegate` is no longer accepted.
    pub delegate_expiry: u64,
    /// Lamports the delegate may still wager before re-authorization.
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

/// Total lamports credited to players across every [`PlayerVault`].
///
/// Player deposits are commingled with the bankroll in [`HouseTreasury`], so
/// this is the only record of how much of that balance is owed. It gates
/// `treasury_withdraw`, which is what stops the house authority from
/// withdrawing player funds.
#[account]
pub struct CreditLedger {
    pub total: u64,
    pub bump: u8,
}

impl CreditLedger {
    pub const SIZE: usize = 8 + 8 + 1;
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

/// VRF request authority. Signs every request CPI; registered with ORAO.
#[account]
pub struct VrfState {
    pub bump: u8,
}

impl VrfState {
    pub const SIZE: usize = 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum PendingStatus {
    AwaitingResolution,
    Resolved,
}

/// A bet in flight: placed, waiting on VRF fulfillment.
#[account]
pub struct PendingSpin {
    pub player: Pubkey,
    pub game_id: u8,
    pub amount: u64,
    /// Games other than Dice ignored the target (frontends send 0).
    pub target: u64,
    /// The VRF request seed (also the `pending` PDA seed component).
    pub seed: [u8; 32],
    pub status: PendingStatus,
    pub created_slot: u64,
    /// Who paid this account's rent — the player or their session key. Rent is
    /// returned here when the spin resolves or is refunded.
    pub rent_payer: Pubkey,
    pub bump: u8,
}

impl PendingSpin {
    pub const SIZE: usize = 8 + 32 + 1 + 8 + 8 + 32 + 1 + 8 + 32 + 1;
}

/// The house's instant reveal chain.
///
/// One global chain serves every game. The house commits to `length` reveals
/// by publishing a `seed`: reveal *i* is `sha256(seed || i.to_le_bytes())`,
/// and the chain is consumed in reverse order (index 0 first, i.e. the
/// reveal for index 0 is `sha256(seed || 0x0000..0)`), so the house has no
/// way to choose outcomes after the fact. Each `spin_chain` consumes exactly
/// one reveal, which is passed as the instruction's `reveal` argument and
/// must equal the current head — the chain's derived value at `index`. A
/// concurrent spin that races for the same reveal gets `ChainStale` and the
/// client simply refetches the next one.
///
/// The 64 bytes of randomness for outcome evaluation are
/// `reveal || sha256(reveal)`, which a client can reproduce offline to
/// verify any past spin against this account's seed and index.
#[account]
pub struct ChainState {
    /// House authority that initialized the chain.
    pub house: Pubkey,
    /// Chain seed; reveal i = sha256(seed || i.to_le_bytes()).
    pub seed: [u8; 32],
    /// The next unconsumed reveal index (0..length).
    pub index: u64,
    /// Total number of reveals in this chain.
    pub length: u64,
    /// Whether the chain accepts spins.
    pub active: bool,
    /// When true, the legacy VRF betting path is accepted instead of the
    /// chain. `init_chain` turns it off; `set_chain_mode` can restore it for
    /// rollback. `spin_chain` rejects when it is true, and clients refuse to
    /// call the VRF path when the chain exists and it is false.
    pub vrf_enabled: bool,
    pub bump: u8,
}

impl ChainState {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 1;

    /// The reveal the chain currently expects: sha256(seed || index LE).
    pub fn head(&self) -> [u8; 32] {
        chain_head(&self.seed, self.index)
    }
}

/// reveal i = sha256(seed || i.to_le_bytes()).
pub fn chain_head(seed: &[u8; 32], index: u64) -> [u8; 32] {
    let mut input = [0u8; 40];
    input[..32].copy_from_slice(seed);
    input[32..].copy_from_slice(&index.to_le_bytes());
    hash(&input).to_bytes()
}

// ---------------------------------------------------------------------------
// ORAO VRF Callback program mirror types.
//
// These mirror the account layouts of the ORAO Callback VRF program
// (VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU) so we can read its accounts
// and build its `Request` CPI without depending on the (solana-2.x-era)
// orao-solana-vrf-cb crate.
//
// Discriminators are derived from the struct names, which match the ORAO
// program's own types, so `Account<'info, T>` validation works directly.
// ---------------------------------------------------------------------------

/// ORAO VRF network state PDA ([`VRF_CONFIG_SEED`]).
#[account]
pub struct NetworkState {
    pub bump: u8,
    pub config: NetworkConfiguration,
    pub num_requests: u64,
    pub num_registered: u64,
    pub num_terminated: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct NetworkConfiguration {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub request_fee: u64,
    pub callback_deadline: u64,
    pub fulfill_authorities: Vec<Pubkey>,
}

/// ORAO VRF client PDA ([`VRF_CLIENT_SEED`], program, state).
#[account]
pub struct Client {
    pub bump: u8,
    pub owner: Pubkey,
    pub program: Pubkey,
    pub state: Pubkey,
    pub num_requests: u64,
    pub callback: Option<ValidatedCallback>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ValidatedCallback {
    pub remaining_accounts: Vec<ValidatedRemainingAccount>,
    pub data: Vec<u8>,
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct ValidatedRemainingAccount {
    pub pubkey: Pubkey,
    pub is_writable: bool,
}

/// ORAO VRF request PDA ([`VRF_REQUEST_SEED`], client, seed).
#[account]
pub struct RequestAccount {
    pub bump: u8,
    pub slot: u64,
    pub client: Pubkey,
    pub seed: [u8; 32],
    pub state: RequestState,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub enum RequestState {
    Pending(Pending),
    Fulfilled(Fulfilled),
}

impl RequestState {
    pub fn fulfilled(&self) -> Option<&Fulfilled> {
        match self {
            RequestState::Pending(_) => None,
            RequestState::Fulfilled(x) => Some(x),
        }
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Pending {
    pub responses: Vec<Response>,
    pub callback: Option<ValidatedCallback>,
    pub callback_override: bool,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Fulfilled {
    pub randomness: [u8; 64],
    pub responses: Option<Vec<Response>>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Response {
    pub pubkey: Pubkey,
    pub randomness: [u8; 64],
}

// ---------------------------------------------------------------------------
// ORAO `Request` CPI payload builders (serialize-only)
// ---------------------------------------------------------------------------

/// Parameters of the ORAO `Request` instruction (borsh layout).
#[derive(Clone, AnchorSerialize)]
pub struct RequestParams {
    pub seed: [u8; 32],
    pub callback: Option<Callback>,
}

impl RequestParams {
    pub fn new(seed: [u8; 32]) -> Self {
        Self {
            seed,
            callback: None,
        }
    }

    pub fn with_callback(mut self, callback: Callback) -> Self {
        self.callback = Some(callback);
        self
    }
}

/// Request-level callback definition.
#[derive(Clone, AnchorSerialize)]
pub struct Callback {
    pub remaining_accounts: Vec<RemainingAccount>,
    pub data: Vec<u8>,
}

#[derive(Clone, AnchorSerialize)]
pub struct RemainingAccount {
    pub pubkey: Pubkey,
    pub seeds: Option<Vec<Vec<u8>>>,
}

impl RemainingAccount {
    /// Read-only account.
    pub fn readonly(pubkey: Pubkey) -> Self {
        Self {
            pubkey,
            seeds: None,
        }
    }

    /// Writable account authorized by passing it as writable to the request.
    pub fn arbitrary_writable(pubkey: Pubkey) -> Self {
        Self {
            pubkey,
            seeds: Some(Vec::new()),
        }
    }

    /// Writable PDA of our program, verified by seeds.
    pub fn writable(pubkey: Pubkey, seeds: Vec<Vec<u8>>) -> Self {
        Self {
            pubkey,
            seeds: Some(seeds),
        }
    }
}

/// PDA derivation helpers for ORAO accounts.
pub fn vrf_network_state_address() -> Pubkey {
    Pubkey::find_program_address(&[VRF_CONFIG_SEED], &VRF_PROGRAM_ID).0
}

pub fn vrf_client_address(state: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[VRF_CLIENT_SEED, crate::ID.as_ref(), state.as_ref()],
        &VRF_PROGRAM_ID,
    )
    .0
}

pub fn vrf_request_address(client: &Pubkey, seed: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[VRF_REQUEST_SEED, client.as_ref(), seed],
        &VRF_PROGRAM_ID,
    )
    .0
}

/// Our program's PDA derivation helpers.
pub fn house_address() -> Pubkey {
    Pubkey::find_program_address(&[HOUSE_SEED], &crate::ID).0
}

pub fn vrf_state_address() -> Pubkey {
    Pubkey::find_program_address(&[VRF_STATE_SEED], &crate::ID).0
}

pub fn pending_address(seed: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[PENDING_SEED, seed], &crate::ID).0
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
