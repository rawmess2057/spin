//! End-to-end behaviour of the commit-reveal bet lifecycle.

mod common;

use common::*;
use spin::constants::*;
use spin::error::SpinError;
use spin::games;
use spin::games::plinko;
use spin::state::BetStatus;

const BET: u64 = 100 * DIAMOND; // 0.01 SOL
const SEED: [u8; 32] = [42u8; 32];

fn low_target() -> u64 {
    plinko::encode_target(8, plinko::RISK_LOW)
}

#[test]
fn place_then_settle_pays_the_evaluated_outcome() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, 5 * SOL));

    let before = h.vault(&p).balance;
    let treasury_before = h.treasury_lamports();
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));

    let bet = h.bet(&p);
    assert_eq!(bet.status, BetStatus::Open);
    assert_eq!(bet.nonce, 1);
    assert_eq!(bet.seq, 0);
    assert_eq!(bet.chain_epoch, 1);
    assert_eq!(bet.index_at_place, 0);
    assert_eq!(bet.commitment, h.chain.genesis());
    let max_payout = games::payout(BET, plinko::max_multiplier_bp(low_target()).unwrap()).unwrap();
    assert_eq!(bet.reserved, max_payout);
    assert_eq!(h.ledger().reserved, max_payout);
    assert_eq!(h.vault(&p).balance, before - BET);
    assert_eq!(h.ledger().total, before - BET);
    let chain = h.chain_state();
    assert_eq!(chain.next_seq, 1);
    assert_eq!(chain.cursor, 0);
    assert_eq!(chain.index, 0);
    // No lamports move on place: the stake was already in the treasury.
    assert_eq!(h.treasury_lamports(), treasury_before);

    let reveal = h.chain.reveal(0);
    ok(h.settle_bet(p, reveal));

    let bet = h.bet(&p);
    assert_eq!(bet.status, BetStatus::Settled);
    assert_eq!(bet.reveal, reveal);
    assert_eq!(bet.reveal_index, 1);
    assert_eq!(bet.reserved, 0);
    let randomness = games::derive_randomness(&reveal, &SEED, &p, 1);
    let expected = games::evaluate(GAME_PLINKO, &randomness, BET, low_target()).unwrap();
    assert_eq!(bet.roll, expected.roll);
    assert_eq!(bet.payout, expected.payout);
    assert_eq!(h.vault(&p).balance, before - BET + expected.payout);
    assert_eq!(h.ledger().total, before - BET + expected.payout);
    assert_eq!(h.ledger().reserved, 0);
    let chain = h.chain_state();
    assert_eq!(chain.index, 1);
    assert_eq!(chain.cursor, 1);
    assert_eq!(chain.commitment, reveal);
    let s = h.session(&p);
    assert_eq!(s.wagered, BET);
    assert_eq!(s.won, expected.payout);
    assert_eq!(s.bets, 1);

    // Settling again: nothing is open.
    expect_err(h.settle_bet(p, h.chain.reveal(1)), SpinError::BetNotOpen);

    // A second bet reuses the account, bumps the nonce, uses the next link.
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
    let bet = h.bet(&p);
    assert_eq!(bet.nonce, 2);
    assert_eq!(bet.seq, 1);
    assert_eq!(bet.index_at_place, 1);
    assert_eq!(bet.commitment, reveal);
    ok(h.settle_bet(p, h.chain.reveal(1)));
    assert_eq!(h.chain_state().index, 2);
}

#[test]
fn settle_rejects_a_wrong_preimage() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL));
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
    // Skipping a link, a random value, and the genesis itself are all wrong.
    expect_err(h.settle_bet(p, h.chain.reveal(1)), SpinError::ChainBadReveal);
    expect_err(h.settle_bet(p, [0u8; 32]), SpinError::ChainBadReveal);
    expect_err(h.settle_bet(p, h.chain.genesis()), SpinError::ChainBadReveal);
    assert_eq!(h.bet(&p).status, BetStatus::Open);
    ok(h.settle_bet(p, h.chain.reveal(0)));
}

