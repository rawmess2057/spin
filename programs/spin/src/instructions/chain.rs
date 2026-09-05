use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::*;

/// Authenticates the signer against the vault and debits the stake, mirroring
/// `place_bet`'s rules: the player themselves or their session delegate, with
/// the delegate's spend cap applied. The stake is already sitting in the
/// treasury (moved there by `deposit`), so only the vault balance and the
/// outstanding-credit ledger change.
fn authorize_and_debit(
    authority: &Pubkey,
    player: &Pubkey,
    vault: &mut PlayerVault,
    credits: &mut CreditLedger,
    amount: u64,
    slot: u64,
) -> Result<()> {
    if authority != player {
        // Checked separately from the expiry so the client can tell "not your
        // session key" apart from "re-authorize me".
        require!(
            vault.delegate != Pubkey::default() && vault.delegate == *authority,
            SpinError::InvalidDelegate
        );
        require!(slot < vault.delegate_expiry, SpinError::DelegateExpired);
        require!(
            amount <= vault.delegate_spend_left,
            SpinError::DelegateLimitExceeded
        );
        vault.delegate_spend_left -= amount;
    }

    require!(vault.balance >= amount, SpinError::InsufficientCredits);
    vault.balance -= amount;

    // The stake stops being money we owe the player and becomes house risk.
    credits.total = credits
        .total
        .checked_sub(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// init_chain
// ---------------------------------------------------------------------------

/// Commits the house to a reveal chain by publishing its seed. Creates the
/// `ChainState` account, or — when the existing chain is inactive or fully
/// consumed — replaces it (new seed, index reset) to rotate chains.
///
/// `init_chain` also switches the house out of VRF mode (`vrf_enabled` starts
/// false). Clients stop calling the legacy `place_bet` path once the chain
/// account exists, and `spin_chain` refuses to run while `vrf_enabled` is
/// true, so the chain and VRF paths can never both be accepting bets.
pub fn init_chain(ctx: Context<InitChain>, seed: [u8; 32], length: u64) -> Result<()> {
    require!(length > 0 && length <= MAX_CHAIN_LENGTH, SpinError::ChainTooLong);

    if ctx.accounts.chain.to_account_info().data_is_empty() {
        // Fresh account (init_if_needed).
    } else {
        // Rotation: the old chain must be finished or retired.
        require!(
            !ctx.accounts.chain.active
                || ctx.accounts.chain.index >= ctx.accounts.chain.length,
            SpinError::ChainStillActive
        );
    }

    let chain = &mut ctx.accounts.chain;
    chain.house = ctx.accounts.authority.key();
    chain.seed = seed;
    chain.index = 0;
    chain.length = length;
    chain.active = true;
    chain.vrf_enabled = false;
    chain.bump = ctx.bumps.chain;

    emit!(ChainInitialized {
        house: ctx.accounts.authority.key(),
        seed,
        length,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(seed: [u8; 32], length: u64)]
pub struct InitChain<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        init_if_needed,
        payer = authority,
        space = ChainState::SIZE,
        seeds = [CHAIN_SEED],
        bump
    )]
    pub chain: Account<'info, ChainState>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// set_chain_mode
// ---------------------------------------------------------------------------

/// House-only switch between the instant chain and the legacy VRF path.
/// `active` gates `spin_chain`; `vrf_enabled` records whether the VRF path
/// is in service (clients honor it by refusing to call `place_bet` when the
/// chain is live). Flipping `vrf_enabled` off never strands a pending spin:
/// the ORAO program fulfills requests autonomously.
pub fn set_chain_mode(ctx: Context<SetChainMode>, active: bool, vrf_enabled: bool) -> Result<()> {
    let chain = &mut ctx.accounts.chain;
    chain.active = active;
    chain.vrf_enabled = vrf_enabled;
    emit!(ChainModeSet { active, vrf_enabled });
    Ok(())
}

#[derive(Accounts)]
pub struct SetChainMode<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority @ SpinError::NotAuthority)]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        mut,
        seeds = [CHAIN_SEED],
        bump = chain.bump,
        constraint = chain.house == authority.key() @ SpinError::NotAuthority
    )]
    pub chain: Account<'info, ChainState>,
}

// ---------------------------------------------------------------------------
// spin_chain
// ---------------------------------------------------------------------------

