/**
 * Generates a fresh commit-reveal chain file.
 *
 *   npx tsx settle/generate-chain.ts [--length=20000] [--out=settle/data/chain.json] [--force]
 *
 * Publish it with init-chain.ts (first epoch) or rotate-chain.ts.
 */
import { access } from "node:fs/promises";
import { chainFilePath, generateChain, saveChainFile } from "./chain-file.js";

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const length = Number(arg("length") ?? 20_000);
const out = arg("out") ?? chainFilePath();
const force = args.includes("--force");

if (!Number.isInteger(length) || length < 1 || length > 1_000_000) {
  console.error("bad length; use --length=N (1..1000000)");
  process.exit(1);
}

let exists = false;
try {
  await access(out);
  exists = true;
} catch {
  // fresh
}
if (exists && !force) {
  console.error(`${out} exists; use --force to overwrite (and re-publish with rotate-chain.ts)`);
  process.exit(1);
}

const chain = generateChain(length);
await saveChainFile(chain, out);
console.log("chain written:", out);
console.log("genesis:", chain.genesis);
console.log("length:", chain.length);
