//! The TypeScript evaluators are the specification; these fixtures were
//! produced by `frontend/scripts/make-fixtures.ts` and the Rust evaluators
//! must agree on every one of them.

use spin::constants::*;
use spin::games;

fn hex64(s: &str) -> [u8; 64] {
    let mut out = [0u8; 64];
    for i in 0..64 {
        out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
    }
    out
}

fn lines(name: &str) -> Vec<Vec<String>> {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("missing {path}; run `npx tsx scripts/make-fixtures.ts` in frontend/"))
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.split_whitespace().map(String::from).collect())
        .collect()
}

#[test]
fn plinko_matches_typescript_fixtures() {
    let rows = lines("plinko.txt");
    assert!(rows.len() >= 81);
    for f in rows {
        let seed = hex64(&f[0]);
        let target: u64 = f[1].parse().unwrap();
        let bucket: u64 = f[2].parse().unwrap();
        let mult: u64 = f[3].parse().unwrap();
        let payout: u64 = f[4].parse().unwrap();
        let e = games::evaluate(GAME_PLINKO, &seed, 1_000_000_000, target).unwrap();
        assert_eq!(e.roll, bucket, "bucket for {}", f[0]);
        assert_eq!(e.multiplier_bp, mult, "multiplier for {}", f[0]);
        assert_eq!(e.payout, payout, "payout for {}", f[0]);
    }
}

#[test]
fn megaways_matches_typescript_fixtures() {
    let rows = lines("megaways.txt");
    assert!(rows.len() >= 66);
    let mut max_blocks = 0;
    for f in rows {
        let seed = hex64(&f[0]);
        let total: u64 = f[1].parse().unwrap();
        let blocks: u32 = f[2].parse().unwrap();
        let payout: u64 = f[4].parse().unwrap();
        let (got_total, got_blocks) = games::megaways::total_win_bp(&seed);
        assert_eq!(got_total, total, "total win for {}", f[0]);
        assert_eq!(got_blocks, blocks, "rng blocks for {}", f[0]);
        let e = games::evaluate(GAME_MEGAWAYS, &seed, 1_000_000_000, 0).unwrap();
        assert_eq!(e.payout, payout, "payout for {}", f[0]);
        max_blocks = max_blocks.max(blocks);
    }
    println!("heaviest fixture: {max_blocks} rng blocks");
}

#[test]
fn wheel_matches_typescript_fixtures() {
    let rows = lines("wheel.txt");
    assert_eq!(rows.len(), 60);
    for f in rows {
        let seed = hex64(&f[0]);
        let target: u64 = f[1].parse().unwrap();
        let segment: u64 = f[2].parse().unwrap();
        let mult: u64 = f[3].parse().unwrap();
        let payout: u64 = f[4].parse().unwrap();
        let e = games::evaluate(GAME_WHEEL, &seed, 1_000_000_000, target).unwrap();
        assert_eq!(e.roll, segment, "segment for {}", f[0]);
        assert_eq!(e.multiplier_bp, mult, "multiplier for {}", f[0]);
        assert_eq!(e.payout, payout, "payout for {}", f[0]);
    }
}

#[test]
fn hold_spin_matches_typescript_fixtures() {
    let rows = lines("holdspin.txt");
    assert!(rows.len() >= 66);
    for f in rows {
        let seed = hex64(&f[0]);
        let total: u64 = f[1].parse().unwrap();
        let blocks: u32 = f[2].parse().unwrap();
        let payout: u64 = f[4].parse().unwrap();
        let (got_total, got_blocks) = games::hold_spin::total_win_bp(&seed);
        assert_eq!(got_total, total, "total win for {}", f[0]);
        assert_eq!(got_blocks, blocks, "rng blocks for {}", f[0]);
        let e = games::evaluate(GAME_HOLD_SPIN, &seed, 1_000_000_000, 0).unwrap();
        assert_eq!(e.payout, payout, "payout for {}", f[0]);
    }
}
