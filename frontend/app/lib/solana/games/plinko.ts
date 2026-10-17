/**
 * Plinko client-side evaluator.
 *
 * Mirrors the on-chain evaluator (programs/spin/src/instructions/bet.rs and
 * constants.rs) byte-for-byte so the outcome a player sees animating on the
 * board is exactly what the program settled. The path is derived directly
 * from the reveal-chain randomness; both halves read the same bits.
 */

export const GAME_PLINKO = 7;
export const PLINKO_MIN_ROWS = 8;
export const PLINKO_MAX_ROWS = 16;

export const PLINKO_RISK = {
  LOW: 0,
  MED: 1,
  HIGH: 2,
} as const;
export type PlinkoRisk = (typeof PLINKO_RISK)[keyof typeof PLINKO_RISK];

export const PLINKO_RISK_NAMES: Record<PlinkoRisk, string> = {
  [PLINKO_RISK.LOW]: "Low",
  [PLINKO_RISK.MED]: "Med",
  [PLINKO_RISK.HIGH]: "High",
};

export type PlinkoConfig = {
  rows: number;
  risk: PlinkoRisk;
};

export type PlinkoOutcome = {
  /** 0..rows — number of right turns in the path. */
  bucket: number;
  /** Multiplier in basis points (10,000 = 1×). */
  multiplierBp: bigint;
  /** Payout in lamports. */
  payout: bigint;
  /** Per-row L/R decision, index 0 = first peg row. */
  path: ("L" | "R")[];
};

/** Edge-payout tables, units of 0.01× (504 = 5.04×). Mirrors
 * `PLINKO_TABLES_0_01` in the program byte-for-byte. Every risk level targets
 * a 97% RTP and differs only in shape: Low is flat, High is steep. Regenerate
 * with `npx tsx scripts/plinko-calibrate.ts` (repo root). Bucket k = index. */
const PLINKO_TABLES: Record<number, Record<PlinkoRisk, number[]>> = {
  8: {
    [PLINKO_RISK.LOW]: [504, 198, 112, 82, 74, 82, 112, 198, 504],
    [PLINKO_RISK.MED]: [838, 241, 113, 75, 65, 75, 113, 241, 838],
    [PLINKO_RISK.HIGH]: [1575, 298, 110, 63, 53, 63, 110, 298, 1575],
  },
  9: {
    [PLINKO_RISK.LOW]: [665, 247, 133, 91, 75, 75, 91, 133, 247, 665],
    [PLINKO_RISK.MED]: [1215, 325, 142, 85, 67, 67, 85, 142, 325, 1215],
    [PLINKO_RISK.HIGH]: [2570, 443, 146, 74, 54, 54, 74, 146, 443, 2570],
  },
  10: {
    [PLINKO_RISK.LOW]: [885, 314, 160, 103, 80, 74, 80, 103, 160, 314, 885],
    [PLINKO_RISK.MED]: [1778, 447, 181, 101, 72, 64, 72, 101, 181, 447, 1778],
    [PLINKO_RISK.HIGH]: [4221, 669, 201, 92, 59, 51, 59, 92, 201, 669, 4221],
  },
  11: {
    [PLINKO_RISK.LOW]: [
      1184, 402, 195, 119, 87, 75, 75, 87, 119, 195, 402, 1184,
    ],
    [PLINKO_RISK.MED]: [
      2602, 617, 235, 122, 80, 66, 66, 80, 122, 235, 617, 2602,
    ],
    [PLINKO_RISK.HIGH]: [
      6984, 1026, 283, 118, 68, 52, 52, 68, 118, 283, 1026, 6984,
    ],
  },
  12: {
    [PLINKO_RISK.LOW]: [
      1583, 517, 240, 140, 97, 79, 73, 79, 97, 140, 240, 517, 1583,
    ],
    [PLINKO_RISK.MED]: [
      3829, 862, 310, 151, 93, 70, 64, 70, 93, 151, 310, 862, 3829,
    ],
    [PLINKO_RISK.HIGH]: [
      11604, 1589, 406, 155, 81, 56, 49, 56, 81, 155, 406, 1589, 11604,
    ],
  },
  13: {
    [PLINKO_RISK.LOW]: [
      2126, 670, 299, 167, 110, 85, 74, 74, 85, 110, 167, 299, 670, 2126,
    ],
    [PLINKO_RISK.MED]: [
      5653, 1213, 414, 190, 110, 77, 65, 65, 77, 110, 190, 414, 1213, 5653,
    ],
    [PLINKO_RISK.HIGH]: [
      19401, 2493, 594, 210, 101, 63, 50, 50, 63, 101, 210, 594, 2493, 19401,
    ],
  },
  14: {
    [PLINKO_RISK.LOW]: [
      2847, 868, 374, 200, 127, 93, 78, 73, 78, 93, 127, 200, 374, 868, 2847,
    ],
    [PLINKO_RISK.MED]: [
      8362, 1716, 558, 243, 132, 87, 69, 63, 69, 87, 132, 243, 558, 1716, 8362,
    ],
    [PLINKO_RISK.HIGH]: [
      32420, 3926, 878, 290, 129, 74, 54, 48, 54, 74, 129, 290, 878, 3926,
      32420,
    ],
  },
  15: {
    [PLINKO_RISK.LOW]: [
      3837, 1134, 473, 244, 149, 104, 83, 74, 74, 83, 104, 149, 244, 473, 1134,
      3837,
    ],
    [PLINKO_RISK.MED]: [
      12432, 2448, 762, 316, 163, 102, 75, 64, 64, 75, 102, 163, 316, 762, 2448,
      12432,
    ],
    [PLINKO_RISK.HIGH]: [
      54608, 6257, 1319, 408, 169, 90, 60, 49, 49, 60, 90, 169, 408, 1319, 6257,
      54608,
    ],
  },
  16: {
    [PLINKO_RISK.LOW]: [
      5151, 1479, 597, 299, 176, 119, 90, 77, 73, 77, 90, 119, 176, 299, 597,
      1479, 5151,
    ],
    [PLINKO_RISK.MED]: [
      18386, 3484, 1040, 413, 203, 120, 84, 68, 63, 68, 84, 120, 203, 413, 1040,
      3484, 18386,
    ],
    [PLINKO_RISK.HIGH]: [
      92092, 10021, 1999, 583, 227, 113, 69, 52, 47, 52, 69, 113, 227, 583,
      1999, 10021, 92092,
    ],
  },
};

