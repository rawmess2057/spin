/**
 * Megaways Monte-Carlo: RTP, hit rate, free-spin frequency, volatility and
 * the RNG block budget. Deterministic for a given --seed so tuning runs are
 * comparable.
 *
 *   npx tsx scripts/megaways-sim.ts --spins 1000000 --seed 1 [--target 0.96]
 */
import { createHash } from "node:crypto";
import {
  MAX_WIN_BP,
  PAYTABLE,
  SYMBOL_COUNT,
  SYMBOL_NAMES,
  megawaysEval,
} from "../app/lib/solana/games/megaways";

const args = process.argv.slice(2);
function arg(name: string, dflt: number): number {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
}
const SPINS = arg("spins", 200_000);
const SEED = arg("seed", 1);
const TARGET = arg("target", 0.96);

function seedBytes(i: number): Uint8Array {
  const a = createHash("sha256").update(`${SEED}:${i}:a`).digest();
  const b = createHash("sha256").update(`${SEED}:${i}:b`).digest();
  const out = new Uint8Array(64);
  out.set(a, 0);
  out.set(b, 32);
  return out;
}

const BET = 10_000n; // payout === totalWinBp
let totalBp = 0n;
let baseBp = 0n;
let fsBp = 0n;
let hits = 0;
let fsTriggers = 0;
let fsSpinsPlayed = 0;
let fsRetriggers = 0;
let cascadeSteps = 0;
let maxCascades = 0;
let cascadeCapHits = 0;
let fsCapHits = 0;
let maxWinHits = 0;
let sumSq = 0; // in units of bet, for std dev
let maxWin = 0n;
const blocks: number[] = [];
const buckets = [0, 0, 0, 0, 0, 0, 0, 0]; // 0, <1x, 1-5, 5-20, 20-100, 100-1k, 1k-10k, 10k
const symbolHits = new Array(SYMBOL_COUNT).fill(0);

const t0 = performance.now();
for (let i = 0; i < SPINS; i++) {
  const o = megawaysEval(seedBytes(i), BET, 0n);
  totalBp += o.totalWinBp;
  baseBp += o.base.roundWinBp;
  let fsRound = 0n;
  for (const r of o.freeSpins) {
    fsRound += r.roundWinBp;
    if (r.freeSpinsAwarded > 0) fsRetriggers++;
  }
  fsBp += fsRound;
  if (o.totalWinBp > 0n) hits++;
  if (o.base.freeSpinsAwarded > 0) fsTriggers++;
  fsSpinsPlayed += o.totalFreeSpins;
  if (o.fsCapped) fsCapHits++;
  if (o.capped) maxWinHits++;
  if (o.totalWinBp > maxWin) maxWin = o.totalWinBp;
  for (const r of [o.base, ...o.freeSpins]) {
    const c = r.steps.length - 1;
    cascadeSteps += c;
    if (c > maxCascades) maxCascades = c;
    if (r.cascadeCapHit) cascadeCapHits++;
    for (const st of r.steps) for (const w of st.wins) symbolHits[w.symbol]++;
  }
  blocks.push(o.rngBlocksUsed);
  const x = Number(o.totalWinBp) / 10_000;
  sumSq += x * x;
  const b =
    x === 0
      ? 0
      : x < 1
        ? 1
        : x < 5
          ? 2
          : x < 20
            ? 3
            : x < 100
              ? 4
              : x < 1000
                ? 5
                : x < 10000
                  ? 6
                  : 7;
  buckets[b]++;
}
const elapsed = (performance.now() - t0) / 1000;

const rtp = Number(totalBp) / (SPINS * 10_000);
const baseRtp = Number(baseBp) / (SPINS * 10_000);
const fsRtp = Number(fsBp) / (SPINS * 10_000);
const mean = rtp;
const variance = sumSq / SPINS - mean * mean;
blocks.sort((a, b) => a - b);
const pct = (p: number) =>
  blocks[Math.min(blocks.length - 1, Math.floor(p * blocks.length))];

const pc = (n: number) => `${(n * 100).toFixed(2)}%`;
const one = (n: number) => (n > 0 ? `1 in ${(SPINS / n).toFixed(0)}` : "never");

console.log(
  `spins ${SPINS.toLocaleString()} (seed ${SEED}) in ${elapsed.toFixed(1)}s`
);
console.log(
  `RTP        ${pc(rtp)}   base ${pc(baseRtp)}  free spins ${pc(fsRtp)}  (FS share ${pc(fsRtp / rtp)})`
);
console.log(`hit rate   ${pc(hits / SPINS)}`);
console.log(
  `FS trigger ${one(fsTriggers)}   avg FS played ${(fsSpinsPlayed / Math.max(1, fsTriggers)).toFixed(1)}   retriggers ${fsRetriggers}   FS cap ${fsCapHits}`
);
console.log(
  `cascades   avg/round ${(cascadeSteps / (SPINS + fsSpinsPlayed)).toFixed(2)}   max ${maxCascades}   cap hits ${cascadeCapHits}`
);
console.log(
  `max win    ${(Number(maxWin) / 10_000).toFixed(1)}x   cap(${Number(MAX_WIN_BP) / 10_000}x) hits ${maxWinHits}`
);
console.log(`std dev    ${Math.sqrt(variance).toFixed(2)}x per spin`);
console.log(
  `rng blocks p50 ${pct(0.5)}  p90 ${pct(0.9)}  p99 ${pct(0.99)}  max ${blocks[blocks.length - 1]}`
);
console.log(
  `win sizes  0: ${pc(buckets[0] / SPINS)}  <1x: ${pc(buckets[1] / SPINS)}  1-5x: ${pc(buckets[2] / SPINS)}  5-20x: ${pc(buckets[3] / SPINS)}  20-100x: ${pc(buckets[4] / SPINS)}  100-1k: ${pc(buckets[5] / SPINS)}  1k-10k: ${pc(buckets[6] / SPINS)}  10k: ${buckets[7]}`
);
console.log("symbol win share:");
for (let s = 1; s < SYMBOL_COUNT - 1; s++) {
  console.log(`  ${SYMBOL_NAMES[s].padEnd(12)} ${symbolHits[s]}`);
}

const scale = TARGET / rtp;
console.log(
  `\nsuggested PAY_SCALE = ${scale.toFixed(4)} → rescaled PAYTABLE (bp):`
);
for (let s = 0; s < PAYTABLE.length; s++) {
  const row = PAYTABLE[s].map((v) => Math.round(v * scale));
  console.log(`  [${row.join(", ")}], // ${SYMBOL_NAMES[s]}`);
}
