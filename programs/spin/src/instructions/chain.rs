//! House administration of the commit-reveal chain.

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::*;

fn start_epoch(chain: &mut ChainState, genesis: [u8; 32], length: u64) -> Result<()> {
    require!(length > 0 && length <= MAX_CHAIN_LENGTH, SpinError::ChainTooLong);
    chain.epoch = chain.epoch.checked_add(1).ok_or(SpinError::ArithmeticOverflow)?;
    chain.genesis = genesis;
    chain.commitment = genesis;
    chain.index = 0;
    chain.length = length;
    chain.active = true;
    emit!(ChainEpochStarted {
        epoch: chain.epoch,
        genesis,
        length,
    });
    Ok(())
}

/// Publishes the first chain epoch: `genesis` is `s_0`, the image of every
/// reveal to come.
pub fn init_chain(ctx: Context<InitChain>, genesis: [u8; 32], length: u64) -> Result<()> {
    let chain = &mut ctx.accounts.chain;
    chain.house = ctx.accounts.authority.key();
    chain.bump = ctx.bumps.chain;
    chain.epoch = 0;
    chain.next_seq = 0;
    chain.cursor = 0;
    chain.stalls = 0;
    start_epoch(chain, genesis, length)
}

#[derive(Accounts)]
pub struct InitChain<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        init,
        payer = authority,
        space = ChainState::SIZE,
        seeds = [CHAIN_SEED],
        bump
    )]
    pub chain: Account<'info, ChainState>,
    pub system_program: Program<'info, System>,
}

/// Starts a new epoch with a fresh chain. Only allowed once every bet of the
/// current epoch has been settled or cancelled, so no bet is ever stranded
/// under a commitment that can no longer be revealed.
pub fn rotate_chain(ctx: Context<RotateChain>, genesis: [u8; 32], length: u64) -> Result<()> {
    let chain = &mut ctx.accounts.chain;
    require!(chain.open_bets() == 0, SpinError::ChainHasOpenBets);
    chain.house = ctx.accounts.authority.key();
    start_epoch(chain, genesis, length)
}

/// Opens or closes the chain for new bets. Closing it does not affect open
/// bets, which can still be settled or cancelled.
pub fn set_chain_active(ctx: Context<RotateChain>, active: bool) -> Result<()> {
    ctx.accounts.chain.active = active;
    emit!(ChainActiveSet { active });
    Ok(())
}

#[derive(Accounts)]
pub struct RotateChain<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        mut,
        seeds = [CHAIN_SEED],
        bump = chain.bump
    )]
    pub chain: Account<'info, ChainState>,
}

#[event]
pub struct ChainEpochStarted {
    pub epoch: u64,
    pub genesis: [u8; 32],
    pub length: u64,
}

#[event]
pub struct ChainActiveSet {
    pub active: bool,
}
