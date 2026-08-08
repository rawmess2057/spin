use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::*;
use crate::error::SpinError;
use crate::state::*;

// ---------------------------------------------------------------------------
// Neon Dice outcome math.
// ---------------------------------------------------------------------------

/// Evaluates a dice roll against the target threshold.
/// Returns the payout multiplier in basis points and the roll value.
pub fn dice_eval(randomness: &[u8; 64], target: u64) -> (u64, u64) {
    let raw = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let roll = raw % DICE_ROLL_RANGE;
    let multiplier_bp = DICE_RTP_NUMERATOR.checked_div(target.max(1)).unwrap();
    (if roll < target { multiplier_bp } else { 0 }, roll)
}

// ---------------------------------------------------------------------------
// Neon Slots outcome math.
// ---------------------------------------------------------------------------

/// Evaluates a slot spin against the 5-reel scatter paytable.
/// Returns (payout multiplier in basis points, raw randomness, reel symbols).
pub fn slots_eval(randomness: &[u8; 64]) -> (u64, u64, [u8; 5]) {
    let raw = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let mut symbols = [0u8; 5];
    for (i, slot) in symbols.iter_mut().enumerate() {
        *slot = ((raw / 10u64.pow(i as u32)) % SLOTS_SYMBOLS) as u8;
    }

    // Count symbol occurrences; best = most frequent, ties to higher index.
    let mut counts = [0u8; SLOTS_SYMBOLS as usize];
    for &s in &symbols {
        counts[s as usize] += 1;
    }
    let mut best = 0u8;
    let mut best_count = 0u8;
    for (s, &c) in counts.iter().enumerate() {
        if c >= best_count {
            best = s as u8;
            best_count = c;
        }
    }

    let multiplier_bp = if best_count >= 3 {
        let x = match best_count {
            5 => SLOTS_X5,
            4 => SLOTS_X4,
            _ => 1,
        };
        let mult = SLOTS_BASE_BP[best as usize].checked_mul(x).unwrap();
        mult.min(SLOTS_MAX_MULTIPLIER_BP)
    } else {
        0
    };
    (multiplier_bp, raw, symbols)
}

// ---------------------------------------------------------------------------
// Grid game outcome math (Pharaoh's Fortune, Golden Dragon, Dynamite Mines).
// ---------------------------------------------------------------------------

/// Streams base-10 digits out of the 64-byte VRF output. Each of the 8 u64
/// words (little-endian) yields up to 20 decimal digits; grid cells are
/// filled sequentially from this stream, so cascades and free spins consume
/// further digits deterministically.
pub struct DigitStream<'a> {
    randomness: &'a [u8; 64],
    cursor: u32,
}

impl<'a> DigitStream<'a> {
    pub fn new(randomness: &'a [u8; 64]) -> Self {
        Self {
            randomness,
            cursor: 0,
        }
    }

    pub fn next(&mut self) -> u8 {
        let pos = self.cursor;
        self.cursor += 1;
        let word_idx = (pos / 20) as usize;
        let digit_idx = (pos % 20) as u32;
        let word = u64::from_le_bytes(
            self.randomness[word_idx * 8..word_idx * 8 + 8]
                .try_into()
                .unwrap(),
        );
        ((word / 10u64.pow(digit_idx)) % 10) as u8
    }

    pub fn take_n(&mut self, n: usize, out: &mut [u8]) {
        for i in 0..n {
            out[i] = self.next();
        }
    }
}

/// Count multiplier applied for a winning count `c` (with `min_count` cells
/// required): `2^(c - min_count)`, capped at 4 (i.e. 4 -> 1x, 5 -> 2x,
/// 6+ -> 4x, or 5 -> 1x, 6 -> 2x, 7+ -> 4x for the larger boards).
fn count_curve(c: u64, min_count: u64) -> u64 {
    (2u64.saturating_pow((c - min_count) as u32)).min(4)
}

