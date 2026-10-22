//! Dragon's Vault — 5×3 Hold & Spin slot. Byte-for-byte mirror of
//! `frontend/app/lib/solana/games/hold-spin.ts` (the specification); only the
//! recording-only fields are dropped.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::error::SpinError;
use crate::games::{payout, Eval};

pub const REELS: usize = 5;
pub const ROWS: usize = 3;
pub const CELLS: u8 = (REELS * ROWS) as u8;
pub const SYMBOL_COUNT: usize = 10;
pub const WILD: u8 = 0;
pub const COIN: u8 = 9;

const SYMBOL_WEIGHT_TOTAL: u32 = 1000;
const OUTER: [u16; SYMBOL_COUNT] = [0, 135, 135, 125, 120, 110, 100, 80, 65, 130];
const INNER: [u16; SYMBOL_COUNT] = [40, 135, 130, 125, 115, 105, 95, 70, 55, 130];
const SYMBOL_WEIGHTS: [[u16; SYMBOL_COUNT]; REELS] = [OUTER, INNER, INNER, INNER, OUTER];

/// Coin values in bp of the total bet; the last two are MINOR and MAJOR.
const COIN_VALUE_BP: [u64; 10] = [
    10_000, 20_000, 30_000, 50_000, 100_000, 150_000, 250_000, 500_000, 1_000_000, 2_500_000,
];
const COIN_VALUE_WEIGHTS: [u16; 10] = [480, 250, 130, 70, 35, 18, 9, 5, 2, 1];
const COIN_VALUE_WEIGHT_TOTAL: u32 = 1000;
/// GRAND: all 15 cells hold a coin; paid on top.
pub const GRAND_BP: u64 = 10_000_000;

pub const BONUS_TRIGGER_COINS: u8 = 6;
pub const RESPINS: u32 = 3;
pub const MAX_RESPINS_TOTAL: u32 = 40;
const BONUS_COIN_WEIGHT: u32 = 65;
const BONUS_WEIGHT_TOTAL: u32 = 1000;
/// Hard cap on the total win: 5,000× the bet, in bp.
pub const MAX_WIN_BP: u64 = 50_000_000;

/// Line pays in bp of the total bet, [symbol][count - 3].
const LINE_PAYS: [[u32; 3]; SYMBOL_COUNT] = [
    [0, 0, 0], // WILD
    [7800, 19600, 58800], // TEN
    [7800, 19600, 58800], // JACK
    [9800, 22900, 78400], // QUEEN
    [9800, 22900, 78400], // KING
    [11750, 30000, 98000], // ACE
    [19600, 58800, 195950], // LANTERN
    [26100, 98000, 313550], // TIGER
    [39150, 156750, 587900], // DRAGON
    [0, 0, 0], // COIN
];

/// 20 fixed paylines: row per reel.
const PAYLINES: [[u8; 5]; 20] = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 0, 2, 0, 0],
    [2, 2, 0, 2, 2],
    [0, 2, 0, 2, 0],
];

/// sha256 counter-mode stream, identical to Megaways'.
struct Rng<'a> {
    seed: &'a [u8; 64],
    block: [u8; 32],
    offset: usize,
    counter: u32,
    blocks_used: u32,
}

