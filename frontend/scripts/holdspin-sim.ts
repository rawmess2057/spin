/**
 * Monte-Carlo RTP for Dragon's Vault (Hold & Spin).
 *
 *   npx tsx scripts/holdspin-sim.ts --spins 500000 --seed 1 [--target 0.96]
 */
import { sha256 } from "@noble/hashes/sha2.js";
import {
  LINE_PAYS,
  SYMBOL_NAMES,
  holdSpinEval,
} from "../app/lib/solana/games/hold-spin";

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const SPINS = arg("spins", 200_000);
const SEED = arg("seed", 1);
const TARGET = arg("target", 0.96);
const BET = 1_000_000n;

function seedBytes(i: number): Uint8Array {
  const a = sha256(new TextEncoder().encode(`hs-sim:${SEED}:${i}`));
  const b = sha256(a);
  const out = new Uint8Array(64);
  out.set(a, 0);
  out.set(b, 32);
  return out;
}

let totalBp = 0n;
let linesBp = 0n;
let bonusBp = 0n;
let hits = 0;
let bonuses = 0;
let grands = 0;
let maxBp = 0n;
let maxBlocks = 0;
let respinsTotal = 0;
let coinsTotal = 0;
const bySymbol = new Array(LINE_PAYS.length).fill(0n);
const hist: Record<string, number> = {};
const t0 = performance.now();
for (let i = 0; i < SPINS; i++) {
  const o = holdSpinEval(seedBytes(i), BET, 0n);
  totalBp += o.totalWinBp;
  linesBp += o.linesWinBp;
  for (const w of o.lineWins) bySymbol[w.symbol] += w.payBp;
  if (o.totalWinBp > 0n) hits++;
  if (o.bonus) {
    bonuses++;
    bonusBp += o.bonus.bonusWinBp;
    respinsTotal += o.bonus.respins.length;
    coinsTotal += o.bonus.coinCount;
    if (o.bonus.grand) grands++;
  }
  if (o.totalWinBp > maxBp) maxBp = o.totalWinBp;
  if (o.rngBlocksUsed > maxBlocks) maxBlocks = o.rngBlocksUsed;
  const x = Number(o.totalWinBp) / 10_000;
  const bucket =
    x === 0
      ? "0"
      : x < 1
        ? "<1x"
        : x < 5
          ? "1-5x"
          : x < 20
            ? "5-20x"
            : x < 100
              ? "20-100x"
              : x < 1000
                ? "100-1k"
                : "1k+";
  hist[bucket] = (hist[bucket] ?? 0) + 1;
}
const elapsed = (performance.now() - t0) / 1000;
const rtp = Number(totalBp) / (SPINS * 10_000);
const linesRtp = Number(linesBp) / (SPINS * 10_000);
const bonusRtp = Number(bonusBp) / (SPINS * 10_000);
const pc = (v: number) => `${(v * 100).toFixed(2)}%`;
console.log(
  `spins ${SPINS.toLocaleString()} (seed ${SEED}) in ${elapsed.toFixed(1)}s`
);
console.log(
  `RTP        ${pc(rtp)}   lines ${pc(linesRtp)}  bonus ${pc(bonusRtp)}`
);
console.log(
  `hit rate   ${pc(hits / SPINS)}   bonus 1 in ${(SPINS / Math.max(1, bonuses)).toFixed(0)}   grands ${grands}`
);
if (bonuses) {
  console.log(
    `bonus avg  ${(respinsTotal / bonuses).toFixed(1)} respins, ${(coinsTotal / bonuses).toFixed(1)} coins, ${(Number(bonusBp) / bonuses / 10_000).toFixed(1)}x`
  );
}
console.log(
  `max win    ${(Number(maxBp) / 10_000).toFixed(1)}x   rng blocks max ${maxBlocks}`
);
console.log(
  "win sizes ",
  Object.entries(hist)
    .map(([k, v]) => `${k}: ${pc(v / SPINS)}`)
    .join("  ")
);
console.log("line win share:");
bySymbol.forEach((v, s) => {
  if (v > 0n)
    console.log(
      `  ${SYMBOL_NAMES[s].padEnd(8)} ${pc(Number(v) / Number(linesBp || 1n))}`
    );
});
const scale = (TARGET - bonusRtp) / linesRtp;
console.log(
  `\nto hit ${pc(TARGET)} keep the bonus and scale LINE_PAYS by ${scale.toFixed(4)}:`
);
for (let s = 0; s < LINE_PAYS.length; s++) {
  console.log(
    `  [${LINE_PAYS[s].map((p) => Math.round(p * scale)).join(", ")}], // ${SYMBOL_NAMES[s]}`
  );
}