/// Scatter scoring over an arbitrary grid. Counts each symbol across all
/// cells; wins require `min_count`+ cells of a symbol. The winner is the
/// most frequent symbol, ties breaking toward the higher index (the same
/// rule as the 5-reel Neon Slots engine). A wild symbol (where set)
/// expands into the most frequent non-wild symbol, adding its occurrences
/// to that symbol's tally before scoring. Returns (multiplier in bp,
/// counts after wild expansion, winner symbol, winning count).
fn scatter_score(
    cells: &[u8],
    base_bp: &[u64; 10],
    wild: Option<u8>,
    min_count: u64,
) -> (u64, [u8; 10], u8, u8) {
    let mut counts = [0u8; 10];
    for &c in cells {
        counts[c as usize] += 1;
    }
    if let Some(w) = wild {
        let wild_count = counts[w as usize];
        if wild_count > 0 {
            let mut target = 0u8;
            let mut target_count = 0u8;
            for (s, &c) in counts.iter().enumerate() {
                if s as u8 != w && c >= target_count {
                    target = s as u8;
                    target_count = c;
                }
            }
            counts[target as usize] += wild_count;
        }
    }
    let mut best = 0u8;
    let mut best_count = 0u8;
    for (s, &c) in counts.iter().enumerate() {
        if c >= best_count {
            best = s as u8;
            best_count = c;
        }
    }
    let multiplier_bp = if (best_count as u64) >= min_count {
        let mult = count_curve(best_count as u64, min_count)
            .checked_mul(base_bp[best as usize])
            .unwrap();
        mult.min(SLOTS_MAX_MULTIPLIER_BP)
    } else {
        0
    };
    (multiplier_bp, counts, best, best_count)
}

fn raw_word(randomness: &[u8; 64]) -> u64 {
    u64::from_le_bytes(randomness[0..8].try_into().unwrap())
}

/// Pharaoh's Fortune: 20-cell grid with an expanding wild (Pharaoh). 4+
/// scarabs award a free-spins round: 3 extra 20-cell boards drawn from the
/// digit stream, wins summed. Settled in a single callback.
pub fn pharaoh_eval(randomness: &[u8; 64]) -> (u64, u64, [u8; PHARAOH_CELLS]) {
    pharaoh_eval_with(randomness, &PHARAOH_BASE_BP)
}

fn pharaoh_eval_with(
    randomness: &[u8; 64],
    base_bp: &[u64; 10],
) -> (u64, u64, [u8; PHARAOH_CELLS]) {
    let mut stream = DigitStream::new(randomness);
    let mut cells = [0u8; PHARAOH_CELLS];
    stream.take_n(PHARAOH_CELLS, &mut cells);
    let (mut mult, counts, _, _) = scatter_score(
        &cells,
        base_bp,
        Some(PHARAOH_WILD),
        GRID_MIN_COUNT_PHARAOH as u64,
    );
    if counts[PHARAOH_TRIGGER as usize] >= PHARAOH_FREE_SPINS_TRIGGER {
        for _ in 0..PHARAOH_FREE_SPINS {
            let mut fs_cells = [0u8; PHARAOH_CELLS];
            stream.take_n(PHARAOH_CELLS, &mut fs_cells);
            let (m, _, _, _) = scatter_score(
                &fs_cells,
                base_bp,
                Some(PHARAOH_WILD),
                GRID_MIN_COUNT_PHARAOH as u64,
            );
            mult = mult.saturating_add(m).min(SLOTS_MAX_MULTIPLIER_BP);
        }
    }
    (mult, raw_word(randomness), cells)
}

/// Golden Dragon: 15-cell grid. 5+ pearls double the win, 9+ triple it.
pub fn dragon_eval(randomness: &[u8; 64]) -> (u64, u64, [u8; DRAGON_CELLS]) {
    dragon_eval_with(randomness, &DRAGON_BASE_BP)
}

fn dragon_eval_with(
    randomness: &[u8; 64],
    base_bp: &[u64; 10],
) -> (u64, u64, [u8; DRAGON_CELLS]) {
    let mut stream = DigitStream::new(randomness);
    let mut cells = [0u8; DRAGON_CELLS];
    stream.take_n(DRAGON_CELLS, &mut cells);
    let (mut mult, counts, _, _) = scatter_score(
        &cells,
        base_bp,
        None,
        GRID_MIN_COUNT_DRAGON as u64,
    );
    let pearls = counts[DRAGON_PEARL as usize];
    if pearls >= DRAGON_PEARL_JACKPOT {
        mult = mult
            .checked_mul(3)
            .unwrap_or(u64::MAX)
            .min(SLOTS_MAX_MULTIPLIER_BP);
    } else if pearls >= DRAGON_PEARL_BONUS {
        mult = mult
            .checked_mul(2)
            .unwrap_or(u64::MAX)
            .min(SLOTS_MAX_MULTIPLIER_BP);
    }
    (mult, raw_word(randomness), cells)
}

/// Dynamite Mines: 18-cell grid that cascades. Winning cells of the best
/// symbol are removed, survivors drop per reel, fresh symbols fall in from
/// the digit stream, and the board re-scores — up to `MINES_CASCADE_MAX`
/// cascades, each level multiplying its win by the cascade index (1x..5x).
pub fn mines_eval(randomness: &[u8; 64]) -> (u64, u64, [u8; MINES_CELLS]) {
    mines_eval_with(randomness, &MINES_BASE_BP)
}