impl<'a> Rng<'a> {
    fn new(seed: &'a [u8; 64]) -> Self {
        Self { seed, block: [0u8; 32], offset: 32, counter: 0, blocks_used: 0 }
    }
    fn next_u32(&mut self) -> u32 {
        if self.offset + 4 > 32 {
            self.block = hashv(&[self.seed, &self.counter.to_le_bytes()]).to_bytes();
            self.offset = 0;
            self.counter = self.counter.wrapping_add(1);
            self.blocks_used += 1;
        }
        let o = self.offset;
        self.offset += 4;
        u32::from_le_bytes([self.block[o], self.block[o + 1], self.block[o + 2], self.block[o + 3]])
    }
    fn next_below(&mut self, n: u32) -> u32 {
        self.next_u32() % n
    }
    fn pick_weighted(&mut self, weights: &[u16], total: u32) -> u8 {
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

/// `cells[reel][row]`; `coin[reel][row]` is a value index or `NONE`.
const NONE: u8 = u8::MAX;

struct Base {
    cells: [[u8; ROWS]; REELS],
    coin: [[u8; ROWS]; REELS],
}

fn draw_base(rng: &mut Rng) -> Base {
    let mut cells = [[0u8; ROWS]; REELS];
    let mut coin = [[NONE; ROWS]; REELS];
    for r in 0..REELS {
        for row in 0..ROWS {
            let s = rng.pick_weighted(&SYMBOL_WEIGHTS[r], SYMBOL_WEIGHT_TOTAL);
            cells[r][row] = s;
            if s == COIN {
                coin[r][row] = rng.pick_weighted(&COIN_VALUE_WEIGHTS, COIN_VALUE_WEIGHT_TOTAL);
            }
        }
    }
    Base { cells, coin }
}

fn lines_win_bp(base: &Base) -> u64 {
    let mut total: u64 = 0;
    for line in PAYLINES.iter() {
        let first = base.cells[0][line[0] as usize];
        if first == COIN {
            continue;
        }
        let mut count = 0usize;
        for r in 0..REELS {
            let c = base.cells[r][line[r] as usize];
            if c == first || c == WILD {
                count += 1;
            } else {
                break;
            }
        }
        if count >= 3 {
            total += LINE_PAYS[first as usize][count - 3] as u64;
        }
    }
    total
}

fn count_coins(base: &Base) -> u8 {
    let mut n = 0u8;
    for r in 0..REELS {
        for row in 0..ROWS {
            if base.cells[r][row] == COIN {
                n += 1;
            }
        }
    }
    n
}

fn play_bonus(rng: &mut Rng, base: &Base) -> u64 {
    let mut coins = base.coin;
    let mut coin_count = count_coins(base);
    let mut respins_left = RESPINS;
    let mut played: u32 = 0;

    while respins_left > 0 && coin_count < CELLS && played < MAX_RESPINS_TOTAL {
        let mut landed = false;
        for r in 0..REELS {
            for row in 0..ROWS {
                if coins[r][row] != NONE {
                    continue;
                }
                if rng.next_below(BONUS_WEIGHT_TOTAL) < BONUS_COIN_WEIGHT {
                    coins[r][row] = rng.pick_weighted(&COIN_VALUE_WEIGHTS, COIN_VALUE_WEIGHT_TOTAL);
                    coin_count += 1;
                    landed = true;
                }
            }
        }
        played += 1;
        respins_left = if landed { RESPINS } else { respins_left - 1 };
    }

    let mut win: u64 = 0;
    for r in 0..REELS {
        for row in 0..ROWS {
            if coins[r][row] != NONE {
                win += COIN_VALUE_BP[coins[r][row] as usize];
            }
        }
    }
    if coin_count == CELLS {
        win += GRAND_BP;
    }
    win
}

/// Total win in bp (clamped) and RNG blocks used.
pub fn total_win_bp(randomness: &[u8; 64]) -> (u64, u32) {
    let mut rng = Rng::new(randomness);
    let base = draw_base(&mut rng);
    let mut total = lines_win_bp(&base);
    if count_coins(&base) >= BONUS_TRIGGER_COINS {
        total += play_bonus(&mut rng, &base);
    }
    (total.min(MAX_WIN_BP), rng.blocks_used)
}

pub fn validate_target(target: u64) -> Result<()> {
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
    Ok(Eval { roll: total, multiplier_bp: total, payout: payout(amount, total)? })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weights_sum_and_shape() {
        for row in SYMBOL_WEIGHTS.iter() {
            assert_eq!(row.iter().map(|&w| w as u32).sum::<u32>(), SYMBOL_WEIGHT_TOTAL);
        }
        assert_eq!(COIN_VALUE_WEIGHTS.iter().map(|&w| w as u32).sum::<u32>(), COIN_VALUE_WEIGHT_TOTAL);
        assert_eq!(SYMBOL_WEIGHTS[0][WILD as usize], 0);
        assert_eq!(SYMBOL_WEIGHTS[4][WILD as usize], 0);
        assert_eq!(PAYLINES.len(), 20);
    }

    #[test]
    fn bounded_and_deterministic() {
        for i in 0..300u16 {
            let mut seed = [0u8; 64];
            seed[0] = (i & 0xff) as u8;
            seed[1] = (i >> 8) as u8;
            let (a, blocks) = total_win_bp(&seed);
            assert_eq!(a, total_win_bp(&seed).0);
            assert!(a <= MAX_WIN_BP);
            assert!(blocks >= 1 && blocks <= 1 + (MAX_RESPINS_TOTAL * 15 * 2) / 8 + 1);
        }
        assert!(validate_target(1).is_err());
    }
}
