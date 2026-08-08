use {
    anchor_lang::{
        solana_program::instruction::Instruction, AccountDeserialize, AccountSerialize,
        InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_account::Account,
    solana_instruction::error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::{pubkey, Pubkey},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
    spin::constants::*,
    spin::state::*,
};

const PROGRAM_ID: Pubkey = pubkey!("9sd7ASeBUmcCNm4eVFfQ7rSujtbVLmu8wMUh9PwdNWvP");

// Anchor custom error codes are 6000 + index into the error enum.
const ERR_HOUSE_PAUSED: u32 = 6000;
const ERR_NOT_AUTHORITY: u32 = 6001;
const ERR_BET_BELOW_MINIMUM: u32 = 6002;
const ERR_BET_ABOVE_MAXIMUM: u32 = 6003;
const ERR_BET_EXCEEDS_BANKROLL: u32 = 6004;
const ERR_TREASURY_BALANCE_TOO_LOW: u32 = 6005;
const ERR_TARGET_OUT_OF_RANGE: u32 = 6006;
const ERR_INVALID_DELEGATE: u32 = 6018;
const ERR_DELEGATE_EXPIRED: u32 = 6019;
const ERR_DELEGATE_LIMIT_EXCEEDED: u32 = 6020;
const ERR_INSUFFICIENT_CREDITS: u32 = 6021;
const ERR_TREASURY_INSOLVENT: u32 = 6022;

fn svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/spin.so");
    svm.add_program(PROGRAM_ID, bytes).unwrap();
    svm
}

fn airdrop(svm: &mut LiteSVM, key: &Pubkey, lamports: u64) {
    let res = svm.airdrop(key, lamports);
    assert!(res.is_ok(), "airdrop failed: {:?}", res.err());
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<(), TransactionError> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    let res = svm.send_transaction(tx);
    match res {
        Ok(_) => Ok(()),
        Err(f) => Err(f.err),
    }
}

fn assert_custom_error(res: Result<(), TransactionError>, code: u32) {
    match res.unwrap_err() {
        TransactionError::InstructionError(_, err) => match err {
            InstructionError::Custom(c) => assert_eq!(c, code, "expected custom error {code}"),
            other => panic!("expected custom error {code}, got {other:?}"),
        },
        other => panic!("expected InstructionError, got {other:?}"),
    }
}

fn is_custom_error(res: Result<(), TransactionError>, code: u32) -> bool {
    match res.err() {
        Some(TransactionError::InstructionError(_, InstructionError::Custom(c))) => c == code,
        _ => false,
    }
}

