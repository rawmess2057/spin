use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::*;

/// Payout in lamports given a bet amount and a multiplier in basis points.
pub fn payout(amount: u64, multiplier_bp: u64) -> Result<u64> {
    let p = (amount as u128)
        .checked_mul(multiplier_bp as u128)
        .ok_or(SpinError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(SpinError::ArithmeticOverflow)?;
    u64::try_from(p).map_err(|_| SpinError::ArithmeticOverflow.into())
}

fn ix_discriminator(name: &str) -> [u8; 8] {
    let mut input = Vec::with_capacity(IX_DISCRIMINATOR_NAMESPACE.len() + name.len());
    input.extend_from_slice(IX_DISCRIMINATOR_NAMESPACE.as_bytes());
    input.extend_from_slice(name.as_bytes());
    let hash = hash(&input);
    let bytes = hash.to_bytes();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&bytes[..8]);
    disc
}

// ---------------------------------------------------------------------------
// place_bet
// ---------------------------------------------------------------------------

/// Places a bet, debits the player's credit vault, and requests verifiable
/// randomness from ORAO with a callback into `resolve_spin`.
///
/// The signer is the `authority`: either the player themselves or the session
/// key they authorized via `set_delegate`. The stake is already sitting in the
/// treasury (it was moved there by `deposit`), so no lamports change hands
/// here — only the vault balance and the outstanding-credit ledger.
pub fn place_bet(
    ctx: Context<PlaceBet>,
    game_id: u8,
    amount: u64,
    target: u64,
    seed: [u8; 32],
) -> Result<()> {
    require!(!ctx.accounts.treasury.paused, SpinError::HousePaused);
    require!(game_id == ctx.accounts.config.game_id, SpinError::UnknownGame);
    require!(amount >= ctx.accounts.config.min_bet, SpinError::BetBelowMinimum);
    require!(amount <= ctx.accounts.config.max_bet, SpinError::BetAboveMaximum);

    let treasury_lamports = ctx.accounts.treasury.get_lamports();
    require!(
        amount.checked_mul(TREASURY_BANKROLL_DIVISOR).ok_or(SpinError::ArithmeticOverflow)?
            <= treasury_lamports,
        SpinError::BetExceedsBankrollLimit
    );

    // 1. Authorize the signer and debit the stake from the player's credit.
    let slot = Clock::get()?.slot;
    let authority = ctx.accounts.authority.key();
    let vault = &mut ctx.accounts.vault;

    if authority != vault.player {
        // Checked separately from the expiry so the client can tell "not your
        // session key" apart from "re-authorize me".
        require!(
            vault.delegate != Pubkey::default() && vault.delegate == authority,
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
    let credits = &mut ctx.accounts.credits;
    credits.total = credits
        .total
        .checked_sub(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;

    // 2. Record the pending spin.
    let pending = &mut ctx.accounts.pending;
    pending.player = ctx.accounts.player.key();
    pending.game_id = game_id;
    pending.amount = amount;
    pending.target = target;
    pending.seed = seed;
    pending.status = PendingStatus::AwaitingResolution;
    pending.created_slot = slot;
    pending.rent_payer = authority;
    pending.bump = ctx.bumps.pending;

    let session = &mut ctx.accounts.session;
    session.wagered = session
        .wagered
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    session.bets = session.bets.saturating_add(1);

    // 3. Request randomness with a request-level callback into resolve_spin.
    let network_state_info = &ctx.accounts.network_state;
    require!(
        network_state_info.owner == &VRF_PROGRAM_ID,
        SpinError::NetworkStateMismatch
    );
    let network_state = NetworkState::try_deserialize(&mut &network_state_info.data.borrow()[..])
        .map_err(|_| SpinError::NetworkStateMismatch)?;
    require!(
        ctx.accounts.vrf_treasury.key() == network_state.config.treasury,
        SpinError::TreasuryMismatch
    );

    // The callback receives the rent payer (to refund the pending account's
    // rent on resolve) and the vault + ledger the payout is credited to. Both
    // of those are our own PDAs, so they go in as seeded writables and need no
    // arbitrary-writable authorization meta below.
    let callback = Callback {
        remaining_accounts: vec![
            RemainingAccount::arbitrary_writable(ctx.accounts.authority.key()),
            RemainingAccount::arbitrary_writable(ctx.accounts.treasury.key()),
            RemainingAccount::readonly(ctx.accounts.system_program.key()),
            RemainingAccount::writable(
                ctx.accounts.pending.key(),
                vec![
                    PENDING_SEED.to_vec(),
                    seed.to_vec(),
                    vec![ctx.bumps.pending],
                ],
            ),
            RemainingAccount::writable(
                ctx.accounts.session.key(),
                vec![
                    SESSION_SEED.to_vec(),
                    ctx.accounts.player.key().to_bytes().to_vec(),
                    vec![ctx.bumps.session],
                ],
            ),
            RemainingAccount::writable(
                ctx.accounts.vault.key(),
                vec![
                    VAULT_SEED.to_vec(),
                    ctx.accounts.player.key().to_bytes().to_vec(),
                    vec![ctx.accounts.vault.bump],
                ],
            ),
            RemainingAccount::writable(
                ctx.accounts.credits.key(),
                vec![CREDITS_SEED.to_vec(), vec![ctx.accounts.credits.bump]],
            ),
        ],
        data: ix_discriminator("resolve_spin").to_vec(),
    };
    let params = RequestParams::new(seed).with_callback(callback);
    let params_bytes = borsh::to_vec(&params)?;

    let mut data = ix_discriminator("request").to_vec();
    data.extend_from_slice(&params_bytes);

    let metas = vec![
        AccountMeta::new(ctx.accounts.authority.key(), true),   // payer
        AccountMeta::new(ctx.accounts.vrf_state.key(), true),   // state (PDA signer)
        AccountMeta::new(ctx.accounts.client.key(), false),     // client
        AccountMeta::new(ctx.accounts.network_state.key(), false), // network state
        AccountMeta::new(ctx.accounts.vrf_treasury.key(), false),  // VRF treasury
        AccountMeta::new(ctx.accounts.request.key(), false),    // request PDA
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false), // system
        // Authorize arbitrary-writable callback accounts:
        AccountMeta::new(ctx.accounts.authority.key(), false),
        AccountMeta::new(ctx.accounts.treasury.key(), false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    ];
    let infos = vec![
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.vrf_state.to_account_info(),
        ctx.accounts.client.to_account_info(),
        ctx.accounts.network_state.to_account_info(),
        ctx.accounts.vrf_treasury.to_account_info(),
        ctx.accounts.request.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.treasury.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::instruction::Instruction {
            program_id: VRF_PROGRAM_ID,
            accounts: metas,
            data,
        },
        &infos,
        &[&[VRF_STATE_SEED, &[ctx.accounts.vrf_state.bump]]],
    )?;

    emit!(BetPlaced {
        player: ctx.accounts.player.key(),
        game_id,
        seed,
        amount,
        target,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(game_id: u8, amount: u64, target: u64, seed: [u8; 32])]
pub struct PlaceBet<'info> {
    /// Pays the transaction fee and the pending account's rent. Either the
    /// player themselves or the session key they authorized.
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
    #[account(
        mut,
        seeds = [VRF_STATE_SEED],
        bump = vrf_state.bump
    )]
    pub vrf_state: Account<'info, VrfState>,
    #[account(
        init,
        payer = authority,
        space = PendingSpin::SIZE,
        seeds = [PENDING_SEED, seed.as_ref()],
        bump
    )]
    pub pending: Account<'info, PendingSpin>,
    /// CHECK: VRF client PDA (seeds verified)
    #[account(
        mut,
        seeds = [VRF_CLIENT_SEED, crate::ID.as_ref(), vrf_state.key().as_ref()],
        bump,
        seeds::program = VRF_PROGRAM_ID
    )]
    pub client: UncheckedAccount<'info>,
    /// CHECK: VRF network state PDA (seeds verified)
    #[account(
        mut,
        seeds = [VRF_CONFIG_SEED],
        bump,
        seeds::program = VRF_PROGRAM_ID,
        owner = VRF_PROGRAM_ID
    )]
    pub network_state: UncheckedAccount<'info>,
    /// CHECK: VRF treasury (verified against network_state.config.treasury)
    #[account(mut)]
    pub vrf_treasury: UncheckedAccount<'info>,
    /// CHECK: VRF request PDA (seeds verified)
    #[account(
        mut,
        seeds = [VRF_REQUEST_SEED, client.key().as_ref(), seed.as_ref()],
        bump,
        seeds::program = VRF_PROGRAM_ID
    )]
    pub request: UncheckedAccount<'info>,
    /// CHECK: VRF program (must be loaded in the transaction for the CPI)
    #[account(address = VRF_PROGRAM_ID)]
    pub vrf_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Plinko evaluator