#[test]
fn bets_settle_strictly_in_order() {
    let mut h = Harness::new(100);
    let a = h.new_player(10);
    let b = h.new_player(10);
    let pa = pk(&a.pubkey_addr());
    let pb = pk(&b.pubkey_addr());
    ok(h.deposit(&a, SOL));
    ok(h.deposit(&b, SOL));
    ok(h.place_bet(&a, pa, GAME_PLINKO, BET, low_target(), SEED));
    ok(h.place_bet(&b, pb, GAME_PLINKO, BET, low_target(), SEED));
    assert_eq!(h.bet(&pa).seq, 0);
    assert_eq!(h.bet(&pb).seq, 1);

    expect_err(h.settle_bet(pb, h.chain.reveal(0)), SpinError::BetNotHead);
    ok(h.settle_bet(pa, h.chain.reveal(0)));
    // b's reveal is the next link, not the one a used.
    expect_err(h.settle_bet(pb, h.chain.reveal(0)), SpinError::ChainBadReveal);
    ok(h.settle_bet(pb, h.chain.reveal(1)));
    assert_eq!(h.chain_state().cursor, 2);
}

#[test]
fn one_open_bet_per_player() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL));
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED),
        SpinError::BetAlreadyOpen,
    );
}

#[test]
fn cancel_refunds_after_timeout_and_unblocks_the_queue() {
    let mut h = Harness::new(100);
    let a = h.new_player(10);
    let b = h.new_player(10);
    let pa = pk(&a.pubkey_addr());
    let pb = pk(&b.pubkey_addr());
    ok(h.deposit(&a, SOL));
    ok(h.deposit(&b, SOL));
    ok(h.place_bet(&a, pa, GAME_PLINKO, BET, low_target(), SEED));
    ok(h.place_bet(&b, pb, GAME_PLINKO, BET, low_target(), SEED));
    let reserved_each = h.bet(&pa).reserved;
    assert_eq!(h.ledger().reserved, 2 * reserved_each);

    // Too early, and never for a non-head bet.
    expect_err(h.cancel_bet(pa), SpinError::BetNotTimedOut);
    h.warp(BET_TIMEOUT_SLOTS);
    expect_err(h.cancel_bet(pb), SpinError::BetNotHead);

    // The house never showed up: anyone cancels the head bet.
    ok(h.cancel_bet(pa));
    let bet = h.bet(&pa);
    assert_eq!(bet.status, BetStatus::Cancelled);
    assert_eq!(bet.reserved, 0);
    assert_eq!(h.vault(&pa).balance, SOL);
    assert_eq!(h.ledger().reserved, reserved_each);
    let chain = h.chain_state();
    assert_eq!(chain.cursor, 1);
    assert_eq!(chain.stalls, 1);
    assert_eq!(chain.index, 0, "a cancel consumes no reveal");
    expect_err(h.cancel_bet(pa), SpinError::BetNotOpen);

    // b is now the head and settles with the first link.
    ok(h.settle_bet(pb, h.chain.reveal(0)));
    assert_eq!(h.ledger().reserved, 0);
    // a can bet again.
    ok(h.place_bet(&a, pa, GAME_PLINKO, BET, low_target(), SEED));
    assert_eq!(h.bet(&pa).nonce, 2);
}

#[test]
fn bankroll_guard_reserves_the_maximum_payout() {
    // 20 SOL bankroll: free/4 = 5 SOL. 16 rows / High pays 920.92x, so a
    // 0.01 SOL bet (max 9.2 SOL) must be refused, a 0.005 SOL one accepted.
    let mut h = Harness::new(20);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, 2 * SOL));
    let high = plinko::encode_target(16, plinko::RISK_HIGH);
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, BET, high, SEED),
        SpinError::MaxPayoutExceedsBankroll,
    );
    ok(h.place_bet(&player, p, GAME_PLINKO, BET / 2, high, SEED));
    let reserved = h.bet(&p).reserved;
    assert_eq!(reserved, games::payout(BET / 2, 9_209_200).unwrap());

    // The house cannot withdraw what is owed or reserved.
    let rent = h.svm.minimum_balance_for_rent_exemption(spin::state::HouseTreasury::SIZE);
    let committed = h.ledger().total + reserved + rent;
    let free = h.treasury_lamports() - committed;
    expect_err(h.treasury_withdraw(free + 1), SpinError::TreasuryInsolvent);
    ok(h.treasury_withdraw(free));

    // Deposits count against the bankroll: a whale depositing doesn't make
    // the house richer.
    let whale = h.new_player(100);
    ok(h.deposit(&whale, 50 * SOL));
    let pw = pk(&whale.pubkey_addr());
    expect_err(
        h.place_bet(&whale, pw, GAME_PLINKO, 10 * BET, high, SEED),
        SpinError::MaxPayoutExceedsBankroll,
    );
}

