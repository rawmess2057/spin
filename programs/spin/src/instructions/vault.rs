use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::{CreditLedger, HouseTreasury, PlayerVault};

// ---------------------------------------------------------------------------
// init_credits
// ---------------------------------------------------------------------------

/// Creates the global credit ledger. One-time bootstrap, alongside
/// `init_config`. `initial_total` lets a redeploy that kept existing player
/// vaults seed the ledger with the sum of their balances (0 on a fresh house).
pub fn init_credits(ctx: Context<InitCredits>, initial_total: u64) -> Result<()> {
    ctx.accounts.credits.total = initial_total;
    ctx.accounts.credits.reserved = 0;
    ctx.accounts.credits.bump = ctx.bumps.credits;
    msg!("Credit ledger initialized: {}", ctx.accounts.credits.key());
    Ok(())
}

#[derive(Accounts)]
pub struct InitCredits<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [HOUSE_SEED],
        bump = treasury.bump,
        has_one = authority @ SpinError::NotAuthority
    )]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        init,
        payer = authority,
        space = CreditLedger::SIZE,
        seeds = [CREDITS_SEED],
        bump
    )]
    pub credits: Account<'info, CreditLedger>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------

/// Buys credit: moves SOL from the player's wallet into the house treasury and
/// records the balance against their vault.
///
/// The lamports are deliberately commingled with the bankroll — the treasury
/// is what pays wins — so `credits.total` is incremented in lockstep to keep
/// the amount owed to players explicit and enforceable.
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, SpinError::BetBelowMinimum);

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    // `init_if_needed` leaves these zeroed on first use; set the identity so a
    // freshly created vault is immediately valid.
    vault.player = ctx.accounts.player.key();
    vault.bump = ctx.bumps.vault;
    vault.balance = vault
        .balance
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;

    let credits = &mut ctx.accounts.credits;
    credits.total = credits
        .total
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;

    emit!(CreditsDeposited {
        player: ctx.accounts.player.key(),
        amount,
        balance: vault.balance,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        init_if_needed,
        payer = player,
        space = PlayerVault::SIZE,
        seeds = [VAULT_SEED, player.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PlayerVault>,
    #[account(
        mut,
        seeds = [CREDITS_SEED],
        bump = credits.bump
    )]
    pub credits: Account<'info, CreditLedger>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------

/// Cashes credit back out to the player's wallet.
///
/// Deliberately requires the player's own signature: a session key may bet but
/// must never be able to move money out.
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, SpinError::BetBelowMinimum);

    let vault = &mut ctx.accounts.vault;
    require!(vault.balance >= amount, SpinError::InsufficientCredits);

    // The treasury must keep enough to stay rent-exempt after paying out.
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let rent_floor = Rent::get()?.minimum_balance(HouseTreasury::SIZE);
    require!(
        treasury_info
            .lamports()
            .checked_sub(amount)
            .ok_or(SpinError::TreasuryBalanceTooLow)?
            >= rent_floor,
        SpinError::TreasuryBalanceTooLow
    );

    vault.balance -= amount;

    let credits = &mut ctx.accounts.credits;
    credits.total = credits
        .total
        .checked_sub(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;

    // The treasury carries data, so the system program's Transfer CPI is
    // unusable; move lamports directly instead.
    treasury_info.sub_lamports(amount)?;
    ctx.accounts.player.to_account_info().add_lamports(amount)?;

    emit!(CreditsWithdrawn {
        player: ctx.accounts.player.key(),
        amount,
        balance: vault.balance,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        mut,
        seeds = [VAULT_SEED, player.key().as_ref()],
        bump = vault.bump,
        constraint = vault.player == player.key() @ SpinError::InvalidPlayer
    )]
    pub vault: Account<'info, PlayerVault>,
    #[account(
        mut,
        seeds = [CREDITS_SEED],
        bump = credits.bump
    )]
    pub credits: Account<'info, CreditLedger>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// set_delegate / revoke_delegate
// ---------------------------------------------------------------------------

/// Authorizes a session key to place bets for this player without the wallet
/// signing each one.
///
/// Both bounds are mandatory: `expiry_slot` must be in the future and
/// `spend_limit` must be non-zero, so an authorization can never be unbounded
/// in either time or value. `spend_limit` is a *net-loss* allowance: stakes
/// consume it and payouts/refunds restore it (see `PlayerVault`).
pub fn set_delegate(
    ctx: Context<SetDelegate>,
    delegate: Pubkey,
    expiry_slot: u64,
    spend_limit: u64,
) -> Result<()> {
    require!(delegate != Pubkey::default(), SpinError::InvalidDelegate);
    require!(spend_limit > 0, SpinError::DelegateLimitExceeded);
    require!(
        expiry_slot > Clock::get()?.slot,
        SpinError::DelegateExpired
    );

    let vault = &mut ctx.accounts.vault;
    vault.delegate = delegate;
    vault.delegate_expiry = expiry_slot;
    vault.delegate_spend_left = spend_limit;

    emit!(DelegateSet {
        player: ctx.accounts.player.key(),
        delegate,
        expiry_slot,
        spend_limit,
    });
    Ok(())
}

/// Immediately revokes the session key.
pub fn revoke_delegate(ctx: Context<SetDelegate>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.delegate = Pubkey::default();
    vault.delegate_expiry = 0;
    vault.delegate_spend_left = 0;

    emit!(DelegateRevoked {
        player: ctx.accounts.player.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetDelegate<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, player.key().as_ref()],
        bump = vault.bump,
        constraint = vault.player == player.key() @ SpinError::InvalidPlayer
    )]
    pub vault: Account<'info, PlayerVault>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct CreditsDeposited {
    pub player: Pubkey,
    pub amount: u64,
    pub balance: u64,
}

#[event]
pub struct CreditsWithdrawn {
    pub player: Pubkey,
    pub amount: u64,
    pub balance: u64,
}

#[event]
pub struct DelegateSet {
    pub player: Pubkey,
    pub delegate: Pubkey,
    pub expiry_slot: u64,
    pub spend_limit: u64,
}

#[event]
pub struct DelegateRevoked {
    pub player: Pubkey,
}