// ---------------------------------------------------------------------------

pub struct PlinkoOutcome {
    pub bucket: u8,
    pub multiplier_bp: u64,
    pub payout: u64,
}

/// Derives a Plinko path and bucket from 64 bytes of randomness.
///
/// For each row, one bit from `randomness` determines L (0) or R (1).
/// The number of R turns equals the bucket index.
pub fn plinko_eval(randomness: &[u8; 64], amount: u64, target: u64) -> PlinkoOutcome {
    let (rows, risk) = plinko_decode_target(target).unwrap_or((8, PLINKO_RISK_LOW));

    let mut rights = 0u8;
    for i in 0..rows {
        let byte_idx = (i / 8) as usize;
        let bit_idx = i % 8;
        if randomness[byte_idx] & (1 << bit_idx) != 0 {
            rights += 1;
        }
    }

    let multiplier_bp = plinko_multiplier_bp(rows, risk, rights);
    let pay = payout(amount, multiplier_bp).unwrap_or(0);

    PlinkoOutcome {
        bucket: rights,
        multiplier_bp,
        payout: pay,
    }
}

// ---------------------------------------------------------------------------
// resolve_spin (ORAO callback)
// ---------------------------------------------------------------------------

/// Called by the ORAO VRF program once the randomness request is fulfilled.
/// Verifies the request, evaluates the outcome, and pays out from the house.
pub fn resolve_spin(ctx: Context<ResolveSpin>) -> Result<()> {
    // The `client` account is a PDA of the VRF program; only the VRF program
    // can invoke this instruction with it as a signer.
    let client_info = &ctx.accounts.client;
    require!(client_info.owner == &VRF_PROGRAM_ID, SpinError::ClientMismatch);
    let client = Client::try_deserialize(&mut &client_info.data.borrow()[..])
        .map_err(|_| SpinError::ClientMismatch)?;
    require!(client.state == ctx.accounts.state.key(), SpinError::ClientMismatch);

    // Deserialize and authenticate the request account.
    let request_data = &ctx.accounts.request.to_account_info();
    let request_account = RequestAccount::try_deserialize(&mut &request_data.data.borrow()[..])
        .map_err(|_| SpinError::RequestMismatch)?;

    // Authenticate and load the pending spin.
    let pending_info = &ctx.accounts.pending;
    require!(pending_info.owner == &crate::ID, SpinError::PendingMismatch);
    let pending = PendingSpin::try_deserialize(&mut &pending_info.data.borrow()[..])
        .map_err(|_| SpinError::PendingMismatch)?;
    require!(
        request_account.client == ctx.accounts.client.key()
            && request_account.seed == pending.seed,
        SpinError::RequestMismatch
    );
    require!(
        ctx.accounts.request.key()
            == vrf_request_address(&ctx.accounts.client.key(), &request_account.seed),
        SpinError::RequestMismatch
    );

    let _request_state = request_account
        .state
        .fulfilled()
        .ok_or(SpinError::RandomnessPending)?;

    require!(
        pending.status == PendingStatus::AwaitingResolution,
        SpinError::AlreadyResolved
    );
    require!(
        pending.player == ctx.accounts.vault.player,
        SpinError::InvalidPlayer
    );
    require!(
        pending.rent_payer == ctx.accounts.rent_payer.key(),
        SpinError::InvalidPlayer
    );

    // 4. Evaluate the game outcome and settle the bet.
    let (roll, pay) = match pending.game_id {
        GAME_PLINKO => {
            let fulfilled = request_account
                .state
                .fulfilled()
                .ok_or(SpinError::RandomnessPending)?;
            let outcome = plinko_eval(&fulfilled.randomness, pending.amount, pending.target);
            (outcome.bucket as u64, outcome.payout)
        }
        _ => return Err(SpinError::UnknownGame.into()),
    };

    // 5. Credit the payout to the player's vault and the outstanding ledger.
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

    // 6. Close the pending account and return its rent.
    let pending_account = &ctx.accounts.pending;
    let lamports = pending_account.lamports();
    pending_account.data.borrow_mut().fill(0);
    pending_account
        .sub_lamports(lamports)
        .map_err(|_| SpinError::ArithmeticOverflow)?;
    ctx.accounts
        .rent_payer
        .add_lamports(lamports)
        .map_err(|_| SpinError::ArithmeticOverflow)?;

    emit!(SpinResolved {
        player: pending.player,
        game_id: pending.game_id,
        seed: pending.seed,
        amount: pending.amount,
        target: pending.target,
        roll,
        payout: pay,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveSpin<'info> {
    /// CHECK: VRF client PDA; signer guaranteed by the VRF program, owner and
    /// layout verified in the handler
    #[account(
        signer,
        seeds = [VRF_CLIENT_SEED, crate::ID.as_ref(), state.key().as_ref()],
        bump,
        seeds::program = VRF_PROGRAM_ID,
        owner = VRF_PROGRAM_ID
    )]
    pub client: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [VRF_STATE_SEED],
        bump = state.bump
    )]
    pub state: Account<'info, VrfState>,
    /// CHECK: VRF network state PDA (seeds verified)
    #[account(
        seeds = [VRF_CONFIG_SEED],
        bump,
        seeds::program = VRF_PROGRAM_ID,
        owner = VRF_PROGRAM_ID
    )]
    pub network_state: UncheckedAccount<'info>,
    /// CHECK: VRF request PDA (authenticated in handler)
    pub request: UncheckedAccount<'info>,
    /// CHECK: destination for the pending account's rent; authenticated
    /// against `pending.rent_payer` in the handler.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    pub system_program: Program<'info, System>,
    /// CHECK: pending spin PDA (authenticated in handler)
    #[account(mut)]
    pub pending: UncheckedAccount<'info>,
    /// CHECK: player session PDA (authenticated in handler)
    #[account(mut)]
    pub session: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.player.as_ref()],
        bump = vault.bump
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
// refund_spin
// ---------------------------------------------------------------------------

