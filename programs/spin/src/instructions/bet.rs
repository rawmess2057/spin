//! The bet lifecycle: `place_bet` (player, tx 1) → `settle_bet` (house crank,
//! tx 2) or `cancel_bet` (anyone, after a timeout).

use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::*;
use crate::error::SpinError;
use crate::games;
use crate::state::*;

/// Authenticates the signer against the vault and debits the stake: the
/// player themselves, or their session delegate with its net-loss allowance
/// applied. The stake is already sitting in the treasury (moved there by
/// `deposit`), so only the vault balance and the credit ledger change.
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

/// Credits lamports back to a vault (a payout or a refunded stake) and
/// restores the delegate's allowance by the same amount, if one is armed.
fn credit_vault(
    vault: &mut PlayerVault,
    credits: &mut CreditLedger,
    amount: u64,
) -> Result<()> {
    vault.balance = vault
        .balance
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    credits.total = credits
        .total
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    if vault.delegate != Pubkey::default() {
        vault.delegate_spend_left = vault.delegate_spend_left.saturating_add(amount);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// place_bet
// ---------------------------------------------------------------------------

/// Places a bet: validates the target, reserves the bet's maximum payout
/// against the bankroll, debits the stake and takes a FIFO ticket on the
/// chain. The outcome is decided later by `settle_bet`, from the house's
/// next reveal mixed with the `client_seed` chosen here.
pub fn place_bet(
    ctx: Context<PlaceBet>,
    game_id: u8,
    amount: u64,
    target: u64,
    client_seed: [u8; 32],
) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let chain = &mut ctx.accounts.chain;
    let config = &ctx.accounts.config;
    let bet = &mut ctx.accounts.bet;

    require!(!treasury.paused, SpinError::HousePaused);
    require!(chain.active, SpinError::ChainInactive);
    // Never take a bet the chain has no reveal left for.
    require!(chain.index < chain.length, SpinError::ChainExhausted);
    require!(bet.status != BetStatus::Open, SpinError::BetAlreadyOpen);

    require!(game_id == config.game_id, SpinError::UnknownGame);
    require!(!config.paused, SpinError::GamePaused);
    games::validate_target(game_id, target)?;
    require!(amount >= config.min_bet, SpinError::BetBelowMinimum);
    require!(amount <= config.max_bet, SpinError::BetAboveMaximum);

    // Bankroll guard: the best case of this bet must be payable from lamports
    // nobody else has a claim on, with a safety divisor on top.
    let credits = &mut ctx.accounts.credits;
    let max_payout = games::payout(amount, games::max_multiplier_bp(game_id, target)?)?;
    let rent_floor = Rent::get()?.minimum_balance(HouseTreasury::SIZE);
    let free_bankroll = treasury
        .get_lamports()
        .saturating_sub(rent_floor)
        .saturating_sub(credits.total)
        .saturating_sub(credits.reserved);
    require!(
        max_payout <= free_bankroll / MAX_PAYOUT_BANKROLL_DIVISOR,
        SpinError::MaxPayoutExceedsBankroll
    );
    credits.reserved = credits
        .reserved
        .checked_add(max_payout)
        .ok_or(SpinError::ArithmeticOverflow)?;

    // Authorize the signer and debit the stake.
    let slot = Clock::get()?.slot;
    let authority = ctx.accounts.authority.key();
    let player = ctx.accounts.player.key();
    authorize_and_debit(
        &authority,
        &player,
        &mut ctx.accounts.vault,
        credits,
        amount,
        slot,
    )?;

    // Stats.
    let session = &mut ctx.accounts.session;
    if session.player == Pubkey::default() {
        session.player = player;
        session.bump = ctx.bumps.session;
    }
    session.wagered = session
        .wagered
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    session.bets = session.bets.saturating_add(1);

    // Record the bet and take a settlement ticket.
    let seq = chain.next_seq;
    chain.next_seq = seq.checked_add(1).ok_or(SpinError::ArithmeticOverflow)?;

    if bet.player == Pubkey::default() {
        bet.player = player;
        bet.bump = ctx.bumps.bet;
    }
    bet.nonce = bet.nonce.checked_add(1).ok_or(SpinError::ArithmeticOverflow)?;
    bet.seq = seq;
    bet.chain_epoch = chain.epoch;
    bet.game_id = game_id;
    bet.status = BetStatus::Open;
    bet.amount = amount;
    bet.target = target;
    bet.client_seed = client_seed;
    bet.reserved = max_payout;
    bet.placed_slot = slot;
    bet.index_at_place = chain.index;
    bet.commitment = chain.commitment;
    bet.reveal = [0u8; 32];
    bet.reveal_index = 0;
    bet.roll = 0;
    bet.payout = 0;
    bet.settled_slot = 0;

    emit!(BetPlaced {
        player,
        nonce: bet.nonce,
        seq,
        epoch: chain.epoch,
        game_id,
        amount,
        target,
        client_seed,
        index_at_place: chain.index,
        commitment: chain.commitment,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u8)]
pub struct PlaceBet<'info> {
    /// Pays the transaction fee and, the first time, the session and bet
    /// accounts' rent. Either the player themselves or their session key.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: identity only; authenticated against `vault.player`.
    pub player: UncheckedAccount<'info>,
    #[account(
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
        seeds = [GAME_CONFIG_SEED, &[game_id]],
        bump = config.bump
    )]
    pub config: Account<'info, GameConfig>,
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
        init_if_needed,
        payer = authority,
        space = BetState::SIZE,
        seeds = [BET_SEED, player.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, BetState>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// settle_bet
// ---------------------------------------------------------------------------

/// Settles the head bet of the queue with the house's next reveal.
///
/// Permissionless: the reveal *is* the credential (only the house knows the
/// preimage of the current commitment), so whoever submits a valid one pays
/// the fee and the outcome is fully determined by the chain.
pub fn settle_bet(ctx: Context<SettleBet>, reveal: [u8; 32]) -> Result<()> {
    let chain = &mut ctx.accounts.chain;
    let bet = &mut ctx.accounts.bet;

    require!(bet.status == BetStatus::Open, SpinError::BetNotOpen);
    require!(bet.chain_epoch == chain.epoch, SpinError::ChainEpochMismatch);
    require!(bet.seq == chain.cursor, SpinError::BetNotHead);
    require!(hash(&reveal).to_bytes() == chain.commitment, SpinError::ChainBadReveal);
    require!(chain.index < chain.length, SpinError::ChainExhausted);

    // Walk the chain one link down.
    chain.commitment = reveal;
    chain.index += 1;
    chain.cursor += 1;

    // Evaluate.
    let player = bet.player;
    let randomness = games::derive_randomness(&reveal, &bet.client_seed, &player, bet.nonce);
    let eval = games::evaluate(bet.game_id, &randomness, bet.amount, bet.target)?;

    // Release the reservation, pay the win.
    let credits = &mut ctx.accounts.credits;
    credits.reserved = credits
        .reserved
        .checked_sub(bet.reserved)
        .ok_or(SpinError::ArithmeticOverflow)?;
    credit_vault(&mut ctx.accounts.vault, credits, eval.payout)?;

    let session = &mut ctx.accounts.session;
    session.won = session
        .won
        .checked_add(eval.payout)
        .ok_or(SpinError::ArithmeticOverflow)?;

    bet.status = BetStatus::Settled;
    bet.reveal = reveal;
    bet.reveal_index = chain.index;
    bet.roll = eval.roll;
    bet.payout = eval.payout;
    bet.settled_slot = Clock::get()?.slot;
    bet.reserved = 0;

    emit!(BetSettled {
        player,
        nonce: bet.nonce,
        seq: bet.seq,
        game_id: bet.game_id,
        amount: bet.amount,
        target: bet.target,
        reveal,
        reveal_index: chain.index,
        roll: eval.roll,
        multiplier_bp: eval.multiplier_bp,
        payout: eval.payout,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SettleBet<'info> {
    /// Whoever submits the reveal; pays the fee.
    #[account(mut)]
    pub cranker: Signer<'info>,
    /// CHECK: identity only; must match `bet.player`.
    pub player: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [BET_SEED, player.key().as_ref()],
        bump = bet.bump,
        constraint = bet.player == player.key() @ SpinError::InvalidPlayer
    )]
    pub bet: Account<'info, BetState>,
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
        mut,
        seeds = [SESSION_SEED, player.key().as_ref()],
        bump = session.bump
    )]
    pub session: Account<'info, PlayerSession>,
}

