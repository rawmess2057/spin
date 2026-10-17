use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::{CreditLedger, GameConfig, HouseTreasury};

/// Creates the house treasury.
pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
    ctx.accounts.treasury.authority = ctx.accounts.authority.key();
    ctx.accounts.treasury.paused = false;
    ctx.accounts.treasury.bump = ctx.bumps.treasury;
    msg!("House treasury initialized: {}", ctx.accounts.treasury.key());
    Ok(())
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = HouseTreasury::SIZE,
        seeds = [HOUSE_SEED],
        bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    pub system_program: Program<'info, System>,
}

/// Registers a game: creates its limits account. The paytable is code.
pub fn init_game_config(
    ctx: Context<InitGameConfig>,
    game_id: u8,
    min_bet: u64,
    max_bet: u64,
) -> Result<()> {
    // The registry must know the game, or bets on it could never settle.
    crate::games::max_multiplier_bp(game_id, crate::games::default_target(game_id)?)?;
    require!(min_bet > 0 && max_bet >= min_bet, SpinError::BetBelowMinimum);
    let config = &mut ctx.accounts.config;
    config.game_id = game_id;
    config.min_bet = min_bet;
    config.max_bet = max_bet;
    config.paused = false;
    config.bump = ctx.bumps.config;
    msg!("Game {} registered: min={} max={}", game_id, min_bet, max_bet);
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u8)]
pub struct InitGameConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        init,
        payer = authority,
        space = GameConfig::SIZE,
        seeds = [GAME_CONFIG_SEED, &[game_id]],
        bump
    )]
    pub config: Account<'info, GameConfig>,
    pub system_program: Program<'info, System>,
}

/// Adjusts a game's bet limits or pauses it. Open bets are unaffected: their
/// stake and reservation were fixed at placement.
pub fn set_game_limits(
    ctx: Context<SetGameLimits>,
    min_bet: u64,
    max_bet: u64,
    paused: bool,
) -> Result<()> {
    require!(min_bet > 0 && max_bet >= min_bet, SpinError::BetBelowMinimum);
    let config = &mut ctx.accounts.config;
    config.min_bet = min_bet;
    config.max_bet = max_bet;
    config.paused = paused;
    Ok(())
}

#[derive(Accounts)]
pub struct SetGameLimits<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        mut,
        seeds = [GAME_CONFIG_SEED, &[config.game_id]],
        bump = config.bump
    )]
    pub config: Account<'info, GameConfig>,
}

/// Pauses / resumes betting house-wide.
pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.treasury.paused = paused;
    msg!("House paused: {}", paused);
    Ok(())
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        has_one = authority @ SpinError::NotAuthority,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    pub authority: Signer<'info>,
}

/// Funds the bankroll from the authority wallet.
pub fn treasury_deposit(ctx: Context<TreasuryDeposit>, amount: u64) -> Result<()> {
    if amount > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                anchor_lang::system_program::ID,
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            amount,
        )?;
    }
    Ok(())
}

/// Withdraws bankroll profit (authority only).
///
/// Player deposits are commingled here, so the withdrawal is capped at what is
/// genuinely the house's: whatever remains after covering every outstanding
/// player credit, every payout reserved by an open bet, and the treasury's
/// own rent. This is what makes the house authority unable to take player
/// money or money an in-flight bet may win.
pub fn treasury_withdraw(ctx: Context<TreasuryWithdraw>, amount: u64) -> Result<()> {
    let treasury_lamports = ctx.accounts.treasury.get_lamports();
    require!(amount <= treasury_lamports, SpinError::TreasuryBalanceTooLow);

    let rent_floor = Rent::get()?.minimum_balance(HouseTreasury::SIZE);
    let committed = ctx
        .accounts
        .credits
        .total
        .checked_add(ctx.accounts.credits.reserved)
        .and_then(|v| v.checked_add(rent_floor))
        .ok_or(SpinError::ArithmeticOverflow)?;
    require!(
        treasury_lamports.saturating_sub(amount) >= committed,
        SpinError::TreasuryInsolvent
    );

    // The system program's Transfer requires `from` to carry no data, so the
    // treasury (a data-carrying PDA) is moved via direct lamport ops.
    ctx.accounts.treasury.to_account_info().sub_lamports(amount)?;
    ctx.accounts.authority.to_account_info().add_lamports(amount)?;
    Ok(())
}

#[derive(Accounts)]
pub struct TreasuryDeposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ SpinError::NotAuthority,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TreasuryWithdraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ SpinError::NotAuthority,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        seeds = [CREDITS_SEED],
        bump = credits.bump
    )]
    pub credits: Account<'info, CreditLedger>,
    pub system_program: Program<'info, System>,
}
