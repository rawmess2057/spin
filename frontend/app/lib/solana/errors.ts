import {
  SPIN_ERROR__ALREADY_RESOLVED,
  SPIN_ERROR__ARITHMETIC_OVERFLOW,
  SPIN_ERROR__BET_ABOVE_MAXIMUM,
  SPIN_ERROR__BET_BELOW_MINIMUM,
  SPIN_ERROR__BET_EXCEEDS_BANKROLL_LIMIT,
  SPIN_ERROR__CHAIN_EXHAUSTED,
  SPIN_ERROR__CHAIN_INACTIVE,
  SPIN_ERROR__CHAIN_STALE,
  SPIN_ERROR__CHAIN_STILL_ACTIVE,
  SPIN_ERROR__CHAIN_TOO_LONG,
  SPIN_ERROR__CLIENT_MISMATCH,
  SPIN_ERROR__DELEGATE_EXPIRED,
  SPIN_ERROR__DELEGATE_LIMIT_EXCEEDED,
  SPIN_ERROR__HOUSE_PAUSED,
  SPIN_ERROR__INSUFFICIENT_CREDITS,
  SPIN_ERROR__INVALID_DELEGATE,
  SPIN_ERROR__INVALID_PLAYER,
  SPIN_ERROR__NETWORK_STATE_MISMATCH,
  SPIN_ERROR__NOT_AUTHORITY,
  SPIN_ERROR__PENDING_MISMATCH,
  SPIN_ERROR__RANDOMNESS_PENDING,
  SPIN_ERROR__REQUEST_MISMATCH,
  SPIN_ERROR__SPIN_NOT_RESOLVABLE,
  SPIN_ERROR__TARGET_OUT_OF_RANGE,
  SPIN_ERROR__TREASURY_BALANCE_TOO_LOW,
  SPIN_ERROR__TREASURY_INSOLVENT,
  SPIN_ERROR__TREASURY_MISMATCH,
  SPIN_ERROR__UNKNOWN_GAME,
  SPIN_ERROR__VRF_BETTING_DISABLED,
} from "./generated/spin";

// Codama's own getSpinErrorMessage() is stripped in production builds (a
// bundle-size tradeoff), so this app keeps its own user-facing copy — still
// keyed off the generated numeric codes rather than hardcoded literals, so
// it can't silently drift from the IDL.
const SPIN_ERROR_MESSAGES: Record<number, string> = {
  [SPIN_ERROR__HOUSE_PAUSED]: "House is paused.",
  [SPIN_ERROR__NOT_AUTHORITY]:
    "Only the house authority may perform this action.",
  [SPIN_ERROR__BET_BELOW_MINIMUM]: "Bet is below the minimum.",
  [SPIN_ERROR__BET_ABOVE_MAXIMUM]: "Bet is above the maximum.",
  [SPIN_ERROR__BET_EXCEEDS_BANKROLL_LIMIT]:
    "Bet exceeds the house bankroll limit (1% of treasury).",
  [SPIN_ERROR__TREASURY_BALANCE_TOO_LOW]: "Treasury balance is too low.",
  [SPIN_ERROR__TARGET_OUT_OF_RANGE]: "Target is out of range.",
  [SPIN_ERROR__UNKNOWN_GAME]: "Unknown game.",
  [SPIN_ERROR__ALREADY_RESOLVED]: "This spin is already resolved.",
  [SPIN_ERROR__SPIN_NOT_RESOLVABLE]: "This spin is not yet resolvable.",
  [SPIN_ERROR__RANDOMNESS_PENDING]:
    "The randomness request has not been fulfilled yet.",
  [SPIN_ERROR__PENDING_MISMATCH]:
    "Pending account does not match the randomness request.",
  [SPIN_ERROR__CLIENT_MISMATCH]:
    "Client PDA does not match the registered VRF client.",
  [SPIN_ERROR__TREASURY_MISMATCH]:
    "Treasury account does not match the network configuration.",
  [SPIN_ERROR__REQUEST_MISMATCH]:
    "Request account does not match the VRF request PDA.",
  [SPIN_ERROR__NETWORK_STATE_MISMATCH]: "Network state account is invalid.",
  [SPIN_ERROR__ARITHMETIC_OVERFLOW]: "Payout calculation overflow.",
  [SPIN_ERROR__INVALID_PLAYER]: "Invalid player.",
  [SPIN_ERROR__INVALID_DELEGATE]:
    "This session key is not authorized to bet for you.",
  [SPIN_ERROR__DELEGATE_EXPIRED]: "This session key has expired.",
  [SPIN_ERROR__DELEGATE_LIMIT_EXCEEDED]:
    "This session key's spending limit is used up.",
  [SPIN_ERROR__INSUFFICIENT_CREDITS]: "Not enough diamonds — buy in to play.",
  [SPIN_ERROR__TREASURY_INSOLVENT]:
    "The house can't cover this win right now — try a smaller bet.",
  [SPIN_ERROR__VRF_BETTING_DISABLED]:
    "VRF betting is off — the house is using the instant chain.",
  [SPIN_ERROR__CHAIN_INACTIVE]: "The house's reveal chain is not active yet.",
  [SPIN_ERROR__CHAIN_STALE]:
    "Another spin used this reveal first — retrying with the next one.",
  [SPIN_ERROR__CHAIN_EXHAUSTED]:
    "The reveal chain is exhausted — the house is rotating a new one.",
  [SPIN_ERROR__CHAIN_TOO_LONG]: "Chain length is out of range.",
  [SPIN_ERROR__CHAIN_STILL_ACTIVE]:
    "The old chain is still active — it must be fully consumed first.",
};

/**
 * Anchor framework error codes (as opposed to our program's own 6000-range
 * codes). These can surface from any Anchor program in the transaction — for
 * example the legacy VRF program the chain mode replaced — so they need
 * their own mapping or they reach the player as a bare "Custom program
 * error: #2005".
 *
 * Only the codes actually reachable from this app are listed.
 */
const ANCHOR_ERROR_MESSAGES: Record<number, string> = {
  2005:
    // Our program declares no rent_exempt constraint anywhere, so a 2005 can
    // only come from the legacy VRF CPI, where it means the randomness
    // client account can no longer fund a request and stay rent-exempt.
    "The game's randomness account is out of funds, so no new spins can be " +
    "requested right now. Nothing was charged — your bet was never sent. " +
    "The operator needs to top it up.",
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
 * Exported so callers can branch on specific codes (e.g. ChainStale retry).
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
