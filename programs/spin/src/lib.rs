pub mod constants;
pub mod error;
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
        house_edge_bp: u16,
        params: [u8; 32],
    ) -> Result<()> {
        admin::init_game_config(ctx, game_id, min_bet, max_bet, house_edge_bp, params)
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
    pub fn init_credits(ctx: Context<InitCredits>) -> Result<()> {
        vault::init_credits(ctx)
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

    // Betting
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        game_id: u8,
        amount: u64,
        target: u64,
        seed: [u8; 32],
    ) -> Result<()> {
        bet::place_bet(ctx, game_id, amount, target, seed)
    }

    pub fn resolve_spin(ctx: Context<ResolveSpin>) -> Result<()> {
        bet::resolve_spin(ctx)
    }

    pub fn refund_spin(ctx: Context<RefundSpin>, seed: [u8; 32]) -> Result<()> {
        bet::refund_spin(ctx, seed)
    }
}
