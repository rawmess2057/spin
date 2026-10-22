//! Megaways settles inside the compute budget, even for the heaviest outcome
//! we can find for a given reveal.

mod common;

use common::*;
use spin::constants::*;
use spin::games;
use spin::state::BetStatus;

#[test]
fn megaways_heaviest_outcome_settles_under_budget() {
    let mut h = Harness::new(2_000);
    ok(h.init_game(GAME_MEGAWAYS, DIAMOND, 10 * DIAMOND));
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, 5 * SOL));

    // The randomness is sha256(reveal ‖ client_seed ‖ player ‖ nonce). The
    // reveal and nonce are known in advance here, so search client seeds for
    // the outcome that burns the most RNG blocks (long free-spin rounds).
    let reveal = h.chain.reveal(0);
    let mut best_seed = [0u8; 32];
    let mut best_blocks = 0u32;
    let mut best_total = 0u64;
    for i in 0..30_000u32 {
        let mut seed = [0u8; 32];
        seed[..4].copy_from_slice(&i.to_le_bytes());
        let randomness = games::derive_randomness(&reveal, &seed, &p, 1);
        let (total, blocks) = games::megaways::total_win_bp(&randomness);
        if blocks > best_blocks {
            best_blocks = blocks;
            best_total = total;
            best_seed = seed;
        }
    }
    println!("heaviest of 30k seeds: {best_blocks} rng blocks, {best_total} bp");
    assert!(best_blocks > 20, "search should find a free-spin outcome");

    ok(h.place_bet(&player, p, GAME_MEGAWAYS, DIAMOND, 0, best_seed));
    // Without a budget request the default 200k CU is not enough for a long
    // free-spin outcome; the crank asks for 1.4M, so the test does too.
    let meta = ok(h.settle_bet_with_cu(p, reveal, Some(1_400_000)));
    println!("megaways settle CU: {}", meta.compute_units_consumed);
    assert!(
        meta.compute_units_consumed < 1_300_000,
        "settle used {} CU",
        meta.compute_units_consumed
    );

    let bet = h.bet(&p);
    assert_eq!(bet.status, BetStatus::Settled);
    assert_eq!(bet.roll, best_total);
    assert_eq!(bet.payout, games::payout(DIAMOND, best_total).unwrap());
}

#[test]
fn megaways_rejects_nonzero_target_and_reserves_max_win() {
    let mut h = Harness::new(2_000);
    ok(h.init_game(GAME_MEGAWAYS, DIAMOND, 100 * DIAMOND));
    let player = h.new_player(10);
    let p = pk(&player.pubkey_addr());
    ok(h.deposit(&player, 5 * SOL));
    expect_err(
        h.place_bet(&player, p, GAME_MEGAWAYS, DIAMOND, 1, [1u8; 32]),
        spin::error::SpinError::InvalidTarget,
    );
    ok(h.place_bet(&player, p, GAME_MEGAWAYS, DIAMOND, 0, [1u8; 32]));
    // 10,000× the stake is held against the bankroll while the bet is open.
    assert_eq!(h.bet(&p).reserved, DIAMOND * 10_000);
    ok(h.settle_bet(p, h.chain.reveal(0)));
    assert_eq!(h.ledger().reserved, 0);
}
