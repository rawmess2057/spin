import { readFile } from "node:fs/promises";
import {
  chainFilePath,
  generateChain,
  saveChainFile,
  type ChainFile,
} from "./lib/chain-file.js";

// Generates a fresh reveal chain (random 32-byte seed + N reveals) and writes
// it to scripts/chain/data/chain.json. The seed is published on-chain by
// init-chain.ts; the reveals are served one at a time by serve.ts.
//
// Usage: npx tsx chain/generate-chain.ts [--length 20000] [--force]

const args = process.argv.slice(2);
const lengthArg = args.find((a) => a.startsWith("--length="))?.split("=")[1];
const force = args.includes("--force");
const length = lengthArg ? Number(lengthArg) : 20_000;

if (!Number.isInteger(length) || length < 1 || length > 100_000) {
  console.error("bad length; use --length=N (1..100000)");
  process.exit(1);
}

const path = chainFilePath();

let exists = false;
try {
  const prev = JSON.parse(await readFile(path, "utf8")) as ChainFile;
  exists = prev.seed.length === 64;
} catch {
  // fresh
}

if (exists && !force) {
  console.error(
    `chain file exists (seed ${(JSON.parse(await readFile(path, "utf8")) as ChainFile).seed.slice(0, 12)}…). ` +
      "Use --force to overwrite (run init-chain.ts afterwards to publish the new seed).",
  );
  process.exit(1);
}

const chain = await generateChain(length);
await saveChainFile(chain, path);
console.log("chain written:", path);
console.log("seed:", chain.seed);
console.log("length:", chain.length);
console.log("reveal[0]:", chain.reveals[0]);
console.log("next: npx tsx chain/init-chain.ts");
