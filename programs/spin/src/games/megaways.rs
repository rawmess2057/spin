//! Megaways cascading slot — on-chain evaluator.
//!
//! Byte-for-byte mirror of `frontend/app/lib/solana/games/megaways.ts`, which
//! is the specification: same constants, same draw order, same integer math.
//! Only the recording-only fields (grid snapshots per cascade) are dropped;
//! the browser replays those from the same randomness.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::error::SpinError;
use crate::games::{payout, Eval};

pub const REELS: usize = 6;
pub const MIN_ROWS: u8 = 2;
pub const MAX_ROWS: usize = 7;
pub const SYMBOL_COUNT: usize = 12;
pub const WILD: u8 = 0;
pub const SCATTER: u8 = 11;
/// Minimum consecutive reels (from the left) for a way to pay.
pub const MIN_MATCH: u8 = 3;

/// Weight of each reel height 2..7; sums to 100.
const HEIGHT_WEIGHTS: [u16; 6] = [14, 20, 22, 20, 14, 10];
const HEIGHT_WEIGHT_TOTAL: u32 = 100;

/// Symbol weights per reel, [reel][symbol]; every row sums to 1000. Wilds
/// never land on the outer reels.
const SYMBOL_WEIGHT_TOTAL: u32 = 1000;
const OUTER_REEL_WEIGHTS: [u16; SYMBOL_COUNT] =
    [0, 148, 138, 128, 118, 108, 96, 90, 72, 52, 30, 20];
const INNER_REEL_WEIGHTS: [u16; SYMBOL_COUNT] =
    [30, 145, 135, 125, 115, 105, 93, 86, 66, 48, 32, 20];
const SYMBOL_WEIGHTS: [[u16; SYMBOL_COUNT]; REELS] = [
    OUTER_REEL_WEIGHTS,
    INNER_REEL_WEIGHTS,
    INNER_REEL_WEIGHTS,
    INNER_REEL_WEIGHTS,
    INNER_REEL_WEIGHTS,
    OUTER_REEL_WEIGHTS,
];

/// Pay per way in bp of the total bet, [symbol][match_len - 2].
const PAYTABLE: [[u32; 5]; SYMBOL_COUNT] = [
    [0, 0, 0, 0, 0],             // WILD
    [0, 365, 725, 1445, 2895],   // L1
    [0, 435, 910, 1805, 3625],   // L2
    [0, 545, 1090, 2170, 4340],  // L3
    [0, 655, 1270, 2535, 5065],  // L4
    [0, 725, 1445, 2895, 5795],  // L5
    [0, 910, 1805, 3625, 7235],  // L6
    [0, 1445, 2895, 7235, 14475], // H1
    [0, 2170, 3625, 10860, 21720], // H2
    [0, 2895, 5795, 14475, 28960], // H3
    [0, 3625, 7235, 21720, 72390], // H4
    [0, 0, 0, 0, 0],             // SCATTER
];

pub const MAX_CASCADES: u32 = 12;
pub const FS_TRIGGER_SCATTERS: u8 = 4;
pub const FS_BASE: u32 = 12;
pub const FS_PER_EXTRA: u32 = 5;
pub const FS_RETRIGGER_SCATTERS: u8 = 3;
pub const FS_RETRIGGER_SPINS: u32 = 5;
pub const MAX_FREE_SPINS_TOTAL: u32 = 50;
/// Hard cap on the total win: 10,000× the bet, in bp.
pub const MAX_WIN_BP: u64 = 100_000_000;

// ---------------------------------------------------------------------------
// Randomness stream
// ---------------------------------------------------------------------------

/// Expands the 64-byte randomness into a stream of u32s:
/// block i = sha256(seed ‖ u32_le(i)), eight little-endian u32s per block.
pub struct RngStream<'a> {
    seed: &'a [u8; 64],
    block: [u8; 32],
    offset: usize,
    counter: u32,
    pub blocks_used: u32,
}

impl<'a> RngStream<'a> {
    pub fn new(seed: &'a [u8; 64]) -> Self {
        Self {
            seed,
            block: [0u8; 32],
            offset: 32,
            counter: 0,
            blocks_used: 0,
        }
    }

    fn refill(&mut self) {
        self.block = hashv(&[self.seed, &self.counter.to_le_bytes()]).to_bytes();
        self.offset = 0;
        self.counter = self.counter.wrapping_add(1);
        self.blocks_used += 1;
    }