/// Bootstraps the house and the dice game config.
fn bootstrap(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    airdrop(svm, &admin.pubkey(), 10_000_000_000);

    let treasury = spin::state::house_address();
    let vrf_state = spin::state::vrf_state_address();
    let network_state = spin::state::vrf_network_state_address();

    // init_config
    send(
        svm,
        admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitConfig {}.data(),
            spin::accounts::InitConfig {
                authority: admin.pubkey(),
                treasury,
                vrf_state,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("init_config");

    // init_credits
    send(
        svm,
        admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitCredits {}.data(),
            spin::accounts::InitCredits {
                authority: admin.pubkey(),
                treasury,
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("init_credits");

    // init_game_config: dice 101..=9800 targets, 1M..=1G lamports, 200bp edge
    let config = spin::state::game_config_address(GAME_DICE);
    let mut params = [0u8; 32];
    params[..2].copy_from_slice(&101u16.to_le_bytes());
    params[2..4].copy_from_slice(&9800u16.to_le_bytes());
    send(
        svm,
        admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitGameConfig {
                game_id: GAME_DICE,
                min_bet: 1_000_000,
                max_bet: 1_000_000_000,
                house_edge_bp: 200,
                params,
            }
            .data(),
            spin::accounts::InitGameConfig {
                authority: admin.pubkey(),
                treasury,
                config,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("init_game_config");

    // init_game_config: slots, same limits, params unused (paytable is a
    // program constant).
    let config = spin::state::game_config_address(GAME_SLOTS);
    send(
        svm,
        admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitGameConfig {
                game_id: GAME_SLOTS,
                min_bet: 1_000_000,
                max_bet: 1_000_000_000,
                house_edge_bp: 200,
                params: [0u8; 32],
            }
            .data(),
            spin::accounts::InitGameConfig {
                authority: admin.pubkey(),
                treasury,
                config,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("init_game_config slots");

    // Fabricate the ORAO network state account so the program can read fees.
    let mut data = Vec::new();
    let ns = NetworkState {
        bump: 255,
        config: NetworkConfiguration {
            authority: admin.pubkey(),
            treasury: admin.pubkey(),
            request_fee: 1000,
            callback_deadline: 9000,
            fulfill_authorities: vec![],
        },
        num_requests: 0,
        num_registered: 1,
        num_terminated: 0,
    };
    ns.try_serialize(&mut data).unwrap();
    let mut account = Account::new(1_000_000, data.len(), &VRF_PROGRAM_ID);
    account.data = data;
    svm.set_account(network_state, account).expect("set network state");

    // Fund the bankroll.
    send(
        svm,
        admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryDeposit { amount: 1_000_000_000 }.data(),
            spin::accounts::TreasuryDeposit {
                authority: admin.pubkey(),
                treasury,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("treasury_deposit");

    treasury
}

#[test]
fn test_init_config_creates_accounts() {
    let mut svm = svm();
    let admin = Keypair::new();
    airdrop(&mut svm, &admin.pubkey(), 10_000_000_000);

    let treasury = spin::state::house_address();
    let vrf_state = spin::state::vrf_state_address();
    send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitConfig {}.data(),
            spin::accounts::InitConfig {
                authority: admin.pubkey(),
                treasury,
                vrf_state,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("init_config");

    let account = svm.get_account(&treasury).expect("treasury account");
    let treasury_data = HouseTreasury::try_deserialize(&mut &account.data[..]).unwrap();
    assert_eq!(treasury_data.authority, admin.pubkey());
    assert!(!treasury_data.paused);
}

#[test]
fn test_init_game_config_requires_authority() {
    let mut svm = svm();
    let admin = Keypair::new();
    let stranger = Keypair::new();
    bootstrap(&mut svm, &admin);
    airdrop(&mut svm, &stranger.pubkey(), 1_000_000_000);

    let treasury = spin::state::house_address();
    let config = spin::state::game_config_address(GAME_DICE);
    let res = send(
        &mut svm,
        &stranger,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::InitGameConfig {
                game_id: GAME_DICE,
                min_bet: 1,
                max_bet: 2,
                house_edge_bp: 200,
                params: [0u8; 32],
            }
            .data(),
            spin::accounts::InitGameConfig {
                authority: stranger.pubkey(),
                treasury,
                config,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    assert_custom_error(res, ERR_NOT_AUTHORITY);
}

#[test]
fn test_treasury_deposit_withdraw() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);

    // Deposit again, then withdraw less than the balance.
    send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryDeposit { amount: 500_000_000 }.data(),
            spin::accounts::TreasuryDeposit {
                authority: admin.pubkey(),
                treasury,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("deposit");
    let before = svm.get_account(&treasury).unwrap().lamports;

    send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryWithdraw { amount: 300_000_000 }.data(),
            spin::accounts::TreasuryWithdraw {
                authority: admin.pubkey(),
                treasury,
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("withdraw");
    let after = svm.get_account(&treasury).unwrap().lamports;
    assert_eq!(before - after, 300_000_000);

    // Over-withdraw fails.
    let res = send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryWithdraw {
                amount: after + 1,
            }
            .data(),
            spin::accounts::TreasuryWithdraw {
                authority: admin.pubkey(),
                treasury,
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    assert_custom_error(res, ERR_TREASURY_BALANCE_TOO_LOW);
}

/// Buys `amount` of credit for `player`, creating their vault.
fn deposit(svm: &mut LiteSVM, player: &Keypair, amount: u64) -> Result<(), TransactionError> {
    send(
        svm,
        player,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::Deposit { amount }.data(),
            spin::accounts::Deposit {
                player: player.pubkey(),
                treasury: spin::state::house_address(),
                vault: spin::state::player_vault_address(&player.pubkey()),
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
}

fn withdraw(
    svm: &mut LiteSVM,
    signer: &Keypair,
    player: &Pubkey,
    amount: u64,
) -> Result<(), TransactionError> {
    send(
        svm,
        signer,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::Withdraw { amount }.data(),
            spin::accounts::Withdraw {
                player: signer.pubkey(),
                treasury: spin::state::house_address(),
                vault: spin::state::player_vault_address(player),
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
}

fn set_delegate(
    svm: &mut LiteSVM,
    player: &Keypair,
    delegate: &Pubkey,
    expiry_slot: u64,
    spend_limit: u64,
) -> Result<(), TransactionError> {
    send(
        svm,
        player,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::SetDelegate {
                delegate: *delegate,
                expiry_slot,
                spend_limit,
            }
            .data(),
            spin::accounts::SetDelegate {
                player: player.pubkey(),
                vault: spin::state::player_vault_address(&player.pubkey()),
            }
            .to_account_metas(None),
        ),
    )
}

fn vault_of(svm: &LiteSVM, player: &Pubkey) -> PlayerVault {
    let account = svm
        .get_account(&spin::state::player_vault_address(player))
        .expect("vault account");
    PlayerVault::try_deserialize(&mut &account.data[..]).expect("vault decode")
}

fn credits_total(svm: &LiteSVM) -> u64 {
    let account = svm
        .get_account(&spin::state::credits_address())
        .expect("credits account");
    CreditLedger::try_deserialize(&mut &account.data[..])
        .expect("credits decode")
        .total
}

fn place_bet_ix(
    player: &Pubkey,
    treasury: &Pubkey,
    vrf_treasury: &Pubkey,
    amount: u64,
    target: u64,
    seed: [u8; 32],
) -> (Instruction, Pubkey, Pubkey, Pubkey, Pubkey) {
    place_bet_ix_for(
        GAME_DICE,
        player,
        player,
        treasury,
        vrf_treasury,
        amount,
        target,
        seed,
    )
}

#[allow(clippy::too_many_arguments)]
fn place_bet_ix_for(
    game_id: u8,
    authority: &Pubkey,
    player: &Pubkey,
    treasury: &Pubkey,
    vrf_treasury: &Pubkey,
    amount: u64,
    target: u64,
    seed: [u8; 32],
) -> (Instruction, Pubkey, Pubkey, Pubkey, Pubkey) {
    let session = spin::state::player_session_address(player);
    let vrf_state = spin::state::vrf_state_address();
    let client = spin::state::vrf_client_address(&vrf_state);
    let network_state = spin::state::vrf_network_state_address();
    let pending = spin::state::pending_address(&seed);
    let request = spin::state::vrf_request_address(&client, &seed);

    let ix = Instruction::new_with_bytes(
        PROGRAM_ID,
        &spin::instruction::PlaceBet {
            game_id,
            amount,
            target,
            seed,
        }
        .data(),
        spin::accounts::PlaceBet {
            authority: *authority,
            player: *player,
            treasury: *treasury,
            vault: spin::state::player_vault_address(player),
            credits: spin::state::credits_address(),
            session,
            config: spin::state::game_config_address(game_id),
            vrf_state,
            pending,
            client,
            network_state,
            vrf_treasury: *vrf_treasury,
            request,
            vrf_program: spin::constants::VRF_PROGRAM_ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    );
    (ix, session, pending, client, request)
}

#[test]
fn test_place_bet_validations() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 100_000_000).expect("deposit");
    let seed = [7u8; 32];

    // Below minimum.
    let (ix, _, _, _, _) = place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), 100, 5000, seed);
    assert_custom_error(send(&mut svm, &player, ix), ERR_BET_BELOW_MINIMUM);

    // Above maximum.
    let (ix, _, _, _, _) = place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), 2_000_000_000, 5000, seed);
    assert_custom_error(send(&mut svm, &player, ix), ERR_BET_ABOVE_MAXIMUM);

    // Target out of range.
    let (ix, _, _, _, _) = place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), 1_000_000, 50, seed);
    assert_custom_error(send(&mut svm, &player, ix), ERR_TARGET_OUT_OF_RANGE);

    // Bankroll limit: a bet may not exceed 1% of the treasury. Derived from
    // the live balance rather than hardcoded, since player deposits land in
    // the treasury too and move this ceiling.
    let over_limit = svm.get_account(&treasury).unwrap().lamports / TREASURY_BANKROLL_DIVISOR + 1;
    let (ix, _, _, _, _) =
        place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), over_limit, 5000, seed);
    assert_custom_error(send(&mut svm, &player, ix), ERR_BET_EXCEEDS_BANKROLL);
}

#[test]
fn test_place_bet_house_paused() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 100_000_000).expect("deposit");

    send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::SetPaused { paused: true }.data(),
            spin::accounts::SetPaused {
                treasury,
                authority: admin.pubkey(),
            }
            .to_account_metas(None),
        ),
    )
    .expect("set_paused");

    let (ix, _, _, _, _) = place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), 1_000_000, 5000, [7u8; 32]);
    assert_custom_error(send(&mut svm, &player, ix), ERR_HOUSE_PAUSED);
}

#[test]
fn test_slots_bet_ignores_target() {
    // Slots has no target range: target = 0 must pass validation and reach
    // the VRF CPI (which fails on litesvm), NOT fail with TargetOutOfRange.
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 100_000_000).expect("deposit");
    let seed = [42u8; 32];

    let (ix, _, _, _, _) =
        place_bet_ix_for(GAME_SLOTS, &player.pubkey(), &player.pubkey(), &treasury, &admin.pubkey(), 1_000_000, 0, seed);
    let res = send(&mut svm, &player, ix);
    assert!(
        !is_custom_error(res.clone(), ERR_TARGET_OUT_OF_RANGE),
        "slots bet must not enforce the dice target range"
    );
    assert!(res.is_err(), "expected the tx to fail at the VRF CPI on litesvm");

    // The same tx shape with the dice game and target 0 fails the range check.
    let (ix, _, _, _, _) =
        place_bet_ix_for(GAME_DICE, &player.pubkey(), &player.pubkey(), &treasury, &admin.pubkey(), 1_000_000, 0, [43u8; 32]);
    assert_custom_error(send(&mut svm, &player, ix), ERR_TARGET_OUT_OF_RANGE);
}

#[test]
fn test_place_bet_moves_funds_before_vrf_cpi() {
    // Sanity: an unreachable VRF program makes the whole tx revert atomically.
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 100_000_000).expect("deposit");

    let player_before = svm.get_account(&player.pubkey()).unwrap().lamports;
    let (ix, session, pending, _, _) = place_bet_ix(&player.pubkey(), &treasury, &admin.pubkey(), 1_000_000, 5000, [9u8; 32]);
    let res = send(&mut svm, &player, ix);
    assert!(res.is_err(), "expected VRF CPI to fail on litesvm");
    let _ = (session, pending);
    let player_after = svm.get_account(&player.pubkey()).unwrap().lamports;
    assert!(player_after >= player_before - 1_000_000_000, "funds must not move on revert");
}