fn mines_eval_with(
    randomness: &[u8; 64],
    base_bp: &[u64; 10],
) -> (u64, u64, [u8; MINES_CELLS]) {
    let mut stream = DigitStream::new(randomness);
    let mut grid = [[0u8; MINES_REELS as usize]; MINES_ROWS as usize];
    for row in grid.iter_mut() {
        stream.take_n(MINES_REELS as usize, row);
    }
    let mut mult: u64 = 0;
    for level in 0..MINES_CASCADE_MAX {
        let mut cells = [0u8; MINES_CELLS];
        for (r, row) in grid.iter().enumerate() {
            cells[r * MINES_REELS as usize..(r + 1) * MINES_REELS as usize]
                .copy_from_slice(row);
        }
        let (m, _counts, best, best_count) = scatter_score(
            &cells,
            base_bp,
            None,
            GRID_MIN_COUNT_MINES as u64,
        );
        if (best_count as u64) < GRID_MIN_COUNT_MINES as u64 {
            break;
        }
        mult = mult
            .saturating_add(m.checked_mul(level as u64 + 1).unwrap_or(u64::MAX))
            .min(SLOTS_MAX_MULTIPLIER_BP);
        // Remove cells of the best symbol; survivors drop, refills fall in
        // from the top of each reel (row 0 is the visual top).
        for row in grid.iter_mut() {
            let mut keep = [0u8; MINES_REELS as usize];
            let mut k = 0usize;
            for &c in row.iter() {
                if c != best {
                    keep[k] = c;
                    k += 1;
                }
            }
            let need = MINES_REELS as usize - k;
            let mut new_row = [0u8; MINES_REELS as usize];
            stream.take_n(need, &mut new_row[..need]);
            new_row[need..].copy_from_slice(&keep[..k]);
            *row = new_row;
        }
    }
    let mut final_cells = [0u8; MINES_CELLS];
    for (r, row) in grid.iter().enumerate() {
        final_cells[r * MINES_REELS as usize..(r + 1) * MINES_REELS as usize]
            .copy_from_slice(row);
    }
    (mult, raw_word(randomness), final_cells)
}

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
    require!(
        matches!(
            ctx.accounts.config.game_id,
            GAME_DICE | GAME_SLOTS | GAME_PHARAOH | GAME_DRAGON | GAME_MINES
        ),
        SpinError::UnknownGame
    );
    require!(amount >= ctx.accounts.config.min_bet, SpinError::BetBelowMinimum);
    require!(amount <= ctx.accounts.config.max_bet, SpinError::BetAboveMaximum);

    // Neon Dice has a target range; Neon Slots ignores the target (frontends
    // send 0) because the outcome is a fixed paytable evaluation.
    if ctx.accounts.config.game_id == GAME_DICE {
        let min_target = u16::from_le_bytes([ctx.accounts.config.params[0], ctx.accounts.config.params[1]]) as u64;
        let max_target = u16::from_le_bytes([ctx.accounts.config.params[2], ctx.accounts.config.params[3]]) as u64;
        require!(
            target >= min_target && target <= max_target,
            SpinError::TargetOutOfRange
        );
    }

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

    let fulfilled = request_account
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

    let (multiplier_bp, roll) = match pending.game_id {
        GAME_DICE => dice_eval(&fulfilled.randomness, pending.target),
        GAME_SLOTS => {
            let (mult, raw, _symbols) = slots_eval(&fulfilled.randomness);
            (mult, raw)
        }
        GAME_PHARAOH => {
            let (mult, raw, _cells) = pharaoh_eval(&fulfilled.randomness);
            (mult, raw)
        }
        GAME_DRAGON => {
            let (mult, raw, _cells) = dragon_eval(&fulfilled.randomness);
            (mult, raw)
        }
        GAME_MINES => {
            let (mult, raw, _cells) = mines_eval(&fulfilled.randomness);
            (mult, raw)
        }
        _ => return Err(SpinError::UnknownGame.into()),
    };
    let payout = payout(pending.amount, multiplier_bp)?;

    if payout > 0 {
        // No lamports move: the stake is already in the treasury and the win is
        // paid as credit. The treasury must actually be able to cover it.
        let vault = &mut ctx.accounts.vault;
        let credits = &mut ctx.accounts.credits;
        credits.total = credits
            .total
            .checked_add(payout)
            .ok_or(SpinError::ArithmeticOverflow)?;
        require!(
            ctx.accounts.treasury.to_account_info().lamports() >= credits.total,
            SpinError::TreasuryInsolvent
        );
        vault.balance = vault
            .balance
            .checked_add(payout)
            .ok_or(SpinError::ArithmeticOverflow)?;
    }

    let game_id = pending.game_id;
    let seed = pending.seed;
    let amount = pending.amount;
    let target = pending.target;

    // Close the pending account and return its rent to whoever paid it. The
    // spin is over, so keeping a ~0.0016 SOL rent-exempt account per spin
    // alive forever would dwarf the transaction fee many times over. Zeroing
    // the data first means a stray re-entry can't deserialize it, and an
    // account left with no lamports is deallocated at the end of the
    // transaction (same trick as refund_spin below).
    pending_info.data.borrow_mut().fill(0);
    let rent = pending_info.lamports();
    pending_info
        .sub_lamports(rent)
        .map_err(|_| SpinError::ArithmeticOverflow)?;
    ctx.accounts
        .rent_payer
        .to_account_info()
        .add_lamports(rent)
        .map_err(|_| SpinError::ArithmeticOverflow)?;

    // Update player stats.
    let session_info = &ctx.accounts.session;
    require!(session_info.owner == &crate::ID, SpinError::PendingMismatch);
    let mut session =
        PlayerSession::try_deserialize(&mut &session_info.data.borrow()[..])
            .map_err(|_| SpinError::PendingMismatch)?;
    session.won = session.won.saturating_add(payout);
    session
        .try_serialize(&mut &mut session_info.data.borrow_mut()[..])
        .map_err(|_| SpinError::PendingMismatch)?;

    emit!(SpinResolved {
        player: ctx.accounts.vault.player,
        game_id,
        seed,
        amount,
        target,
        roll,
        payout,
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

    fn roll_for(target: u64, roll: u64) -> u64 {
        let mut r = [0u8; 64];
        r[..8].copy_from_slice(&roll.to_le_bytes());
        dice_eval(&r, target).0
    }

    #[test]
    fn dice_eval_maps_roll_range() {
        // All 10,000 possible rolls map into [0, 10_000).
        for raw in 0..DICE_ROLL_RANGE * 3 {
            let mut r = [0u8; 64];
            r[..8].copy_from_slice(&raw.to_le_bytes());
            let (_, roll) = dice_eval(&r, 5000);
            assert!(roll < DICE_ROLL_RANGE);
        }
    }

    #[test]
    fn dice_eval_boundaries() {
        assert_eq!(roll_for(5000, 0), 19600); // roll 0 wins (under) => 1.96x
        assert_eq!(roll_for(5000, 4999), 19600); // win just under target
        assert_eq!(roll_for(5000, 5000), 0); // equal to target loses
        assert_eq!(roll_for(5000, 9999), 0); // max roll loses
        assert_eq!(roll_for(101, 100), 970297); // max win at min target (~97x)
        assert_eq!(roll_for(9800, 0), 10000); // min multiplier at max target (1x)
    }

    #[test]
    fn dice_rtp_is_at_most_98_percent() {
        // Integer truncation may only reduce the RTP below 98%, never above.
        for target in [101u64, 500, 5000, 9800] {
            let mut total_payout: u128 = 0;
            for roll in 0..DICE_ROLL_RANGE {
                total_payout += roll_for(target, roll) as u128;
            }
            let wagered: u128 = DICE_ROLL_RANGE as u128 * 10000; // 1 lamport * 10000 bp
            let rtp = total_payout as f64 / wagered as f64;
            assert!(rtp <= 0.98 + 1e-9, "target {} rtp {}", target, rtp);
            assert!(rtp > 0.97, "target {} rtp {} too low", target, rtp);
        }
    }

    #[test]
    fn payout_scales_with_bet() {
        assert_eq!(payout(1_000_000, 0).unwrap(), 0);
        assert_eq!(payout(1_000_000, 10_000).unwrap(), 1_000_000); // 1.00x
        assert_eq!(payout(1_000_000, 970_297).unwrap(), 97_029_700);
        assert_eq!(payout(123, 970_297).unwrap(), 11_934); // integer truncation
    }

    fn randomness_from_raw(raw: u64) -> [u8; 64] {
        let mut r = [0u8; 64];
        r[..8].copy_from_slice(&raw.to_le_bytes());
        r
    }

    #[test]
    fn slots_eval_maps_digits_to_symbols() {
        // raw digits (base 10) become the reel symbols, reel 0 = least
        // significant digit.
        let (_, raw, symbols) = slots_eval(&randomness_from_raw(12345));
        assert_eq!(raw, 12345);
        assert_eq!(symbols, [5, 4, 3, 2, 1]);
    }

    #[test]
    fn slots_eval_paytable() {
        // 3 of a kind: 260_000 bp (26x) for the top symbol.
        let (mult, _, syms) = slots_eval(&randomness_from_raw(999)); // 00999
        assert_eq!(mult, 260_000);
        assert_eq!(syms, [9, 9, 9, 0, 0]);

        // 4 of a kind: base x4.
        let (mult, _, syms) = slots_eval(&randomness_from_raw(11110)); // 01111
        assert_eq!(mult, 30_000 * 4);
        assert_eq!(syms, [0, 1, 1, 1, 1]);

        // 5 of a kind: base x20, capped at the 100x bankroll ceiling.
        let (mult, _, _) = slots_eval(&randomness_from_raw(77777));
        assert_eq!(mult, SLOTS_MAX_MULTIPLIER_BP);
        let (mult, _, _) = slots_eval(&randomness_from_raw(99999));
        assert_eq!(mult, SLOTS_MAX_MULTIPLIER_BP);

        // No 3-of-a-kind: no payout, even with pairs.
        let (mult, _, _) = slots_eval(&randomness_from_raw(12345));
        assert_eq!(mult, 0);
        let (mult, _, _) = slots_eval(&randomness_from_raw(11234));
        assert_eq!(mult, 0);
    }

    #[test]
    fn slots_eval_tie_breaks_to_higher_symbol() {
        // Two pairs (1 and 2): best is 2, but 2-of-a-kind never pays.
        let (mult, _, syms) = slots_eval(&randomness_from_raw(11220)); // 02211
        assert_eq!(syms, [0, 2, 2, 1, 1]);
        assert_eq!(mult, 0);
    }

    #[test]
    fn slots_eval_jackpot_capped_at_100x() {
        // 5 of a kind of the top symbol would be 260_000 * 20 = 5_200_000 bp;
        // the cap keeps any payout within the 100x bankroll rule.
        let (mult, _, _) = slots_eval(&randomness_from_raw(99999));
        assert_eq!(mult, SLOTS_MAX_MULTIPLIER_BP);
        assert!(mult <= SLOTS_MAX_MULTIPLIER_BP);
    }

    #[test]
    fn slots_rtp_is_between_95_and_98_percent() {
        // Brute force over every 5-digit combination (raw in [0, 100_000)):
        // digit-based reels are uniform exactly over this space. Payout uses
        // the real `payout()` truncation at a 1 SOL stake.
        let mut total_payout: u128 = 0;
        let mut max_mult: u64 = 0;
        for raw in 0..100_000u64 {
            let (mult, _, _) = slots_eval(&randomness_from_raw(raw));
            assert!(mult <= SLOTS_MAX_MULTIPLIER_BP);
            total_payout += payout(1_000_000, mult).unwrap() as u128;
            max_mult = max_mult.max(mult);
        }
        // Sum of multipliers in bp over 100k outcomes, at 1 SOL stake:
        // RTP = total_payout / (100_000 * 1_000_000 lamports).
        let rtp = total_payout as f64 / (100_000.0 * 1_000_000.0);
        assert!(rtp <= 0.98 + 1e-9, "slots rtp {} too high", rtp);
        assert!(rtp > 0.95, "slots rtp {} too low", rtp);
        // The max multiplier must never exceed the bankroll coverage.
        assert!(max_mult <= SLOTS_MAX_MULTIPLIER_BP);
    }

    // -----------------------------------------------------------------------
    // Grid games (Pharaoh's Fortune, Golden Dragon, Dynamite Mines)
    // -----------------------------------------------------------------------

    /// Deterministic pseudo-random 64-byte outputs for statistical tests.
    struct XorShift(u64);

    impl XorShift {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }

        fn bytes64(&mut self) -> [u8; 64] {
            let mut b = [0u8; 64];
            for chunk in b.chunks_exact_mut(8) {
                chunk.copy_from_slice(&self.next().to_le_bytes());
            }
            b
        }
    }

    #[test]
    fn digit_stream_maps_words_to_digits() {
        // Word 0 = 12345 (LE): digits 5,4,3,2,1,0,0,...
        let mut r = [0u8; 64];
        r[..8].copy_from_slice(&12345u64.to_le_bytes());
        let mut s = DigitStream::new(&r);
        assert_eq!(s.next(), 5);
        assert_eq!(s.next(), 4);
        assert_eq!(s.next(), 3);
        assert_eq!(s.next(), 2);
        assert_eq!(s.next(), 1);
        assert_eq!(s.next(), 0);
        // The 21st digit rolls into word 1.
        r[8..16].copy_from_slice(&678u64.to_le_bytes());
        let mut s = DigitStream::new(&r);
        for _ in 0..20 {
            s.next();
        }
        assert_eq!(s.next(), 8); // word 1, digit 0
        assert_eq!(s.next(), 7);
        assert_eq!(s.next(), 6);
    }

    fn randomness_from_words(words: &[u64; 8]) -> [u8; 64] {
        let mut r = [0u8; 64];
        for (i, w) in words.iter().enumerate() {
            r[i * 8..i * 8 + 8].copy_from_slice(&w.to_le_bytes());
        }
        r
    }

    #[test]
    fn pharaoh_eval_grid_mapping_and_paytable() {
        // 20 cells, row-major from the digit stream. Six "9" cells (the
        // wild) with 14 zeros: the wilds expand into the most frequent
        // non-wild symbol (the 14 zeros) => 20 zeros => 20_000 x 4.
        let words = [999_999u64, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, cells) = pharaoh_eval(&randomness_from_words(&words));
        assert!(cells[..6].iter().all(|&c| c == 9));
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4);

        // All-zero board: 20 of a kind of symbol 0 => 20_000 x 4.
        let words = [0u64, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, _) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4);

        // Below the threshold: counts 4,5,4,3,3,1,0,0,0,0 (max 5 < 6), so
        // no win. Digits: 0x4 (0-3), 1x5 (4-7, 19), 2x4 (8-11), 3x3 (12-14),
        // 4x3 (15-17), 5x1 (18). All terms fit in u64 (digit 19 = 1).
        let mut val = 0u64;
        for i in 4..8u32 {
            val += 10u64.pow(i); // digits 4-7 = 1
        }
        val += 10u64.pow(19); // digit 19 = 1
        for i in 8..12u32 {
            val += 2 * 10u64.pow(i); // digits 8-11 = 2
        }
        for i in 12..15u32 {
            val += 3 * 10u64.pow(i); // digits 12-14 = 3
        }
        for i in 15..18u32 {
            val += 4 * 10u64.pow(i); // digits 15-17 = 4
        }
        val += 5 * 10u64.pow(18); // digit 18 = 5
        let words = [val, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, _) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(mult, 0);
    }

    #[test]
    fn pharaoh_eval_wild_substitutes() {
        // Digits: 9,9,1,1,1 then zeros. The wilds expand into the most
        // frequent non-wild symbol — the 15 zeros — giving 17 zeros =>
        // 20_000 x 4 = 80_000 bp (the 3 ones are irrelevant).
        let words = [
            11199u64, 0, 0, 0, 0, 0, 0, 0,
        ];
        let (mult, _, cells) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(&cells[..5], &[9, 9, 1, 1, 1]);
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4);

        // 9,9,8,8,8: the wilds expand into the most frequent non-wild
        // symbol (15 zeros), so the 8s do not win; 17 zeros pay again.
        let words = [
            99_888u64, 0, 0, 0, 0, 0, 0, 0,
        ];
        let (mult, _, _) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4);
    }

    #[test]
    fn pharaoh_eval_free_spins_trigger() {
        // 4 scarabs (symbol 8) => free-spins round. Every board (base + 3
        // free) wins via its 14-16 zeros => PHARAOH_BASE_BP[0] x 4 each,
        // total PHARAOH_BASE_BP[0] x 16 bp.
        let words = [8888u64, 111111u64, 222222u64, 333333u64, 0, 0, 0, 0];
        let (mult, _, cells) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(cells[0], 8);
        assert_eq!(cells[1], 8);
        assert_eq!(cells[2], 8);
        assert_eq!(cells[3], 8);
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4 * 4);
        assert!(mult <= SLOTS_MAX_MULTIPLIER_BP);
    }

    #[test]
    fn pharaoh_eval_no_trigger_without_scarabs() {
        // 3 scarabs: no free spins; 17 zeros win via the expanded wilds.
        let words = [99_888u64, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, cells) = pharaoh_eval(&randomness_from_words(&words));
        assert_eq!(cells[0], 8);
        assert_eq!(mult, PHARAOH_BASE_BP[0] * 4);
    }

    #[test]
    fn dragon_eval_grid_and_pearl_tiers() {
        // 15 cells all 0 => 15 of a kind of symbol 0 => DRAGON_BASE_BP[0] x 4.
        let words = [0u64, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, cells) = dragon_eval(&randomness_from_words(&words));
        assert_eq!(cells.len(), DRAGON_CELLS);
        assert_eq!(mult, DRAGON_BASE_BP[0] * 4);

        // 4 pearls (symbol 8) + 3 ones + 8 zeros: the winner is the most
        // frequent symbol — 8 zeros => DRAGON_BASE_BP[0] x 4, no tier.
        let val = 1 + 10 + 100
            + 8 * 10u64.pow(3)
            + 8 * 10u64.pow(4)
            + 8 * 10u64.pow(5)
            + 8 * 10u64.pow(6);
        let words = [val, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, cells) = dragon_eval(&randomness_from_words(&words));
        assert_eq!(&cells[..7], &[1, 1, 1, 8, 8, 8, 8]);
        assert_eq!(mult, DRAGON_BASE_BP[0] * 4);

        // 5 pearls + 7 zeros + 3 ones: zeros (7) are still most frequent =>
        // 80_000, doubled by the pearl tier => 160_000 bp.
        let val = 1 + 10 + 100
            + 8 * 10u64.pow(3)
            + 8 * 10u64.pow(4)
            + 8 * 10u64.pow(5)
            + 8 * 10u64.pow(6)
            + 8 * 10u64.pow(7);
        let words = [val, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, _) = dragon_eval(&randomness_from_words(&words));
        assert_eq!(mult, DRAGON_BASE_BP[0] * 4 * 2);

        // A board with no symbol reaching 4 cells pays nothing even with
        // pearls present (cells: 0,0,1,1,2,2,3,3,4,4,5,5,6,6,7).
        let mut val = 0u64;
        for i in 0..14u32 {
            val += (i / 2) as u64 * 10u64.pow(i);
        }
        val += 7 * 10u64.pow(14);
        let words = [val, 0, 0, 0, 0, 0, 0, 0];
        let (mult, _, _) = dragon_eval(&randomness_from_words(&words));
        assert_eq!(mult, 0);
    }

    #[test]
    fn mines_eval_cascades_accumulate() {
        // All-6s board: 12 zeros + 6 sixes; zeros (12) win at cascade 1
        // (MINES_BASE_BP[0] x 4), refills are all zeros so the cascades
        // keep paying MINES_BASE_BP[0] x 4 x level (1..5) => x 15 total.
        let mut words = [0u64; 8];
        words[0] = 666_666u64; // digits 0..=5 = 6
        let (mult, _, final_cells) = mines_eval(&randomness_from_words(&words));
        assert_eq!(mult, MINES_BASE_BP[0] * 4 * 15);
        assert_eq!(final_cells.len(), MINES_CELLS);

        // No win: zero payout.
        // 18 cells with counts 2,2,2,2,2,2,2,2,2,0 -> value with digit i = i/2
        // for i in 0..18 (digits 0,0,1,1,...,8,8): every count <= 2.
        let mut words = [0u64; 8];
        let mut val = 0u64;
        for i in 0..18u32 {
            val += (i / 2) as u64 * 10u64.pow(i);
        }
        words[0] = val;
        let (mult, _, _) = mines_eval(&randomness_from_words(&words));
        assert_eq!(mult, 0);
    }

    #[test]
    fn grid_evals_never_exceed_cap() {
        let mut rng = XorShift(0x5EED_CAFE);
        for _ in 0..20_000 {
            let r = rng.bytes64();
            let (m1, _, _) = pharaoh_eval(&r);
            let (m2, _, _) = dragon_eval(&r);
            let (m3, _, _) = mines_eval(&r);
            assert!(m1 <= SLOTS_MAX_MULTIPLIER_BP);
            assert!(m2 <= SLOTS_MAX_MULTIPLIER_BP);
            assert!(m3 <= SLOTS_MAX_MULTIPLIER_BP);
        }
    }

    /// Measures RTP (fraction of wager returned), hit rate, and the max
    /// multiplier for a game eval over `n` pseudo-random draws.
    fn measure_rtp(mut eval: impl FnMut(&[u8; 64]) -> u64, n: usize) -> (f64, f64, u64) {
        let mut rng = XorShift(0xDEAD_BEEF);
        let mut total: u128 = 0;
        let mut wins: u64 = 0;
        let mut max_mult: u64 = 0;
        for _ in 0..n {
            let mult = eval(&rng.bytes64());
            total += mult as u128;
            wins += (mult > 0) as u64;
            max_mult = max_mult.max(mult);
        }
        (
            total as f64 / (n as f64 * 10_000.0),
            wins as f64 / n as f64,
            max_mult,
        )
    }

    /// Binary-searches a uniform scale on the base paytable so the game
    /// RTP lands on `target`. All iterations share the same draw stream,
    /// which makes the measured RTP monotone in the scale, so the search
    /// converges deterministically. Prints the tuned table (rounded up to
    /// the nearest 25 bp so the final RTP slightly exceeds the target)
    /// plus stats; used only to calibrate the `*_BASE_BP` constants.
    fn tune(
        name: &str,
        mut eval: impl FnMut(&[u8; 64], &[u64; 10]) -> u64,
        shape: [u64; 10],
        target: f64,
        n: usize,
    ) {
        let mut rng = XorShift(0xDEAD_BEEF);
        let draws: Vec<[u8; 64]> = (0..n).map(|_| rng.bytes64()).collect();
        let mut lo = 0.05f64;
        let mut hi = 10.0f64;
        for _ in 0..40 {
            let mid = (lo + hi) / 2.0;
            let base = shape.map(|b| (b as f64 * mid).round() as u64);
            let total: u128 = draws.iter().map(|r| eval(r, &base) as u128).sum();
            let rtp = total as f64 / (n as f64 * 10_000.0);
            if rtp < target {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let mid = (lo + hi) / 2.0;
        let base = shape.map(|b| ((b as f64 * mid / 25.0).ceil() * 25.0) as u64);
        let mut wins: u64 = 0;
        let mut max_mult: u64 = 0;
        let mut total: u128 = 0;
        for r in &draws {
            let m = eval(r, &base);
            total += m as u128;
            wins += (m > 0) as u64;
            max_mult = max_mult.max(m);
        }
        let rtp = total as f64 / (n as f64 * 10_000.0);
        println!(
            "{name}: scale={mid:.5} rtp={rtp:.4} winrate={:.4} maxmult={}x",
            wins as f64 / n as f64,
            max_mult / 10_000
        );
        println!("{name}_BASE_BP = [{}]", base.map(|b| b.to_string()).join(", "));
    }

    #[test]
    #[ignore = "paytable tuner: run with --ignored --nocapture to calibrate the base tables"]
    fn tune_grid_paytables() {
        tune(
            "pharaoh",
            |r, b| pharaoh_eval_with(r, b).0,
            PHARAOH_BASE_BP,
            0.960,
            200_000,
        );
        tune(
            "dragon",
            |r, b| dragon_eval_with(r, b).0,
            DRAGON_BASE_BP,
            0.960,
            200_000,
        );
        tune(
            "mines",
            |r, b| mines_eval_with(r, b).0,
            MINES_BASE_BP,
            0.955,
            200_000,
        );
    }

    #[test]
    fn grid_rtp_is_between_95_and_98_percent() {
        // Sampled RTP check with deterministic pseudo-random inputs. Each
        // game must return between 95% and 98% of the wager, and no spin
        // may ever exceed the 100x bankroll ceiling.
        let cases: [(&str, fn(&[u8; 64]) -> (u64, u64, Vec<u8>), usize); 3] = [
            ("pharaoh", |r| {
                let (m, raw, c) = pharaoh_eval(r);
                (m, raw, c.to_vec())
            }, PHARAOH_CELLS),
            ("dragon", |r| {
                let (m, raw, c) = dragon_eval(r);
                (m, raw, c.to_vec())
            }, DRAGON_CELLS),
            ("mines", |r| {
                let (m, raw, c) = mines_eval(r);
                (m, raw, c.to_vec())
            }, MINES_CELLS),
        ];
        for (name, eval, cells) in cases {
            let n = 2_000_000usize;
            let mut rng = XorShift(0x0BAD_5EED);
            let mut total: u128 = 0;
            let mut max_mult: u64 = 0;
            for _ in 0..n {
                let r = rng.bytes64();
                let (mult, _, syms) = eval(&r);
                assert_eq!(syms.len(), cells, "{name} cell count");
                assert!(mult <= SLOTS_MAX_MULTIPLIER_BP, "{name} over cap");
                total += mult as u128;
                max_mult = max_mult.max(mult);
            }
            let rtp = total as f64 / (n as f64 * 10_000.0);
            println!("{name}: rtp={rtp:.4} maxmult={}x", max_mult / 10_000);
            assert!(
                rtp <= 0.98 + 1e-9,
                "{name} rtp {rtp:.4} too high"
            );
            assert!(rtp > 0.95, "{name} rtp {rtp:.4} too low");
        }
    }
}
