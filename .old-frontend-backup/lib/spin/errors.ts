const SPIN_ERRORS: Record<number, string> = {
  6000: "House is paused",
  6001: "Only the house authority may perform this action",
  6002: "Bet below minimum",
  6003: "Bet above maximum",
  6004: "Bet exceeds the house bankroll limit (1% of treasury)",
  6005: "Treasury balance is too low",
  6006: "Target out of range",
  6007: "Unknown game",
  6008: "Spin is already resolved",
  6009: "Spin is not yet resolvable",
  6010: "Randomness request is not fulfilled yet",
  6011: "Pending account does not match the randomness request",
  6012: "Client PDA does not match the registered VRF client",
  6013: "Treasury account does not match the network configuration",
  6014: "Request account does not match the VRF request PDA",
  6015: "Network state account is invalid",
  6016: "Payout calculation overflow",
  6017: "Invalid player",
};

const SPIN_ERROR_BASE = 6000;
const SPIN_ERROR_COUNT = 18;

export function parseSpinError(err: unknown): string | null {
  const message = deepestMessage(err);
  const hex = /custom program error: (0x[0-9a-fA-F]+)/.exec(message);
  if (hex) {
    const code = parseInt(hex[1], 16);
    if (code >= SPIN_ERROR_BASE && code < SPIN_ERROR_BASE + SPIN_ERROR_COUNT) {
      return SPIN_ERRORS[code];
    }
  }
  const dec = /custom program error: (\d+)/.exec(message);
  if (dec) {
    const code = parseInt(dec[1], 10);
    if (code >= SPIN_ERROR_BASE && code < SPIN_ERROR_BASE + SPIN_ERROR_COUNT) {
      return SPIN_ERRORS[code];
    }
  }
  return null;
}

function deepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;
  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) deepest = current.message;
  }
  return deepest;
}