// ---------------------------------------------------------------------------
// Credit vault
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_credits_vault_and_ledger() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);

    let treasury_before = svm.get_account(&treasury).unwrap().lamports;
    deposit(&mut svm, &player, 250_000_000).expect("deposit");

    // The lamports land in the treasury, not the vault: the vault is an
    // accounting record and the treasury is what pays wins.
    assert_eq!(
        svm.get_account(&treasury).unwrap().lamports - treasury_before,
        250_000_000
    );
    let vault = vault_of(&svm, &player.pubkey());
    assert_eq!(vault.player, player.pubkey());
    assert_eq!(vault.balance, 250_000_000);
    assert_eq!(vault.delegate, Pubkey::default());
    assert_eq!(credits_total(&svm), 250_000_000);

    // A second deposit accumulates.
    deposit(&mut svm, &player, 50_000_000).expect("second deposit");
    assert_eq!(vault_of(&svm, &player.pubkey()).balance, 300_000_000);
    assert_eq!(credits_total(&svm), 300_000_000);
}

#[test]
fn test_withdraw_returns_sol_and_clears_credit() {
    let mut svm = svm();
    let admin = Keypair::new();
    bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 200_000_000).expect("deposit");

    let before = svm.get_account(&player.pubkey()).unwrap().lamports;
    withdraw(&mut svm, &player, &player.pubkey(), 150_000_000).expect("withdraw");
    let after = svm.get_account(&player.pubkey()).unwrap().lamports;

    assert!(after > before, "SOL must return to the player wallet");
    assert_eq!(vault_of(&svm, &player.pubkey()).balance, 50_000_000);
    assert_eq!(credits_total(&svm), 50_000_000);

    // Cannot withdraw more than the credit balance.
    let res = withdraw(&mut svm, &player, &player.pubkey(), 50_000_001);
    assert_custom_error(res, ERR_INSUFFICIENT_CREDITS);
}