    pub fn next_u32(&mut self) -> u32 {
        if self.offset + 4 > 32 {
            self.refill();
        }
        let o = self.offset;
        let v = u32::from_le_bytes([
            self.block[o],
            self.block[o + 1],
            self.block[o + 2],
            self.block[o + 3],
        ]);
        self.offset += 4;
        v
    }

    pub fn next_below(&mut self, n: u32) -> u32 {
        self.next_u32() % n
    }

    pub fn pick_weighted(&mut self, weights: &[u16], total: u32) -> u8 {
        let mut x = self.next_below(total);
        for (i, &w) in weights.iter().enumerate() {
            if x < w as u32 {
                return i as u8;
            }
            x -= w as u32;
        }
        (weights.len() - 1) as u8
    }
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

/// `cells[reel][row]`, row 0 at the top; only `heights[reel]` rows are live.
#[derive(Clone, Copy)]
struct Grid {
    heights: [u8; REELS],
    cells: [[u8; MAX_ROWS]; REELS],
}

type Marks = [[bool; MAX_ROWS]; REELS];

/// Heights reel 0..5, then symbols reel 0..5 top→bottom.
fn draw_grid(rng: &mut RngStream) -> Grid {
    let mut heights = [0u8; REELS];
    for h in heights.iter_mut() {
        *h = MIN_ROWS + rng.pick_weighted(&HEIGHT_WEIGHTS, HEIGHT_WEIGHT_TOTAL);
    }
    let mut cells = [[0u8; MAX_ROWS]; REELS];
    for r in 0..REELS {
        for row in 0..heights[r] as usize {
            cells[r][row] = rng.pick_weighted(&SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
        }
    }
    Grid { heights, cells }
}

fn count_scatters(grid: &Grid) -> u8 {
    let mut n = 0u8;
    for r in 0..REELS {
        for row in 0..grid.heights[r] as usize {
            if grid.cells[r][row] == SCATTER {
                n += 1;
            }
        }
    }
    n
}

/// Ways evaluation, left to right. Returns the summed pay (bp × ways, before
/// the round multiplier) and the union of winning positions.
fn evaluate_ways(grid: &Grid) -> (u64, Marks, bool) {
    let mut present = [false; SYMBOL_COUNT];
    for row in 0..grid.heights[0] as usize {
        present[grid.cells[0][row] as usize] = true;
    }
    let mut total: u64 = 0;
    let mut removed: Marks = [[false; MAX_ROWS]; REELS];
    let mut any = false;

    for s in 1..SYMBOL_COUNT as u8 {
        if s == SCATTER || !present[s as usize] {
            continue;
        }
        let mut ways: u64 = 1;
        let mut match_len: u8 = 0;
        let mut marks: Marks = [[false; MAX_ROWS]; REELS];
        for r in 0..REELS {
            let mut count: u64 = 0;
            for row in 0..grid.heights[r] as usize {
                let c = grid.cells[r][row];
                if c == s || c == WILD {
                    count += 1;
                    marks[r][row] = true;
                }
            }
            if count == 0 {
                break;
            }
            ways *= count;
            match_len += 1;
        }
        if match_len < MIN_MATCH {
            continue;
        }
        let pay = PAYTABLE[s as usize][(match_len - 2) as usize] as u64 * ways;
        if pay == 0 {
            continue;
        }
        total += pay;
        any = true;
        // Only reels 0..match_len matched; positions marked on later reels
        // were never part of the way (the TS stops pushing at the break).
        for r in 0..match_len as usize {
            for row in 0..MAX_ROWS {
                if marks[r][row] {
                    removed[r][row] = true;
                }
            }
        }
    }
    (total, removed, any)
}

/// Removes the marked cells, drops survivors to the bottom (order kept) and
/// fills the vacated top cells with new draws, reel 0..5, top→bottom.
fn apply_cascade(grid: &Grid, removed: &Marks, rng: &mut RngStream) -> Grid {
    let mut next = *grid;
    for r in 0..REELS {
        let h = grid.heights[r] as usize;
        let mut survivors = [0u8; MAX_ROWS];
        let mut n = 0usize;
        for row in 0..h {
            if !removed[r][row] {
                survivors[n] = grid.cells[r][row];
                n += 1;
            }
        }
        let gap = h - n;
        for i in 0..gap {
            next.cells[r][i] = rng.pick_weighted(&SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
        }
        next.cells[r][gap..h].copy_from_slice(&survivors[..n]);
    }
    next
}

struct Round {
    win_bp: u64,
    scatters: u8,
    multiplier_after: u32,
}

/// One round (base spin or free spin): draw, then tumble until a grid has no
/// wins, MAX_CASCADES is reached, or the win budget is exhausted.
fn play_round(rng: &mut RngStream, free: bool, multiplier_start: u32, budget_bp: u64) -> Round {
    let mut grid = draw_grid(rng);
    let mut multiplier = multiplier_start;
    let mut round_win: u64 = 0;

    let mut step: u32 = 0;
    loop {
        let (pay, removed, any) = evaluate_ways(&grid);
        if !any {
            break;
        }
        round_win += pay * multiplier as u64;
        let budget_hit = round_win >= budget_bp;
        if step >= MAX_CASCADES || budget_hit {
            if free {
                multiplier += 1;
            }
            break;
        }
        grid = apply_cascade(&grid, &removed, rng);
        if free {
            multiplier += 1;
        }
        step += 1;
    }

    Round {
        win_bp: round_win,
        scatters: count_scatters(&grid),
        multiplier_after: multiplier,
    }
}

/// Total win in bp of the bet (clamped to MAX_WIN_BP) plus RNG blocks used.
pub fn total_win_bp(randomness: &[u8; 64]) -> (u64, u32) {
    let mut rng = RngStream::new(randomness);

    let base = play_round(&mut rng, false, 1, MAX_WIN_BP);
    let mut total = base.win_bp;
    let mut capped = total >= MAX_WIN_BP;

    let mut awarded: u32 = 0;
    if base.scatters >= FS_TRIGGER_SCATTERS {
        awarded = FS_BASE + (base.scatters - FS_TRIGGER_SCATTERS) as u32 * FS_PER_EXTRA;
    }
    let mut total_free_spins = awarded.min(MAX_FREE_SPINS_TOTAL);

    let mut multiplier: u32 = 1;
    let mut i: u32 = 0;
    while i < total_free_spins && !capped {
        let round = play_round(&mut rng, true, multiplier, MAX_WIN_BP.saturating_sub(total));
        total += round.win_bp;
        multiplier = round.multiplier_after;
        if round.scatters >= FS_RETRIGGER_SCATTERS {
            total_free_spins = (total_free_spins + FS_RETRIGGER_SPINS).min(MAX_FREE_SPINS_TOTAL);
        }
        if total >= MAX_WIN_BP {
            capped = true;
        }
        i += 1;
    }

    (total.min(MAX_WIN_BP), rng.blocks_used)
}

pub fn validate_target(target: u64) -> Result<()> {
    // Reserved for a future bonus buy; v1 accepts only 0.
    require!(target == 0, SpinError::InvalidTarget);
    Ok(())
}

pub fn max_multiplier_bp(target: u64) -> Result<u64> {
    validate_target(target)?;
    Ok(MAX_WIN_BP)
}

pub fn evaluate(randomness: &[u8; 64], amount: u64, target: u64) -> Result<Eval> {
    validate_target(target)?;
    let (total, _) = total_win_bp(randomness);
    Ok(Eval {
        roll: total,
        multiplier_bp: total,
        payout: payout(amount, total)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weights_sum_to_their_totals() {
        assert_eq!(HEIGHT_WEIGHTS.iter().map(|&w| w as u32).sum::<u32>(), HEIGHT_WEIGHT_TOTAL);
        for row in SYMBOL_WEIGHTS.iter() {
            assert_eq!(row.iter().map(|&w| w as u32).sum::<u32>(), SYMBOL_WEIGHT_TOTAL);
        }
        assert_eq!(SYMBOL_WEIGHTS[0][WILD as usize], 0);
        assert_eq!(SYMBOL_WEIGHTS[5][WILD as usize], 0);
    }

    #[test]
    fn rng_stream_matches_spec_shape() {
        let seed = [7u8; 64];
        let mut rng = RngStream::new(&seed);
        // Eight u32s per block.
        for _ in 0..8 {
            rng.next_u32();
        }
        assert_eq!(rng.blocks_used, 1);
        rng.next_u32();
        assert_eq!(rng.blocks_used, 2);
        // Deterministic.
        let mut a = RngStream::new(&seed);
        let mut b = RngStream::new(&seed);
        for _ in 0..100 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn outcome_is_bounded_and_deterministic() {
        for i in 0..200u8 {
            let mut seed = [0u8; 64];
            seed[0] = i;
            seed[1] = i.wrapping_mul(31);
            let (a, blocks) = total_win_bp(&seed);
            let (b, _) = total_win_bp(&seed);
            assert_eq!(a, b);
            assert!(a <= MAX_WIN_BP);
            assert!(blocks >= 1);
        }
        assert!(validate_target(1).is_err());
        assert_eq!(max_multiplier_bp(0).unwrap(), MAX_WIN_BP);
    }
}
