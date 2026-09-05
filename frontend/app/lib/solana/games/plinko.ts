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

/** Edge-payout tables, units of 0.01× (2816 = 28.16×). Mirrors
 * `PLINKO_TABLES_0_01` in the program. Bucket k = index into row's array. */
const PLINKO_TABLES: Record<number, Record<PlinkoRisk, number[]>> = {
  8: {
    [PLINKO_RISK.LOW]: [2816, 352, 101, 50, 40, 50, 101, 352, 2816],
    [PLINKO_RISK.MED]: [2773, 347, 99, 50, 40, 50, 99, 347, 2773],
    [PLINKO_RISK.HIGH]: [2731, 341, 98, 49, 39, 49, 98, 341, 2731],
  },
  9: {
    [PLINKO_RISK.LOW]: [5069, 563, 141, 60, 40, 40, 60, 141, 563, 5069],
    [PLINKO_RISK.MED]: [4992, 555, 139, 59, 40, 40, 59, 139, 555, 4992],
    [PLINKO_RISK.HIGH]: [4915, 546, 137, 59, 39, 39, 59, 137, 546, 4915],
  },
  10: {
    [PLINKO_RISK.LOW]: [9216, 922, 205, 77, 44, 37, 44, 77, 205, 922, 9216],
    [PLINKO_RISK.MED]: [9076, 908, 202, 76, 43, 36, 43, 76, 202, 908, 9076],
    [PLINKO_RISK.HIGH]: [8937, 894, 199, 74, 43, 35, 43, 74, 199, 894, 8937],
  },
  11: {
    [PLINKO_RISK.LOW]: [
      16896, 1536, 307, 102, 51, 37, 37, 51, 102, 307, 1536, 16896,
    ],
    [PLINKO_RISK.MED]: [
      16640, 1513, 303, 101, 50, 36, 36, 50, 101, 303, 1513, 16640,
    ],
    [PLINKO_RISK.HIGH]: [
      16384, 1489, 298, 99, 50, 35, 35, 50, 99, 298, 1489, 16384,
    ],
  },
  12: {
    [PLINKO_RISK.LOW]: [
      31193, 2599, 473, 142, 63, 39, 34, 39, 63, 142, 473, 2599, 31193,
    ],
    [PLINKO_RISK.MED]: [
      30720, 2560, 465, 140, 62, 39, 33, 39, 62, 140, 465, 2560, 30720,
    ],
    [PLINKO_RISK.HIGH]: [
      30247, 2521, 458, 137, 61, 38, 33, 38, 61, 137, 458, 2521, 30247,
    ],
  },
  13: {
    [PLINKO_RISK.LOW]: [
      57929, 4456, 743, 203, 81, 45, 34, 34, 45, 81, 203, 743, 4456, 57929,
    ],
    [PLINKO_RISK.MED]: [
      57051, 4389, 731, 199, 80, 44, 33, 33, 44, 80, 199, 731, 4389, 57051,
    ],
    [PLINKO_RISK.HIGH]: [
      56174, 4321, 720, 196, 79, 44, 33, 33, 44, 79, 196, 720, 4321, 56174,
    ],
  },
  14: {
    [PLINKO_RISK.LOW]: [
      108134, 7724, 1188, 297, 108, 54, 36, 32, 36, 54, 108, 297, 1188, 7724,
      108134,
    ],
    [PLINKO_RISK.MED]: [
      106496, 7607, 1170, 293, 106, 53, 35, 31, 35, 53, 106, 293, 1170, 7607,
      106496,
    ],
    [PLINKO_RISK.HIGH]: [
      104858, 7490, 1152, 288, 105, 52, 35, 31, 35, 52, 105, 288, 1152, 7490,
      104858,
    ],
  },
  15: {
    [PLINKO_RISK.LOW]: [
      202752, 13517, 1931, 446, 149, 68, 41, 32, 32, 41, 68, 149, 446, 1931,
      13517, 202752,
    ],
    [PLINKO_RISK.MED]: [
      199680, 13312, 1902, 439, 146, 66, 40, 31, 31, 40, 66, 146, 439, 1902,
      13312, 199680,
    ],
    [PLINKO_RISK.HIGH]: [
      196608, 13107, 1872, 432, 144, 65, 39, 31, 31, 39, 65, 144, 432, 1872,
      13107, 196608,
    ],
  },
  16: {
    [PLINKO_RISK.LOW]: [
      381651, 23853, 3180, 682, 210, 87, 48, 33, 30, 33, 48, 87, 210, 682, 3180,
      23853, 381651,
    ],
    [PLINKO_RISK.MED]: [
      375868, 23492, 3132, 671, 207, 86, 47, 33, 29, 33, 47, 86, 207, 671, 3132,
      23492, 375868,
    ],
    [PLINKO_RISK.HIGH]: [
      370086, 23130, 3084, 661, 203, 85, 46, 32, 29, 32, 46, 85, 203, 661, 3084,
      23130, 370086,
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