#[test]
fn test_delegate_cannot_withdraw() {
    // The whole point of the session key: it may bet, never cash out.
    let mut svm = svm();
    let admin = Keypair::new();
    bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    let session_key = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    airdrop(&mut svm, &session_key.pubkey(), 1_000_000_000);
    deposit(&mut svm, &player, 200_000_000).expect("deposit");
    set_delegate(&mut svm, &player, &session_key.pubkey(), 10_000, 100_000_000)
        .expect("set_delegate");

    // Signed by the session key, targeting the player's vault. The vault PDA
    // is derived from the signer, so this resolves to the session key's own
    // (non-existent) vault rather than the player's — it must not succeed.
    let res = withdraw(&mut svm, &session_key, &player.pubkey(), 100_000_000);
    assert!(res.is_err(), "a delegate must never be able to withdraw");
    assert_eq!(vault_of(&svm, &player.pubkey()).balance, 200_000_000);
    assert_eq!(credits_total(&svm), 200_000_000);
}

#[test]
fn test_treasury_withdraw_cannot_take_player_credits() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 800_000_000).expect("deposit");

    let balance = svm.get_account(&treasury).unwrap().lamports;
    // Bankroll is 1 SOL and the player is owed 0.8 SOL, so draining the lot
    // must be rejected even though the lamports are physically there.
    let res = send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryWithdraw { amount: balance }.data(),
            spin::accounts::TreasuryWithdraw {
                authority: admin.pubkey(),
                treasury,
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    );
    assert_custom_error(res, ERR_TREASURY_INSOLVENT);

    // Withdrawing only house profit is fine.
    send(
        &mut svm,
        &admin,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::TreasuryWithdraw { amount: 100_000_000 }.data(),
            spin::accounts::TreasuryWithdraw {
                authority: admin.pubkey(),
                treasury,
                credits: spin::state::credits_address(),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
        ),
    )
    .expect("withdrawing house profit must be allowed");
}

