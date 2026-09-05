/**
 * Plinko multiplier calibration tool.
 *
 * Regenerates the edge-payout multiplier tables from first principles so you
 * can verify (or re-tune) the values embedded in:
 *   - programs/spin/src/constants.rs   (PLINKO_TABLES_0_01)
 *   - frontend/app/lib/solana/games/plinko.ts  (PLINKO_TABLES)
 *
 * Both mirrors must stay byte-identical. Run `npx tsx scripts/plinko-calibrate.ts`
 * to print every table with its RTP and the expected source-formatted constant.
 *
 * Model: bucket k (0..=n rights) has binomial probability p_k = C(n,k)/2^n.
 * The center bucket (k ≈ n/2) sets the "paytable zero" and the payouts fall
 * off geometrically toward zero, so edges pay the most. Each bucket's
 * multiplier is scaled so the paytable reaches a target RTP:
 *      mult_k = base_k * c,  base_k = 1/p_k
 *      RTP = sum_k p_k * mult_k = c * (n+1)      (since p_k * base_k = 1)
 *      => c = RTP / (n+1)
 *      mult_k (in 0.01x) = round(100 * c / p_k)
 */

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (k - i);
  return r;
}

function prob(n: number, k: number): number {
  return binom(n, k) / Math.pow(2, n);
}

function table(n: number, rtp: number): { mults: number[]; actual: number } {
  const c = rtp / (n + 1);
  const mults: number[] = [];
  for (let k = 0; k <= n; k++) {
    mults.push(Math.round(100 * (c / prob(n, k))));
  }
  let actual = 0;
  for (let k = 0; k <= n; k++) actual += prob(n, k) * (mults[k] / 100);
  return { mults, actual };
}

const RISK = [
  { name: "LOW", rtp: 0.99 },
  { name: "MED", rtp: 0.975 },
  { name: "HIGH", rtp: 0.96 },
];

const MAX_CELLS = Math.max(9, ...Array.from({ length: 9 }, (_, i) => 8 + i + 1));

export function printTables() {
  console.log("#ifdef Rust constant stream  --  each table is one row risk\n");
  for (let n = 8; n <= 16; n++) {
    console.log(`// rows ${n}`);
    for (const r of RISK) {
      const { mults, actual } = table(n, r.rtp);
      const pad = mults.map((v) => String(v).padStart(6, " ")).join(", ");
      console.log(`    // ${r.name} rtp=${(actual * 100).toFixed(2)}%  ->  &[${pad}],`);
    }
    console.log();
  }
  console.log(`MAX cells per row: ${MAX_CELLS}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printTables();
}