#[test]
fn invalid_targets_and_limits_are_rejected_at_place_time() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL / 2));
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, BET, 0, SEED),
        SpinError::InvalidTarget,
    );
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, BET, plinko::encode_target(17, 0), SEED),
        SpinError::InvalidTarget,
    );
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, DIAMOND - 1, low_target(), SEED),
        SpinError::BetBelowMinimum,
    );
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, 10_001 * DIAMOND, low_target(), SEED),
        SpinError::BetAboveMaximum,
    );
    // max_bet (1 SOL) is above the 0.5 SOL balance.
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, SOL, low_target(), SEED),
        SpinError::InsufficientCredits,
    );
    // Unregistered game: the config PDA doesn't exist.
    assert!(h
        .place_bet(&player, p, GAME_WHEEL, BET, 0, SEED)
        .is_err());
}

#[test]
fn session_key_bets_within_a_net_loss_allowance() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL));
    let session = h.new_player(1);
    let sp = pk(&session.pubkey_addr());

    // An unarmed session key can't bet.
    expect_err(
        h.place_bet(&session, p, GAME_PLINKO, BET, low_target(), SEED),
        SpinError::InvalidDelegate,
    );
    let expiry = h.slot() + 1_000;
    ok(h.set_delegate(&player, sp, expiry, 2 * BET));
    ok(h.place_bet(&session, p, GAME_PLINKO, BET, low_target(), SEED));
    assert_eq!(h.vault(&p).delegate_spend_left, BET);
    ok(h.settle_bet(p, h.chain.reveal(0)));
    let payout = h.bet(&p).payout;
    assert_eq!(h.vault(&p).delegate_spend_left, BET + payout);

    // Over the allowance.
    expect_err(
        h.place_bet(&session, p, GAME_PLINKO, BET + payout + 1, low_target(), SEED),
        SpinError::DelegateLimitExceeded,
    );
    // Expired.
    h.warp(1_001);
    expect_err(
        h.place_bet(&session, p, GAME_PLINKO, BET, low_target(), SEED),
        SpinError::DelegateExpired,
    );
    // The session key can never withdraw.
    assert!(h.withdraw(&session, 1).is_err());
    ok(h.withdraw(&player, h.vault(&p).balance));
    assert_eq!(h.vault(&p).balance, 0);
}

#[test]
fn rotation_waits_for_open_bets_and_starts_a_new_epoch() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL));
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
    let next = Chain::generate(8, [9u8; 32]);
    expect_err(h.rotate_chain(next.genesis(), 8), SpinError::ChainHasOpenBets);
    ok(h.settle_bet(p, h.chain.reveal(0)));
    ok(h.rotate_chain(next.genesis(), 8));
    let chain = h.chain_state();
    assert_eq!(chain.epoch, 2);
    assert_eq!(chain.index, 0);
    assert_eq!(chain.commitment, next.genesis());
    assert_eq!(chain.cursor, 1, "tickets keep counting across epochs");

    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
    assert_eq!(h.bet(&p).chain_epoch, 2);
    expect_err(h.settle_bet(p, h.chain.reveal(1)), SpinError::ChainBadReveal);
    ok(h.settle_bet(p, next.reveal(0)));
}

#[test]
fn chain_exhaustion_stops_new_bets() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, 5 * SOL));
    let len = h.chain_len as usize;
    for i in 0..len {
        ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
        ok(h.settle_bet(p, h.chain.reveal(i)));
    }
    assert_eq!(h.chain_state().index, h.chain_len);
    expect_err(
        h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED),
        SpinError::ChainExhausted,
    );
    // Rotation is allowed: no open bets.
    let next = Chain::generate(4, [1u8; 32]);
    ok(h.rotate_chain(next.genesis(), 4));
    ok(h.place_bet(&player, p, GAME_PLINKO, BET, low_target(), SEED));
}

#[test]
fn plinko_settlement_stays_within_compute_budget() {
    let mut h = Harness::new(100);
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, SOL));
    let high = plinko::encode_target(16, plinko::RISK_HIGH);
    ok(h.place_bet(&player, p, GAME_PLINKO, BET / 10, high, SEED));
    let meta = ok(h.settle_bet(p, h.chain.reveal(0)));
    println!("plinko settle CU: {}", meta.compute_units_consumed);
    assert!(meta.compute_units_consumed < 60_000);
}