// ---------------------------------------------------------------------------
// Session key delegation
//
// These bets all fail at the VRF CPI (litesvm has no ORAO program), so they
// assert on *which* error comes back: a delegate rejection happens before the
// CPI, while an accepted delegate gets all the way to it.
// ---------------------------------------------------------------------------

/// Places a delegate-signed dice bet and returns the resulting error, if any.
fn delegate_bet(
    svm: &mut LiteSVM,
    session_key: &Keypair,
    player: &Pubkey,
    treasury: &Pubkey,
    vrf_treasury: &Pubkey,
    amount: u64,
    seed: [u8; 32],
) -> Result<(), TransactionError> {
    let (ix, _, _, _, _) = place_bet_ix_for(
        GAME_DICE,
        &session_key.pubkey(),
        player,
        treasury,
        vrf_treasury,
        amount,
        5000,
        seed,
    );
    send(svm, session_key, ix)
}

fn delegated_setup() -> (LiteSVM, Keypair, Keypair, Keypair, Pubkey) {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    let session_key = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    airdrop(&mut svm, &session_key.pubkey(), 1_000_000_000);
    deposit(&mut svm, &player, 500_000_000).expect("deposit");
    (svm, admin, player, session_key, treasury)
}

#[test]
fn test_unarmed_delegate_cannot_bet() {
    let (mut svm, admin, player, session_key, treasury) = delegated_setup();
    let res = delegate_bet(
        &mut svm,
        &session_key,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        1_000_000,
        [1u8; 32],
    );
    assert_custom_error(res, ERR_INVALID_DELEGATE);
}

#[test]
fn test_wrong_delegate_cannot_bet() {
    let (mut svm, admin, player, session_key, treasury) = delegated_setup();
    let impostor = Keypair::new();
    airdrop(&mut svm, &impostor.pubkey(), 1_000_000_000);
    set_delegate(&mut svm, &player, &session_key.pubkey(), 100_000, 500_000_000)
        .expect("set_delegate");

    let res = delegate_bet(
        &mut svm,
        &impostor,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        1_000_000,
        [2u8; 32],
    );
    assert_custom_error(res, ERR_INVALID_DELEGATE);
}