/** The 0.01× table for a (rows, risk) tuple, or null if invalid. */
export function plinkoTable(rows: number, risk: PlinkoRisk): number[] | null {
  return PLINKO_TABLES[rows]?.[risk] ?? null;
}

/** Encodes rows + risk into the `target` field: (rows << 8) | risk. */
export function plinkoEncodeTarget(config: PlinkoConfig): bigint {
  return BigInt((config.rows << 8) | config.risk);
}

/** Decodes `target` into a config; null if out of range. */
export function plinkoDecodeTarget(target: bigint): PlinkoConfig | null {
  const rows = Number((target >> 8n) & 0xffn);
  const risk = Number(target & 0xffn) as PlinkoRisk;
  if (
    rows < PLINKO_MIN_ROWS ||
    rows > PLINKO_MAX_ROWS ||
    ![PLINKO_RISK.LOW, PLINKO_RISK.MED, PLINKO_RISK.HIGH].includes(risk)
  ) {
    return null;
  }
  return { rows, risk };
}

/** Basis-point multiplier for a bucket, mirroring `plinko_multiplier_bp`. */
export function plinkoMultiplierBp(
  rows: number,
  risk: PlinkoRisk,
  bucket: number
): bigint {
  const table = plinkoTable(rows, risk);
  if (table == null || bucket < 0 || bucket > rows) return 0n;
  return BigInt(table[bucket]) * 100n;
}

/** Mirrors the program's integer payout (amount * bp / 10_000, truncated). */
export function plinkoPayout(amount: bigint, multiplierBp: bigint): bigint {
  return (amount * multiplierBp) / 10_000n;
}

/**
 * Evaluates a Plinko spin from 64 bytes of randomness (the reveal-chain
 * `chainRandomness` output). Returns the full outcome + path, matching the
 * on-chain evaluator.
 */
export function plinkoEval(
  randomness: Uint8Array,
  bet: bigint,
  config: PlinkoConfig
): PlinkoOutcome {
  const table = plinkoTable(config.rows, config.risk);
  const fallbackConfig: PlinkoConfig =
    table == null ? { rows: 8, risk: PLINKO_RISK.LOW } : config;

  const rows = fallbackConfig.rows;
  const path: ("L" | "R")[] = [];
  let rights = 0;
  for (let i = 0; i < rows; i++) {
    const byte = randomness[Math.floor(i / 8)] ?? 0;
    const bit = byte & (1 << (i % 8));
    const dir = bit !== 0 ? "R" : "L";
    path.push(dir);
    if (dir === "R") rights++;
  }

  const multiplierBp = plinkoMultiplierBp(
    fallbackConfig.rows,
    fallbackConfig.risk,
    rights
  );
  return {
    bucket: rights,
    multiplierBp,
    payout: plinkoPayout(bet, multiplierBp),
    path,
  };
}