/// Refunds the stake when the VRF request was fulfilled but the callback
/// never succeeded, or when the oracle timed out. Idempotent for resolved
/// spins (they simply fail with `AlreadyResolved`).
pub fn refund_spin(ctx: Context<RefundSpin>, seed: [u8; 32]) -> Result<()> {
    let pending_account = &ctx.accounts.pending;
    require!(
        pending_account.owner == &crate::ID,
        SpinError::PendingMismatch
    );
    let pending = PendingSpin::try_deserialize(&mut &pending_account.data.borrow()[..])
        .map_err(|_| SpinError::PendingMismatch)?;
    require!(
        pending.player == ctx.accounts.vault.player,
        SpinError::InvalidPlayer
    );
    require!(pending.seed == seed, SpinError::PendingMismatch);

    // Either the player or their session key may unstick a spin, so recovery
    // never needs a wallet prompt.
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.vault.player
            || ctx
                .accounts
                .vault
                .delegate_valid(&authority, Clock::get()?.slot),
        SpinError::InvalidDelegate
    );
    require!(
        pending.rent_payer == ctx.accounts.rent_payer.key(),
        SpinError::InvalidPlayer
    );
    require!(
        pending.status == PendingStatus::AwaitingResolution,
        SpinError::AlreadyResolved
    );

    // The request must either be fulfilled (callback missed) or timed out.
    let request_account = RequestAccount::try_deserialize(
        &mut &ctx.accounts.request.to_account_info().data.borrow()[..],
    )
    .map_err(|_| SpinError::RequestMismatch)?;
    require!(
        request_account.client == ctx.accounts.client.key() && request_account.seed == seed,
        SpinError::RequestMismatch
    );

    let refundable = match request_account.state {
        RequestState::Fulfilled(_) => true,
        RequestState::Pending(_) => {
            let network_state_info = &ctx.accounts.network_state;
            require!(
                network_state_info.owner == &VRF_PROGRAM_ID,
                SpinError::NetworkStateMismatch
            );
            let network_state =
                NetworkState::try_deserialize(&mut &network_state_info.data.borrow()[..])
                    .map_err(|_| SpinError::NetworkStateMismatch)?;
            let now = Clock::get()?.slot;
            let deadline = network_state.config.callback_deadline;
            now.saturating_sub(request_account.slot) > deadline
        }
    };
    require!(refundable, SpinError::SpinNotResolvable);

    // Give the stake back as credit — it never left the treasury — and close
    // the pending account, returning its rent to whoever paid it.
    let amount = pending.amount;
    let credits = &mut ctx.accounts.credits;
    credits.total = credits
        .total
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    let vault = &mut ctx.accounts.vault;
    vault.balance = vault
        .balance
        .checked_add(amount)
        .ok_or(SpinError::ArithmeticOverflow)?;
    // Refunding a delegate-placed bet gives the allowance back too, so an
    // oracle failure doesn't silently eat the session's spend cap.
    if vault.delegate != Pubkey::default() {
        vault.delegate_spend_left = vault.delegate_spend_left.saturating_add(amount);
    }

    let pending_info = &ctx.accounts.pending;
    pending_info.data.borrow_mut().fill(0);
    let lamports = pending_info.lamports();
    pending_info
        .sub_lamports(lamports)
        .map_err(|_| SpinError::ArithmeticOverflow)?;
    ctx.accounts
        .rent_payer
        .add_lamports(lamports)
        .map_err(|_| SpinError::ArithmeticOverflow)?;

    emit!(BetRefunded {
        player: ctx.accounts.vault.player,
        seed,
        amount,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(seed: [u8; 32])]
pub struct RefundSpin<'info> {
    /// The player or their session key.
    pub authority: Signer<'info>,
    /// CHECK: destination for the pending account's rent; authenticated
    /// against `pending.rent_payer` in the handler.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.player.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, PlayerVault>,
    #[account(
        mut,
        seeds = [CREDITS_SEED],
        bump = credits.bump
    )]
    pub credits: Account<'info, CreditLedger>,
    /// CHECK: VRF client PDA (seeds verified)
    #[account(
        seeds = [VRF_CLIENT_SEED, crate::ID.as_ref(), vrf_state.key().as_ref()],
        bump,
        seeds::program = VRF_PROGRAM_ID
    )]
    pub client: UncheckedAccount<'info>,
    #[account(
        seeds = [VRF_STATE_SEED],
        bump = vrf_state.bump
    )]
    pub vrf_state: Account<'info, VrfState>,
    /// CHECK: VRF network state PDA (seeds verified)
    #[account(
        seeds = [VRF_CONFIG_SEED],
        bump,
        seeds::program = VRF_PROGRAM_ID,
        owner = VRF_PROGRAM_ID
    )]
    pub network_state: UncheckedAccount<'info>,
    /// CHECK: VRF request PDA (authenticated in handler)
    #[account(mut)]
    pub request: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [HOUSE_SEED],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, HouseTreasury>,
    pub system_program: Program<'info, System>,
    /// CHECK: pending spin PDA (authenticated in handler)
    #[account(mut)]
    pub pending: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct BetPlaced {
    pub player: Pubkey,
    pub game_id: u8,
    pub seed: [u8; 32],
    pub amount: u64,
    pub target: u64,
}

