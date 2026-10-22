/**
 * Spin Wheel — client-side evaluator, mirrored byte-for-byte in
 * programs/spin/src/games/wheel.rs.
 *
 * A 24-segment wheel. Every segment is equally likely (the pointer is fair);
 * the three risk variants differ in how the 97% RTP is spread over the
 * segments: Low pays small and often, High pays rarely but up to 20×.
 * Multipliers are in 0.01× units; Σ over 24 segments is 2,328 for every
 * variant, i.e. RTP = 2328 / 2400 = 97.00%.
 */

export const GAME_WHEEL = 9;
export const WHEEL_SEGMENTS = 24;

export const WHEEL_RISK = { LOW: 0, MED: 1, HIGH: 2 } as const;
export type WheelRisk = (typeof WHEEL_RISK)[keyof typeof WHEEL_RISK];
export const WHEEL_RISK_NAMES: Record<WheelRisk, string> = {
  [WHEEL_RISK.LOW]: "Low",
  [WHEEL_RISK.MED]: "Med",
  [WHEEL_RISK.HIGH]: "High",
};

/**
 * Segment multipliers in 0.01×, clockwise from the pointer. Wins are spread
 * around the wheel so the needle never passes long dead stretches.
 */
export const WHEEL_TABLES: Record<WheelRisk, readonly number[]> = {
  // 9×0, 7×1.2, 6×1.48, 2×3  → Σ 2328
  [WHEEL_RISK.LOW]: [
    120, 0, 148, 120, 0, 300, 120, 0, 148, 120, 0, 148, 120, 0, 148, 0, 120, 0,
    300, 148, 0, 120, 0, 148,
  ],
  // 16×0, 3×1.2, 2×2, 2×3, 1×9.68 → Σ 2328
  [WHEEL_RISK.MED]: [
    0, 120, 0, 0, 200, 0, 0, 300, 0, 0, 120, 0, 968, 0, 0, 200, 0, 0, 120, 0, 0,
    300, 0, 0,
  ],
  // 22×0, 1×3, 1×20.28 → Σ 2328
  [WHEEL_RISK.HIGH]: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2028, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300,
  ],
};

export type WheelOutcome = {
  /** Winning segment index, clockwise from the pointer. */
  segment: number;
  multiplierBp: bigint;
  payout: bigint;
};

export function wheelDecodeTarget(target: bigint): WheelRisk | null {
  if (target === 0n) return WHEEL_RISK.LOW;
  if (target === 1n) return WHEEL_RISK.MED;
  if (target === 2n) return WHEEL_RISK.HIGH;
  return null;
}

export function wheelEncodeTarget(risk: WheelRisk): bigint {
  return BigInt(risk);
}

export function wheelMultiplierBp(risk: WheelRisk, segment: number): bigint {
  return BigInt(WHEEL_TABLES[risk][segment] ?? 0) * 100n;
}

export function wheelMaxMultiplierBp(target: bigint): bigint {
  const risk = wheelDecodeTarget(target);
  if (risk == null) return 0n;
  return BigInt(Math.max(...WHEEL_TABLES[risk])) * 100n;
}

/** Mirrors the program's integer payout (amount × bp / 10_000, truncated). */
export function wheelPayout(amount: bigint, multiplierBp: bigint): bigint {
  return (amount * multiplierBp) / 10_000n;
}

/**
 * The first four bytes of the randomness, little-endian, modulo 24 pick the
 * segment. (Bias ≤ 24 / 2³², identical in Rust.)
 */
export function wheelEval(
  randomness: Uint8Array,
  bet: bigint,
  target: bigint
): WheelOutcome {
  const risk = wheelDecodeTarget(target) ?? WHEEL_RISK.LOW;
  const v =
    (randomness[0] |
      (randomness[1] << 8) |
      (randomness[2] << 16) |
      (randomness[3] << 24)) >>>
    0;
  const segment = v % WHEEL_SEGMENTS;
  const multiplierBp = wheelMultiplierBp(risk, segment);
  return { segment, multiplierBp, payout: wheelPayout(bet, multiplierBp) };
}
