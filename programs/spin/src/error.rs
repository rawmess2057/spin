use anchor_lang::prelude::*;

#[error_code]
pub enum SpinError {
    #[msg("House is paused")]
    HousePaused,
    #[msg("This game is paused")]
    GamePaused,
    #[msg("Only the house authority may perform this action")]
    NotAuthority,
    #[msg("Bet below minimum")]
    BetBelowMinimum,
    #[msg("Bet above maximum")]
    BetAboveMaximum,
    #[msg("The bet's maximum payout exceeds what the bankroll can cover")]
    MaxPayoutExceedsBankroll,
    #[msg("Treasury balance is too low")]
    TreasuryBalanceTooLow,
    #[msg("Target out of range for this game")]
    InvalidTarget,
    #[msg("Unknown game")]
    UnknownGame,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid player")]
    InvalidPlayer,
    #[msg("Signer is not the player or their authorized delegate")]
    InvalidDelegate,
    #[msg("Delegate authorization has expired")]
    DelegateExpired,
    #[msg("Bet exceeds the delegate's remaining spend limit")]
    DelegateLimitExceeded,
    #[msg("Insufficient credit balance")]
    InsufficientCredits,
    #[msg("Withdrawal would leave the treasury unable to cover player credits")]
    TreasuryInsolvent,
    #[msg("The reveal chain is not active")]
    ChainInactive,
    #[msg("The reveal chain is exhausted; the house must rotate a new chain")]
    ChainExhausted,
    #[msg("Chain length is out of range")]
    ChainTooLong,
    #[msg("The chain still has open bets; settle or cancel them before rotating")]
    ChainHasOpenBets,
    #[msg("Reveal is not the preimage of the current chain commitment")]
    ChainBadReveal,
    #[msg("Bet was placed under a previous chain epoch")]
    ChainEpochMismatch,
    #[msg("Player already has an open bet; wait for it to settle")]
    BetAlreadyOpen,
    #[msg("Bet is not open")]
    BetNotOpen,
    #[msg("Bet is not at the head of the settlement queue")]
    BetNotHead,
    #[msg("Bet has not timed out yet")]
    BetNotTimedOut,
}
