/**
 * Megaways evaluator self-test: determinism, structural invariants and a few
 * golden vectors to paste into the Rust port's tests later.
 *
 *   npx tsx scripts/megaways-selftest.ts [--seeds 2000]
 */
import { randomBytes } from "node:crypto";
import {
  MAX_CASCADES,
  MAX_FREE_SPINS_TOTAL,
  MAX_ROWS,
  MAX_WIN_BP,
  MIN_ROWS,
  REELS,
  RngStream,
  SYM,
  SYMBOL_COUNT,
  SYMBOL_WEIGHTS,
  SYMBOL_WEIGHT_TOTAL,
  HEIGHT_WEIGHTS,
  HEIGHT_WEIGHT_TOTAL,
  applyCascade,
  megawaysEval,
  megawaysPayout,
  type Grid,
  type MegawaysOutcome,
} from "../app/lib/solana/games/megaways";

const args = process.argv.slice(2);
const seedsArg = args.indexOf("--seeds");
const SEEDS = seedsArg >= 0 ? Number(args[seedsArg + 1]) : 2000;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    if (failures <= 20) console.error("FAIL:", msg);
  }
}

const json = (o: unknown) =>
  JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));

function hex(b: Uint8Array) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function sameGrid(a: Grid, b: Grid): boolean {
  if (a.heights.length !== b.heights.length) return false;
  for (let r = 0; r < a.heights.length; r++) {
    if (a.heights[r] !== b.heights[r]) return false;
    if (a.cells[r].length !== b.cells[r].length) return false;
    for (let i = 0; i < a.cells[r].length; i++) {
      if (a.cells[r][i] !== b.cells[r][i]) return false;
    }
  }
  return true;
}

// --- constants --------------------------------------------------------------
check(
  HEIGHT_WEIGHTS.reduce((a, b) => a + b, 0) === HEIGHT_WEIGHT_TOTAL,
  "HEIGHT_WEIGHTS must sum to HEIGHT_WEIGHT_TOTAL"
);
check(HEIGHT_WEIGHTS.length === MAX_ROWS - MIN_ROWS + 1, "height weights span");
for (let r = 0; r < REELS; r++) {
  const sum = SYMBOL_WEIGHTS[r].reduce((a, b) => a + b, 0);
  check(sum === SYMBOL_WEIGHT_TOTAL, `SYMBOL_WEIGHTS[${r}] sums to ${sum}`);
  check(SYMBOL_WEIGHTS[r].length === SYMBOL_COUNT, `SYMBOL_WEIGHTS[${r}] len`);
}
check(SYMBOL_WEIGHTS[0][SYM.WILD] === 0, "no wild on reel 0");
check(SYMBOL_WEIGHTS[REELS - 1][SYM.WILD] === 0, "no wild on reel 5");

// --- determinism + invariants ----------------------------------------------
const bet = 10_000n; // payout then equals totalWinBp
const golden: { seed: string; o: MegawaysOutcome }[] = [];
let fsSeen = 0;
let cascadeSeen = 0;

for (let i = 0; i < SEEDS; i++) {
  const seed = new Uint8Array(randomBytes(64));
  const a = megawaysEval(seed, bet, 0n);
  const b = megawaysEval(seed, bet, 0n);
  check(json(a) === json(b), `seed ${i}: not deterministic`);

  check(a.payout === megawaysPayout(bet, a.totalWinBp), `seed ${i}: payout`);
  check(a.totalWinBp <= MAX_WIN_BP, `seed ${i}: total over cap`);
  check(a.multiplierBp === a.totalWinBp, `seed ${i}: multiplierBp alias`);
  check(a.totalFreeSpins <= MAX_FREE_SPINS_TOTAL, `seed ${i}: fs cap`);
  check(a.freeSpins.length === a.totalFreeSpins, `seed ${i}: fs count`);

  // Replay rounds with a parallel RNG to confirm the recorded refills match.
  const rounds = [a.base, ...a.freeSpins];
  let sum = 0n;
  for (const round of rounds) {
    check(round.steps.length <= MAX_CASCADES + 1, `seed ${i}: steps cap`);
    let roundSum = 0n;
    for (let s = 0; s < round.steps.length; s++) {
      const st = round.steps[s];
      for (let r = 0; r < REELS; r++) {
        const h = st.grid.heights[r];
        check(h >= MIN_ROWS && h <= MAX_ROWS, `seed ${i}: height ${h}`);
        check(st.grid.cells[r].length === h, `seed ${i}: col len`);
        for (const c of st.grid.cells[r]) {
          check(c >= 0 && c < SYMBOL_COUNT, `seed ${i}: symbol ${c}`);
        }
        if (r === 0 || r === REELS - 1) {
          check(!st.grid.cells[r].includes(SYM.WILD), `seed ${i}: outer wild`);
        }
        const removedOnReel = st.removed.filter(([rr]) => rr === r).length;
        if (st.refill.length > 0 && s < round.steps.length - 1) {
          check(
            st.refill[r].length === removedOnReel,
            `seed ${i}: refill len reel ${r}`
          );
        }
      }
      let stepSum = 0n;
      for (const w of st.wins) {
        stepSum += w.payBp;
        check(w.matchLen >= 3 && w.matchLen <= 6, `seed ${i}: matchLen`);
        check(w.ways >= 1 && w.ways <= 117_649, `seed ${i}: ways`);
      }
      check(
        st.stepWinBp === stepSum * BigInt(st.multiplier),
        `seed ${i}: stepWinBp`
      );
      roundSum += st.stepWinBp;
      if (s < round.steps.length - 1) {
        // Reconstruct the next grid from this step's removed + refill.
        const fake = {
          pickWeighted: (() => {
            const flat = st.refill.flat();
            let k = 0;
            return () => flat[k++];
          })(),
        } as unknown as RngStream;
        const rebuilt = applyCascade(st.grid, st.removed, fake).grid;
        check(
          sameGrid(rebuilt, round.steps[s + 1].grid),
          `seed ${i}: cascade reconstruction`
        );
      }
      if (st.wins.length > 0) cascadeSeen++;
    }
    check(round.roundWinBp === roundSum, `seed ${i}: roundWinBp`);
    sum += roundSum;
  }
  check(
    a.capped ? a.totalWinBp === MAX_WIN_BP : a.totalWinBp === sum,
    `seed ${i}: total sum`
  );
  if (a.totalFreeSpins > 0) fsSeen++;
  if (golden.length < 3 && (golden.length === 0 || a.totalWinBp > 0n)) {
    golden.push({ seed: hex(seed), o: a });
  }
}

console.log(
  `seeds: ${SEEDS}, winning steps: ${cascadeSeen}, FS outcomes: ${fsSeen}`
);
console.log("golden vectors (seed → totalWinBp, rngBlocksUsed):");
for (const g of golden) {
  console.log(
    `  ${g.seed}\n    -> ${g.o.totalWinBp} bp, ${g.o.rngBlocksUsed} blocks, fs=${g.o.totalFreeSpins}`
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
