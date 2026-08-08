use anchor_lang::prelude::*;

#[error_code]
pub enum SpinError {
    #[msg("House is paused")]
    HousePaused,
    #[msg("Only the house authority may perform this action")]
    NotAuthority,
    #[msg("Bet below minimum")]
    BetBelowMinimum,
    #[msg("Bet above maximum")]
    BetAboveMaximum,
    #[msg("Bet exceeds the house bankroll limit (1% of treasury)")]
    BetExceedsBankrollLimit,
    #[msg("Treasury balance is too low")]
    TreasuryBalanceTooLow,
    #[msg("Target out of range")]
    TargetOutOfRange,
    #[msg("Unknown game")]
    UnknownGame,
    #[msg("Spin is already resolved")]
    AlreadyResolved,
    #[msg("Spin is not yet resolvable")]
    SpinNotResolvable,
    #[msg("Randomness request is not fulfilled yet")]
    RandomnessPending,
    #[msg("Pending account does not match the randomness request")]
    PendingMismatch,
    #[msg("Client PDA does not match the registered VRF client")]
    ClientMismatch,
    #[msg("Treasury account does not match the network configuration")]
    TreasuryMismatch,
    #[msg("Request account does not match the VRF request PDA")]
    RequestMismatch,
    #[msg("Network state account is invalid")]
    NetworkStateMismatch,
    #[msg("Payout calculation overflow")]
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
}