// ---------------------------------------------------------------------------
// cancel_bet
// ---------------------------------------------------------------------------

/// Refunds the head bet once the house has failed to settle it for
/// [`BET_TIMEOUT_SLOTS`]. Permissionless, so a stalled queue can always be
/// unblocked; no reveal is consumed. Every cancel is counted in
/// `ChainState::stalls` as a public record.
pub fn cancel_bet(ctx: Context<CancelBet>) -> Result<()> {
    let chain = &mut ctx.accounts.chain;
    let bet = &mut ctx.accounts.bet;

    require!(bet.status == BetStatus::Open, SpinError::BetNotOpen);
    // A bet from an earlier epoch can never settle; let it go immediately.
    let same_epoch = bet.chain_epoch == chain.epoch;
    if same_epoch {
        require!(bet.seq == chain.cursor, SpinError::BetNotHead);
        let slot = Clock::get()?.slot;
        require!(
            slot >= bet.placed_slot.saturating_add(BET_TIMEOUT_SLOTS),
            SpinError::BetNotTimedOut
        );
        chain.cursor += 1;
        chain.stalls += 1;
    }

    let credits = &mut ctx.accounts.credits;
    credits.reserved = credits
        .reserved
        .checked_sub(bet.reserved)
        .ok_or(SpinError::ArithmeticOverflow)?;
    credit_vault(&mut ctx.accounts.vault, credits, bet.amount)?;

    bet.status = BetStatus::Cancelled;
    bet.reserved = 0;
    bet.settled_slot = Clock::get()?.slot;

    emit!(BetCancelled {
        player: bet.player,
        nonce: bet.nonce,
        seq: bet.seq,
        amount: bet.amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelBet<'info> {
    /// Anyone; pays the fee.
    pub caller: Signer<'info>,
    /// CHECK: identity only; must match `bet.player`.
    pub player: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [BET_SEED, player.key().as_ref()],
        bump = bet.bump,
        constraint = bet.player == player.key() @ SpinError::InvalidPlayer
    )]
    pub bet: Account<'info, BetState>,
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
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct BetPlaced {
    pub player: Pubkey,
    pub nonce: u64,
    pub seq: u64,
    pub epoch: u64,
    pub game_id: u8,
    pub amount: u64,
    pub target: u64,
    pub client_seed: [u8; 32],
    pub index_at_place: u64,
    pub commitment: [u8; 32],
}

#[event]
pub struct BetSettled {
    pub player: Pubkey,
    pub nonce: u64,
    pub seq: u64,
    pub game_id: u8,
    pub amount: u64,
    pub target: u64,
    pub reveal: [u8; 32],
    pub reveal_index: u64,
    pub roll: u64,
    pub multiplier_bp: u64,
    pub payout: u64,
}

#[event]
pub struct BetCancelled {
    pub player: Pubkey,
    pub nonce: u64,
    pub seq: u64,
    pub amount: u64,
}