#[test]
fn test_expired_delegate_cannot_bet() {
    let (mut svm, admin, player, session_key, treasury) = delegated_setup();
    // Valid for one slot, then warp past it.
    let expiry = svm
        .get_sysvar::<anchor_lang::solana_program::clock::Clock>()
        .slot
        + 1;
    set_delegate(&mut svm, &player, &session_key.pubkey(), expiry, 500_000_000)
        .expect("set_delegate");
    svm.warp_to_slot(expiry + 10);

    let res = delegate_bet(
        &mut svm,
        &session_key,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        1_000_000,
        [3u8; 32],
    );
    assert_custom_error(res, ERR_DELEGATE_EXPIRED);
}

#[test]
fn test_delegate_spend_cap_is_enforced() {
    let (mut svm, admin, player, session_key, treasury) = delegated_setup();
    set_delegate(&mut svm, &player, &session_key.pubkey(), 100_000, 5_000_000)
        .expect("set_delegate");

    // Over the remaining cap, even though the vault and bankroll both allow it.
    let res = delegate_bet(
        &mut svm,
        &session_key,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        6_000_000,
        [4u8; 32],
    );
    assert_custom_error(res, ERR_DELEGATE_LIMIT_EXCEEDED);

    // Within the cap: reaches the VRF CPI, which is as far as litesvm goes.
    let res = delegate_bet(
        &mut svm,
        &session_key,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        5_000_000,
        [5u8; 32],
    );
    assert!(res.is_err(), "expected the tx to fail at the VRF CPI");
    for code in [
        ERR_INVALID_DELEGATE,
        ERR_DELEGATE_EXPIRED,
        ERR_DELEGATE_LIMIT_EXCEEDED,
        ERR_INSUFFICIENT_CREDITS,
    ] {
        assert!(
            !is_custom_error(res.clone(), code),
            "an in-cap delegate bet must pass authorization (hit {code})"
        );
    }
}

#[test]
fn test_bet_over_credit_balance_is_rejected() {
    let mut svm = svm();
    let admin = Keypair::new();
    let treasury = bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    // Deposit less than the bet, but keep the bet inside the game's max and
    // the 1%-of-bankroll rule so it is the credit check that trips.
    deposit(&mut svm, &player, 2_000_000).expect("deposit");

    let (ix, _, _, _, _) = place_bet_ix(
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        5_000_000,
        5000,
        [6u8; 32],
    );
    assert_custom_error(send(&mut svm, &player, ix), ERR_INSUFFICIENT_CREDITS);
}

#[test]
fn test_revoke_delegate_blocks_further_bets() {
    let (mut svm, admin, player, session_key, treasury) = delegated_setup();
    set_delegate(&mut svm, &player, &session_key.pubkey(), 100_000, 500_000_000)
        .expect("set_delegate");

    send(
        &mut svm,
        &player,
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &spin::instruction::RevokeDelegate {}.data(),
            spin::accounts::SetDelegate {
                player: player.pubkey(),
                vault: spin::state::player_vault_address(&player.pubkey()),
            }
            .to_account_metas(None),
        ),
    )
    .expect("revoke_delegate");

    let vault = vault_of(&svm, &player.pubkey());
    assert_eq!(vault.delegate, Pubkey::default());
    assert_eq!(vault.delegate_spend_left, 0);

    let res = delegate_bet(
        &mut svm,
        &session_key,
        &player.pubkey(),
        &treasury,
        &admin.pubkey(),
        1_000_000,
        [8u8; 32],
    );
    assert_custom_error(res, ERR_INVALID_DELEGATE);
}

#[test]
fn test_set_delegate_rejects_unbounded_authorization() {
    let mut svm = svm();
    let admin = Keypair::new();
    bootstrap(&mut svm, &admin);
    let player = Keypair::new();
    let session_key = Keypair::new();
    airdrop(&mut svm, &player.pubkey(), 10_000_000_000);
    deposit(&mut svm, &player, 100_000_000).expect("deposit");

    // Zero spend cap.
    let res = set_delegate(&mut svm, &player, &session_key.pubkey(), 100_000, 0);
    assert_custom_error(res, ERR_DELEGATE_LIMIT_EXCEEDED);

    // Expiry in the past.
    let res = set_delegate(&mut svm, &player, &session_key.pubkey(), 0, 100_000);
    assert_custom_error(res, ERR_DELEGATE_EXPIRED);

    // Default pubkey as the delegate.
    let res = set_delegate(&mut svm, &player, &Pubkey::default(), 100_000, 100_000);
    assert_custom_error(res, ERR_INVALID_DELEGATE);
}