#[event]
pub struct SpinResolved {
    pub player: Pubkey,
    pub game_id: u8,
    pub seed: [u8; 32],
    pub amount: u64,
    pub target: u64,
    pub roll: u64,
    pub payout: u64,
}

#[event]
pub struct BetRefunded {
    pub player: Pubkey,
    pub seed: [u8; 32],
    pub amount: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_scales_with_bet() {
        assert_eq!(payout(1_000_000, 0).unwrap(), 0);
        assert_eq!(payout(1_000_000, 10_000).unwrap(), 1_000_000); // 1.00x
        assert_eq!(payout(1_000_000, 970_297).unwrap(), 97_029_700);
        assert_eq!(payout(123, 970_297).unwrap(), 11_934); // integer truncation
    }

    #[test]
    fn plinko_multiplier_tables_valid() {
        // Symmetry: bucket k == bucket rows-k have equal multipliers.
        for &(rows, risk) in &[
            (8, PLINKO_RISK_LOW),
            (8, PLINKO_RISK_HIGH),
            (12, PLINKO_RISK_MED),
            (16, PLINKO_RISK_HIGH),
        ] {
            for k in 0..=rows {
                assert_eq!(
                    plinko_multiplier_bp(rows, risk, k),
                    plinko_multiplier_bp(rows, risk, rows - k),
                    "symmetric buckets {rows}/{risk} {k}"
                );
            }
        }
    }

