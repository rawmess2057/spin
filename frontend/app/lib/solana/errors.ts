import {
  SPIN_ERROR__ARITHMETIC_OVERFLOW,
  SPIN_ERROR__BET_ABOVE_MAXIMUM,
  SPIN_ERROR__BET_ALREADY_OPEN,
  SPIN_ERROR__BET_BELOW_MINIMUM,
  SPIN_ERROR__BET_NOT_HEAD,
  SPIN_ERROR__BET_NOT_OPEN,
  SPIN_ERROR__BET_NOT_TIMED_OUT,
  SPIN_ERROR__CHAIN_BAD_REVEAL,
  SPIN_ERROR__CHAIN_EPOCH_MISMATCH,
  SPIN_ERROR__CHAIN_EXHAUSTED,
  SPIN_ERROR__CHAIN_HAS_OPEN_BETS,
  SPIN_ERROR__CHAIN_INACTIVE,
  SPIN_ERROR__CHAIN_TOO_LONG,
  SPIN_ERROR__DELEGATE_EXPIRED,
  SPIN_ERROR__DELEGATE_LIMIT_EXCEEDED,
  SPIN_ERROR__GAME_PAUSED,
  SPIN_ERROR__HOUSE_PAUSED,
  SPIN_ERROR__INSUFFICIENT_CREDITS,
  SPIN_ERROR__INVALID_DELEGATE,
  SPIN_ERROR__INVALID_PLAYER,
  SPIN_ERROR__INVALID_TARGET,
  SPIN_ERROR__MAX_PAYOUT_EXCEEDS_BANKROLL,
  SPIN_ERROR__NOT_AUTHORITY,
  SPIN_ERROR__TREASURY_BALANCE_TOO_LOW,
  SPIN_ERROR__TREASURY_INSOLVENT,
  SPIN_ERROR__UNKNOWN_GAME,
} from "./generated/spin";

// Codama's own getSpinErrorMessage() is stripped in production builds (a
// bundle-size tradeoff), so this app keeps its own user-facing copy — still
// keyed off the generated numeric codes rather than hardcoded literals, so
// it can't silently drift from the IDL.
const SPIN_ERROR_MESSAGES: Record<number, string> = {
  [SPIN_ERROR__HOUSE_PAUSED]: "The house is paused right now.",
  [SPIN_ERROR__GAME_PAUSED]: "This game is paused right now.",
  [SPIN_ERROR__NOT_AUTHORITY]:
    "Only the house authority may perform this action.",
  [SPIN_ERROR__BET_BELOW_MINIMUM]: "Bet is below the minimum.",
  [SPIN_ERROR__BET_ABOVE_MAXIMUM]: "Bet is above the maximum.",
  [SPIN_ERROR__MAX_PAYOUT_EXCEEDS_BANKROLL]:
    "That bet could win more than the house can cover — try a smaller bet.",
  [SPIN_ERROR__TREASURY_BALANCE_TOO_LOW]: "Treasury balance is too low.",
  [SPIN_ERROR__INVALID_TARGET]: "Those game options aren't valid.",
  [SPIN_ERROR__UNKNOWN_GAME]: "Unknown game.",
  [SPIN_ERROR__ARITHMETIC_OVERFLOW]: "Payout calculation overflow.",
  [SPIN_ERROR__INVALID_PLAYER]: "Invalid player.",
  [SPIN_ERROR__INVALID_DELEGATE]:
    "This session key is not authorized to bet for you.",
  [SPIN_ERROR__DELEGATE_EXPIRED]: "This session key has expired.",
  [SPIN_ERROR__DELEGATE_LIMIT_EXCEEDED]:
    "This session key's spending allowance is used up.",
  [SPIN_ERROR__INSUFFICIENT_CREDITS]: "Not enough chips — buy some to play.",
  [SPIN_ERROR__TREASURY_INSOLVENT]:
    "The house can't release that much right now.",
  [SPIN_ERROR__CHAIN_INACTIVE]: "The house isn't accepting bets right now.",
  [SPIN_ERROR__CHAIN_EXHAUSTED]:
    "The house's reveal chain is exhausted — it is rotating a new one.",
  [SPIN_ERROR__CHAIN_TOO_LONG]: "Chain length is out of range.",
  [SPIN_ERROR__CHAIN_HAS_OPEN_BETS]:
    "The chain still has open bets; they must settle first.",
  [SPIN_ERROR__CHAIN_BAD_REVEAL]: "That reveal doesn't match the chain.",
  [SPIN_ERROR__CHAIN_EPOCH_MISMATCH]:
    "This bet belongs to an earlier chain and can only be refunded.",
  [SPIN_ERROR__BET_ALREADY_OPEN]: "You already have a bet waiting to settle.",
  [SPIN_ERROR__BET_NOT_OPEN]: "This bet is already settled.",
  [SPIN_ERROR__BET_NOT_HEAD]: "An earlier bet must settle first.",
  [SPIN_ERROR__BET_NOT_TIMED_OUT]:
    "The house still has time to settle this bet.",
};

/**
 * Anchor framework error codes (as opposed to our program's own 6000-range
 * codes). Only the codes actually reachable from this app are listed.
 */
const ANCHOR_ERROR_MESSAGES: Record<number, string> = {
  2006: "An account address did not match its expected derivation.",
  3012: "A required game account has not been created on this cluster yet.",
};

function deepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;
  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) deepest = current.message;
  }
  return deepest;
}

/**
 * Pulls a program error code out of any of the shapes Kit/RPC produce.
 * Exported so callers can branch on specific codes.
 */
export function getProgramErrorCode(err: unknown): number | null {
  const message = deepestMessage(err);
  const match =
    /[Cc]ustom program error: (0x[0-9a-fA-F]+)/.exec(message) ??
    /[Cc]ustom program error: #?(\d+)/.exec(message) ??
    /"Custom":\s*"?(\d+)"?/.exec(message);
  if (match) {
    return match[1].startsWith("0x")
      ? parseInt(match[1], 16)
      : parseInt(match[1], 10);
  }
  // Kit's SolanaError can carry the code in structured context instead of
  // the message; walk the cause chain looking for it.
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 10; depth++) {
    const context = (current as { context?: { code?: unknown } }).context;
    if (context && typeof context.code === "number") return context.code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function parseSpinError(err: unknown): string | null {
  const code = getProgramErrorCode(err);
  if (code == null) return null;
  return SPIN_ERROR_MESSAGES[code] ?? ANCHOR_ERROR_MESSAGES[code] ?? null;
}

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }
  const spinError = parseSpinError(err);
  if (spinError) return spinError;
  const message = deepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}
