//! Game registry: every game is a pure function of 64 bytes of randomness, a
//! stake and a `target` (game-specific options packed by the client). The
//! same evaluators exist byte-for-byte in `frontend/app/lib/solana/games/`,
//! which is how the browser can replay and verify every settlement.

use anchor_lang::prelude::*;
use solana_sha256_hasher::{hash, hashv};

use crate::constants::*;
use crate::error::SpinError;

pub mod megaways;
pub mod plinko;
pub mod wheel;

/// Result of evaluating one bet.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Eval {
    /// Game-specific outcome summary (Plinko bucket, slot total bp, ...).
    pub roll: u64,
    /// Total multiplier in basis points (10,000 = 1×).
    pub multiplier_bp: u64,
    /// Payout in lamports.
    pub payout: u64,
}

/// Payout in lamports given a bet amount and a multiplier in basis points
/// (truncating).
pub fn payout(amount: u64, multiplier_bp: u64) -> Result<u64> {
    let p = (amount as u128)
        .checked_mul(multiplier_bp as u128)
        .ok_or(SpinError::ArithmeticOverflow)?
        / 10_000;
    u64::try_from(p).map_err(|_| SpinError::ArithmeticOverflow.into())
}

/// Rejects a `target` the game cannot play, at bet time, so a bet can never
/// be placed on options the settlement would have to guess at.
pub fn validate_target(game_id: u8, target: u64) -> Result<()> {
    match game_id {
        GAME_PLINKO => plinko::validate_target(target),
        GAME_MEGAWAYS => megaways::validate_target(target),
        GAME_WHEEL => wheel::validate_target(target),
        _ => Err(SpinError::UnknownGame.into()),
    }
}

/// A target every game accepts; used to sanity-check a game id when it is
/// registered.
pub fn default_target(game_id: u8) -> Result<u64> {
    match game_id {
        GAME_PLINKO => Ok(plinko::encode_target(plinko::MIN_ROWS, plinko::RISK_LOW)),
        GAME_MEGAWAYS => Ok(0),
        GAME_WHEEL => Ok(wheel::RISK_LOW),
        _ => Err(SpinError::UnknownGame.into()),
    }
}

/// The largest multiplier the game can pay for this `target`; reserved
/// against the bankroll while the bet is open. Must come from the same
/// source as `evaluate` so the two can never drift apart.
pub fn max_multiplier_bp(game_id: u8, target: u64) -> Result<u64> {
    match game_id {
        GAME_PLINKO => plinko::max_multiplier_bp(target),
        GAME_MEGAWAYS => megaways::max_multiplier_bp(target),
        GAME_WHEEL => wheel::max_multiplier_bp(target),
        _ => Err(SpinError::UnknownGame.into()),
    }
}

pub fn evaluate(game_id: u8, randomness: &[u8; 64], amount: u64, target: u64) -> Result<Eval> {
    match game_id {
        GAME_PLINKO => plinko::evaluate(randomness, amount, target),
        GAME_MEGAWAYS => megaways::evaluate(randomness, amount, target),
        GAME_WHEEL => wheel::evaluate(randomness, amount, target),
        _ => Err(SpinError::UnknownGame.into()),
    }
}

/// The 64 bytes of randomness for a bet:
/// `r1 = sha256(reveal ‖ client_seed ‖ player ‖ nonce_le)`, `r2 = sha256(r1)`,
/// randomness = `r1 ‖ r2`. The reveal is fixed by the house before the bet,
/// the client seed and nonce by the player when placing it, and neither side
/// learns the other's half before committing.
pub fn derive_randomness(
    reveal: &[u8; 32],
    client_seed: &[u8; 32],
    player: &Pubkey,
    nonce: u64,
) -> [u8; 64] {
    let r1 = hashv(&[reveal, client_seed, player.as_ref(), &nonce.to_le_bytes()]).to_bytes();
    let r2 = hash(&r1).to_bytes();
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&r1);
    out[32..].copy_from_slice(&r2);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_scales_with_bet() {
        assert_eq!(payout(1_000_000, 0).unwrap(), 0);
        assert_eq!(payout(1_000_000, 10_000).unwrap(), 1_000_000);
        assert_eq!(payout(1_000_000, 970_297).unwrap(), 97_029_700);
        assert_eq!(payout(123, 970_297).unwrap(), 11_934); // truncation
        assert!(payout(u64::MAX, u64::MAX).is_err());
    }

    #[test]
    fn registry_rejects_unknown_games() {
        assert!(validate_target(0, 0).is_err());
        assert!(max_multiplier_bp(200, 0).is_err());
        assert!(evaluate(1, &[0u8; 64], 1, 0).is_err());
    }

    #[test]
    fn randomness_is_deterministic_and_binds_every_input() {
        let reveal = [1u8; 32];
        let seed = [2u8; 32];
        let player = Pubkey::new_from_array([3u8; 32]);
        let a = derive_randomness(&reveal, &seed, &player, 7);
        assert_eq!(a, derive_randomness(&reveal, &seed, &player, 7));
        assert_ne!(a, derive_randomness(&[9u8; 32], &seed, &player, 7));
        assert_ne!(a, derive_randomness(&reveal, &[9u8; 32], &player, 7));
        assert_ne!(a, derive_randomness(&reveal, &seed, &Pubkey::default(), 7));
        assert_ne!(a, derive_randomness(&reveal, &seed, &player, 8));
        assert_eq!(&a[32..], &hash(&a[..32]).to_bytes());
    }
}
