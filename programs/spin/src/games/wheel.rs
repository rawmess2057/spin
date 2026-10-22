//! Spin Wheel: 24 equally likely segments; the risk variant decides how the
//! 97% RTP is spread over them. Mirror of
//! `frontend/app/lib/solana/games/wheel.ts`.

use anchor_lang::prelude::*;

use crate::error::SpinError;
use crate::games::{payout, Eval};

pub const SEGMENTS: u32 = 24;
pub const RISK_LOW: u64 = 0;
pub const RISK_MED: u64 = 1;
pub const RISK_HIGH: u64 = 2;

/// Segment multipliers in 0.01×, clockwise from the pointer. Σ = 2328 for
/// every variant → RTP 2328 / 2400 = 97%.
#[rustfmt::skip]
const TABLES_0_01: [[u32; 24]; 3] = [
    // LOW: 9×0, 7×1.2, 6×1.48, 2×3
    [120, 0, 148, 120, 0, 300, 120, 0, 148, 120, 0, 148, 120, 0, 148, 0, 120, 0, 300, 148, 0, 120, 0, 148],
    // MED: 16×0, 3×1.2, 2×2, 2×3, 1×9.68
    [0, 120, 0, 0, 200, 0, 0, 300, 0, 0, 120, 0, 968, 0, 0, 200, 0, 0, 120, 0, 0, 300, 0, 0],
    // HIGH: 22×0, 1×3, 1×20.28
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2028, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300],
];

pub fn validate_target(target: u64) -> Result<()> {
    require!(target <= RISK_HIGH, SpinError::InvalidTarget);
    Ok(())
}

pub fn multiplier_bp(risk: u64, segment: u32) -> u64 {
    if risk > RISK_HIGH || segment >= SEGMENTS {
        return 0;
    }
    TABLES_0_01[risk as usize][segment as usize] as u64 * 100
}

pub fn max_multiplier_bp(target: u64) -> Result<u64> {
    validate_target(target)?;
    Ok(*TABLES_0_01[target as usize].iter().max().unwrap() as u64 * 100)
}

/// First four bytes LE modulo 24 pick the segment.
pub fn evaluate(randomness: &[u8; 64], amount: u64, target: u64) -> Result<Eval> {
    validate_target(target)?;
    let v = u32::from_le_bytes([randomness[0], randomness[1], randomness[2], randomness[3]]);
    let segment = v % SEGMENTS;
    let multiplier_bp = multiplier_bp(target, segment);
    Ok(Eval {
        roll: segment as u64,
        multiplier_bp,
        payout: payout(amount, multiplier_bp)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_variant_pays_97_percent() {
        for t in TABLES_0_01.iter() {
            assert_eq!(t.iter().sum::<u32>(), 2328);
        }
        assert_eq!(max_multiplier_bp(RISK_LOW).unwrap(), 30_000);
        assert_eq!(max_multiplier_bp(RISK_MED).unwrap(), 96_800);
        assert_eq!(max_multiplier_bp(RISK_HIGH).unwrap(), 202_800);
        assert!(validate_target(3).is_err());
    }

    #[test]
    fn segment_from_first_four_bytes() {
        let mut r = [0u8; 64];
        let e = evaluate(&r, 1_000_000, RISK_LOW).unwrap();
        assert_eq!(e.roll, 0);
        assert_eq!(e.payout, 1_200_000);
        r[0] = 11; // segment 11 on HIGH = 20.28×
        let e = evaluate(&r, 1_000_000, RISK_HIGH).unwrap();
        assert_eq!(e.roll, 11);
        assert_eq!(e.payout, 20_280_000);
        r[0] = 24 + 5; // wraps to 5
        assert_eq!(evaluate(&r, 1, RISK_LOW).unwrap().roll, 5);
    }
}