/// The instant spin: consumes the reveal at the chain head, evaluates the
/// game's paytable, and settles the bet atomically — one transaction, no
/// oracle wait, no pending state to refund.
///
/// The signer is the `authority`: either the player themselves or the session
/// key they authorized via `set_delegate`. The grid and slot games ignore
/// `target` (frontends send 0). `reveal` must equal the current chain head; a
/// race with another spinner yields `ChainStale`, and the client refetches.
pub fn spin_chain(
    ctx: Context<SpinChain>,
    game_id: u8,
    amount: u64,
    _target: u64,
    reveal: [u8; 32],
) -> Result<()> {
    require!(!ctx.accounts.treasury.paused, SpinError::HousePaused);

    let chain = &mut ctx.accounts.chain;
    require!(chain.active, SpinError::ChainInactive);
    require!(!chain.vrf_enabled, SpinError::VrfBettingDisabled);

    let config = &ctx.accounts.config;
    require!(game_id == config.game_id, SpinError::UnknownGame);
    require!(amount >= config.min_bet, SpinError::BetBelowMinimum);
    require!(amount <= config.max_bet, SpinError::BetAboveMaximum);

    let treasury_lamports = ctx.accounts.treasury.get_lamports();
    require!(
        amount.checked_mul(TREASURY_BANKROLL_DIVISOR)
            .ok_or(SpinError::ArithmeticOverflow)?
            <= treasury_lamports,
        SpinError::BetExceedsBankrollLimit
    );

    // Consume exactly one reveal: the one at the current head. An attacker
    // can't skip ahead, and a spinner who loses the race (another tx landed
    // first) gets ChainStale instead of an outcome they didn't pay for.
    require!(reveal == chain.head(), SpinError::ChainStale);
    chain.index = chain
        .index
        .checked_add(1)
        .ok_or(SpinError::ArithmeticOverflow)?;
    require!(chain.index <= chain.length, SpinError::ChainExhausted);

    // 1. Authorize the signer and debit the stake.
    let slot = Clock::get()?.slot;
    let authority = ctx.accounts.authority.key();
    let player = ctx.accounts.player.key();
    let vault = &mut ctx.accounts.vault;
    authorize_and_debit(
        &authority,
        &player,
        vault,
        &mut ctx.accounts.credits,
        amount,
        slot,
    )?;

    // 2. Record stats.
    let session = &mut ctx.accounts.session;
    session.wagered = session
        .wagered
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    session.bets = session.bets.saturating_add(1);

    // 3. Evaluate and settle — atomically, in the same transaction.
    //
    // The 64-byte randomness is `reveal || sha256(reveal)`, matching the
    // client-side `chainRandomness` derivation so both sides agree on the
    // outcome.
    let randomness = {
        let h = solana_sha256_hasher::hash(&reveal);
        let mut out = [0u8; 64];
        out[..32].copy_from_slice(&reveal);
        out[32..].copy_from_slice(&h.to_bytes());
        out
    };

    let (roll, pay) = match game_id {
        GAME_PLINKO => {
            let outcome = crate::instructions::bet::plinko_eval(&randomness, amount, _target);
            (outcome.bucket as u64, outcome.payout)
        }
        _ => return Err(SpinError::UnknownGame.into()),
    };

    // 4. Credit the payout.
    let vault = &mut ctx.accounts.vault;
    vault.balance = vault
        .balance
        .checked_add(pay)
        .ok_or(SpinError::ArithmeticOverflow)?;
    let credits = &mut ctx.accounts.credits;
    credits.total = credits
        .total
        .checked_add(pay)
        .ok_or(SpinError::ArithmeticOverflow)?;

    let session = &mut ctx.accounts.session;
    session.won = session
        .won
        .checked_add(pay)
        .ok_or(SpinError::ArithmeticOverflow)?;

    emit!(ChainSpinResolved {
        player,
        game_id,
        reveal,
        index: chain.index - 1,
        amount,
        target: _target,
        roll,
        payout: pay,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u8, amount: u64, target: u64, reveal: [u8; 32])]
pub struct SpinChain<'info> {
    /// Pays the transaction fee and (first time) the session account's rent.
    /// Either the player themselves or the session key they authorized.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: identity only; authenticated against `vault.player`.
    pub player: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    #[account(
        mut,
        seeds = [CHAIN_SEED],
        bump = chain.bump
    )]
    pub chain: Account<'info, ChainState>,
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
    #[account(
        init_if_needed,
        payer = authority,
        space = PlayerSession::SIZE,
        seeds = [SESSION_SEED, player.key().as_ref()],
        bump
    )]
    pub session: Account<'info, PlayerSession>,
    #[account(
        seeds = [GAME_CONFIG_SEED, &[game_id]],
        bump = config.bump
    )]
    pub config: Account<'info, GameConfig>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct ChainInitialized {
    pub house: Pubkey,
    pub seed: [u8; 32],
    pub length: u64,
}

#[event]
pub struct ChainModeSet {
    pub active: bool,
    pub vrf_enabled: bool,
}

#[event]
pub struct ChainSpinResolved {
    pub player: Pubkey,
    pub game_id: u8,
    pub reveal: [u8; 32],
    pub index: u64,
    pub amount: u64,
    pub target: u64,
    pub roll: u64,
    pub payout: u64,
}
