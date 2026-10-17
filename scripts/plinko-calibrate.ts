/**
 * Plinko multiplier calibration tool.
 *
 * Regenerates the edge-payout multiplier tables that are embedded in:
 *   - programs/spin/src/constants.rs            (PLINKO_TABLES_0_01)
 *   - frontend/app/lib/solana/games/plinko.ts   (PLINKO_TABLES)
 *
 * Both mirrors must stay byte-identical. Run
 *   npx tsx scripts/plinko-calibrate.ts            # human-readable + source blocks
 *   npx tsx scripts/plinko-calibrate.ts --json     # machine-readable tables
 *
 * Model: bucket k (0..=n rights) has binomial probability p_k = C(n,k)/2^n.
 * Every risk level targets the same RTP; what differs is the *shape* of the
 * curve, i.e. the volatility:
 *      mult_k = c * p_k^(-alpha)
 * alpha = 1 would give every bucket the same expected value (very steep,
 * thousands-of-x edges); smaller alpha flattens the curve so the edges pay
 * less and the centre pays more. c is solved so that
 *      RTP = sum_k p_k * mult_k
 * hits the target after rounding to 0.01x.
 */

export const PLINKO_RTP = 0.97;

export const RISK = [
  { name: "LOW", alpha: 0.45 },
  { name: "MED", alpha: 0.6 },
  { name: "HIGH", alpha: 0.8 },
] as const;

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (k - i);
  return r;
}

function prob(n: number, k: number): number {
  return binom(n, k) / Math.pow(2, n);
}

function rtpOf(n: number, mults: number[]): number {
  let actual = 0;
  for (let k = 0; k <= n; k++) actual += prob(n, k) * (mults[k] / 100);
  return actual;
}

/** Table for `n` rows at `alpha`, with `c` nudged so the rounded RTP is closest to target. */
export function table(
  n: number,
  alpha: number,
  rtp = PLINKO_RTP
): { mults: number[]; actual: number } {
  const base: number[] = [];
  for (let k = 0; k <= n; k++) base.push(Math.pow(prob(n, k), -alpha));
  let c = rtp / base.reduce((acc, b, k) => acc + prob(n, k) * b, 0);

  // Rounding to 0.01x moves the RTP a little; a few scalar corrections bring
  // it back within rounding distance of the target.
  let best: number[] = [];
  let bestErr = Infinity;
  for (let iter = 0; iter < 12; iter++) {
    const mults = base.map((b) => Math.max(1, Math.round(100 * c * b)));
    const actual = rtpOf(n, mults);
    const err = Math.abs(actual - rtp);
    if (err < bestErr) {
      bestErr = err;
      best = mults;
    }
    c *= rtp / actual;
  }
  return { mults: best, actual: rtpOf(n, best) };
}

export function allTables(): { rows: number; risk: string; mults: number[]; rtp: number }[] {
  const out: { rows: number; risk: string; mults: number[]; rtp: number }[] = [];
  for (let n = 8; n <= 16; n++) {
    for (const r of RISK) {
      const { mults, actual } = table(n, r.alpha);
      out.push({ rows: n, risk: r.name, mults, rtp: actual });
    }
  }
  return out;
}

function printTables() {
  const tables = allTables();
  console.log(`Target RTP ${(PLINKO_RTP * 100).toFixed(2)}% for every risk; alpha LOW/MED/HIGH = ${RISK.map((r) => r.alpha).join("/")}\n`);
  for (const t of tables) {
    const n = t.rows;
    const p = Array.from({ length: n + 1 }, (_, k) => prob(n, k));
    const variance =
      p.reduce((acc, pk, k) => acc + pk * (t.mults[k] / 100) ** 2, 0) - t.rtp ** 2;
    console.log(
      `rows ${String(n).padStart(2)} ${t.risk.padEnd(4)} rtp=${(t.rtp * 100).toFixed(2)}%  edge=${(t.mults[0] / 100).toFixed(2)}x  centre=${(t.mults[n >> 1] / 100).toFixed(2)}x  sd=${Math.sqrt(variance).toFixed(2)}`
    );
  }

  console.log("\n// ---- Rust: PLINKO_TABLES_0_01 ----");
  for (let n = 8; n <= 16; n++) {
    console.log(`    // rows ${n}: LOW, MED, HIGH`);
    for (const t of tables.filter((x) => x.rows === n)) {
      console.log(`    &[${t.mults.join(", ")}],`);
    }
  }

  console.log("\n// ---- TypeScript: PLINKO_TABLES ----");
  for (let n = 8; n <= 16; n++) {
    console.log(`  ${n}: {`);
    for (const t of tables.filter((x) => x.rows === n)) {
      console.log(`    [PLINKO_RISK.${t.risk}]: [${t.mults.join(", ")}],`);
    }
    console.log(`  },`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(allTables()));
  } else {
    printTables();
  }
}
