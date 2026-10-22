pub mod constants;
pub mod error;
pub mod games;
pub mod instructions;
pub mod state;

#[allow(ambiguous_glob_reexports)]
pub use instructions::*;

use anchor_lang::prelude::*;

declare_id!("9sd7ASeBUmcCNm4eVFfQ7rSujtbVLmu8wMUh9PwdNWvP");

#[program]
pub mod spin {
    use super::*;

    // Admin
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        admin::init_config(ctx)
    }

    pub fn init_game_config(
        ctx: Context<InitGameConfig>,
        game_id: u8,
        min_bet: u64,
        max_bet: u64,
    ) -> Result<()> {
        admin::init_game_config(ctx, game_id, min_bet, max_bet)
    }

    pub fn set_game_limits(
        ctx: Context<SetGameLimits>,
        min_bet: u64,
        max_bet: u64,
        paused: bool,
    ) -> Result<()> {
        admin::set_game_limits(ctx, min_bet, max_bet, paused)
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        admin::set_paused(ctx, paused)
    }

    pub fn treasury_deposit(ctx: Context<TreasuryDeposit>, amount: u64) -> Result<()> {
        admin::treasury_deposit(ctx, amount)
    }

    pub fn treasury_withdraw(ctx: Context<TreasuryWithdraw>, amount: u64) -> Result<()> {
        admin::treasury_withdraw(ctx, amount)
    }

    // Player credit vault
    pub fn init_credits(ctx: Context<InitCredits>, initial_total: u64) -> Result<()> {
        vault::init_credits(ctx, initial_total)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        vault::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        vault::withdraw(ctx, amount)
    }

    pub fn set_delegate(
        ctx: Context<SetDelegate>,
        delegate: Pubkey,
        expiry_slot: u64,
        spend_limit: u64,
    ) -> Result<()> {
        vault::set_delegate(ctx, delegate, expiry_slot, spend_limit)
    }

    pub fn revoke_delegate(ctx: Context<SetDelegate>) -> Result<()> {
        vault::revoke_delegate(ctx)
    }

    // Betting (commit-reveal)
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        game_id: u8,
        amount: u64,
        target: u64,
        client_seed: [u8; 32],
    ) -> Result<()> {
        bet::place_bet(ctx, game_id, amount, target, client_seed)
    }

    pub fn settle_bet(ctx: Context<SettleBet>, reveal: [u8; 32]) -> Result<()> {
        bet::settle_bet(ctx, reveal)
    }

    pub fn cancel_bet(ctx: Context<CancelBet>) -> Result<()> {
        bet::cancel_bet(ctx)
    }

    // Chain administration
    pub fn init_chain(ctx: Context<InitChain>, genesis: [u8; 32], length: u64) -> Result<()> {
        chain::init_chain(ctx, genesis, length)
    }

    pub fn rotate_chain(ctx: Context<RotateChain>, genesis: [u8; 32], length: u64) -> Result<()> {
        chain::rotate_chain(ctx, genesis, length)
    }

    pub fn set_chain_active(ctx: Context<RotateChain>, active: bool) -> Result<()> {
        chain::set_chain_active(ctx, active)
    }
}