    #[test]
    fn plinko_multiplier_bounds() {
        // Invalid combos yield 0.
        assert_eq!(plinko_multiplier_bp(12, 99, 0), 0);
        assert_eq!(plinko_multiplier_bp(7, PLINKO_RISK_LOW, 0), 0);
        assert_eq!(plinko_multiplier_bp(17, PLINKO_RISK_LOW, 0), 0);
        assert_eq!(plinko_multiplier_bp(12, PLINKO_RISK_LOW, 13), 0);
        // Buckets are in 0.01x increments => multiples of 100 bp.
        assert_eq!(plinko_multiplier_bp(8, PLINKO_RISK_LOW, 0), 281_600);
        assert_eq!(plinko_multiplier_bp(8, PLINKO_RISK_LOW, 4), 4_000); // 40x -> 0.40x
    }

    #[test]
    fn plinko_target_roundtrip() {
        let t = plinko_encode_target(12, PLINKO_RISK_HIGH);
        assert_eq!(plinko_decode_target(t), Some((12, PLINKO_RISK_HIGH)));
        assert_eq!(plinko_decode_target(plinko_encode_target(8, PLINKO_RISK_LOW)), Some((8, PLINKO_RISK_LOW)));
        assert_eq!(plinko_decode_target(plinko_encode_target(16, PLINKO_RISK_MED)), Some((16, PLINKO_RISK_MED)));
        // Stray bits that decode out of range.
        assert_eq!(plinko_decode_target(0x00_00_00_00_FF), None);
        assert_eq!(plinko_decode_target(0x05 << 8), None);
    }

    #[test]
    fn plinko_eval_bucket_from_bits() {
        // Each row reads one bit from randomness[0..rows][bit row%8].
        // All zero bits => all left => bucket 0 (edge).
        let mut r = [0u8; 64];
        let target = plinko_encode_target(8, PLINKO_RISK_LOW);
        let o = plinko_eval(&r, 1_000_000, target);
        assert_eq!(o.bucket, 0);
        assert_eq!(o.multiplier_bp, plinko_multiplier_bp(8, PLINKO_RISK_LOW, 0));
        assert_eq!(o.payout, payout(1_000_000, o.multiplier_bp).unwrap());
    }
}
