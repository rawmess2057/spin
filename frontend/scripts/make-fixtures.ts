/**
 * Writes evaluator fixtures for the Rust parity tests
 * (programs/spin/tests/fixtures/*.txt). Deterministic: seed i is
 * sha256("fixture:<game>:<i>") expanded to 64 bytes, so re-running produces
 * the same files.
 *
 *   npx tsx scripts/make-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  PLINKO_RISK,
  plinkoEncodeTarget,
  plinkoEval,
  type PlinkoRisk,
} from "../app/lib/solana/games/plinko";
import { megawaysEval } from "../app/lib/solana/games/megaways";

const outDir = fileURLToPath(
  new URL("../../programs/spin/tests/fixtures/", import.meta.url)
);
mkdirSync(outDir, { recursive: true });

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function seed(game: string, i: number): Uint8Array {
  const a = sha256(new TextEncoder().encode(`fixture:${game}:${i}`));
  const b = sha256(a);
  const out = new Uint8Array(64);
  out.set(a, 0);
  out.set(b, 32);
  return out;
}

// --- Plinko: every rows/risk combination on a few seeds ----------------------
// line: <seed hex> <rows> <risk> <bucket> <multiplier bp> <payout for 1 SOL>
{
  const BET = 1_000_000_000n;
  const lines: string[] = [];
  let i = 0;
  for (let rows = 8; rows <= 16; rows++) {
    for (const risk of [
      PLINKO_RISK.LOW,
      PLINKO_RISK.MED,
      PLINKO_RISK.HIGH,
    ] as PlinkoRisk[]) {
      for (let k = 0; k < 3; k++) {
        const s = seed("plinko", i++);
        const o = plinkoEval(s, BET, { rows, risk });
        const target = plinkoEncodeTarget({ rows, risk });
        lines.push(
          `${hex(s)} ${target} ${o.bucket} ${o.multiplierBp} ${o.payout}`
        );
      }
    }
  }
  writeFileSync(`${outDir}plinko.txt`, lines.join("\n") + "\n");
  console.log(`plinko.txt: ${lines.length} vectors`);
}

// --- Megaways: 60 ordinary seeds + the 6 heaviest of 20,000 ------------------
// line: <seed hex> <total win bp> <rng blocks> <free spins> <payout for 1 SOL>
{
  const BET = 1_000_000_000n;
  const lines: string[] = [];
  const row = (s: Uint8Array) => {
    const o = megawaysEval(s, BET, 0n);
    return `${hex(s)} ${o.totalWinBp} ${o.rngBlocksUsed} ${o.totalFreeSpins} ${o.payout}`;
  };
  for (let i = 0; i < 60; i++) lines.push(row(seed("megaways", i)));
  const heavy: { blocks: number; s: Uint8Array }[] = [];
  for (let i = 1000; i < 21_000; i++) {
    const s = seed("megaways", i);
    const o = megawaysEval(s, BET, 0n);
    heavy.push({ blocks: o.rngBlocksUsed, s });
    heavy.sort((a, b) => b.blocks - a.blocks);
    if (heavy.length > 6) heavy.pop();
  }
  for (const h of heavy) lines.push(row(h.s));
  writeFileSync(`${outDir}megaways.txt`, lines.join("\n") + "\n");
  console.log(
    `megaways.txt: ${lines.length} vectors (heaviest ${heavy[0].blocks} blocks)`
  );
}
