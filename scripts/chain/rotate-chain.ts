import { rename } from "node:fs/promises";
import { fetchAccount, parseChainState } from "../lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "../lib/config.js";
import { sendIx } from "../lib/send.js";
import { chainAddress, initChainIx } from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import {
  chainFilePath,
  generateChain,
  hexToBytes,
  loadChainFile,
  saveChainFile,
} from "./lib/chain-file.js";

// Rotates the on-chain reveal chain once the current one is exhausted:
// backs up the old chain file, generates a new chain, and publishes it with
// init_chain (the program only allows rotation when the old chain is inactive
// or fully consumed — ChainStillActive otherwise).
//
// Usage: npx tsx chain/rotate-chain.ts [--length 20000]

const args = process.argv.slice(2);
const lengthArg = args.find((a) => a.startsWith("--length="))?.split("=")[1];
const length = lengthArg ? Number(lengthArg) : 20_000;
if (!Number.isInteger(length) || length < 1 || length > 100_000) {
  console.error("bad length; use --length=N (1..100000)");
  process.exit(1);
}

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();

const chain = await chainAddress();
const acct = await fetchAccount(bundle, chain);
if (!acct || acct.data === null) {
  console.error("no chain on-chain; use init-chain.ts instead");
  process.exit(1);
}
const s = parseChainState(acct.data);
console.log("current chain:", JSON.stringify({
  index: s.index.toString(),
  length: s.length.toString(),
  active: s.active,
  seed: Buffer.from(s.seed).toString("hex").slice(0, 16) + "…",
}));
if (s.active && s.index < s.length) {
  console.error(`chain still active at ${s.index}/${s.length}; rotate only when exhausted`);
  process.exit(1);
}

const oldPath = chainFilePath();
const backup = `${oldPath}.bak-${Date.now()}`;
try {
  const old = await loadChainFile(oldPath);
  await rename(oldPath, backup);
  console.log("backed up old chain:", backup, `(seed ${old.seed.slice(0, 16)}…)`);
} catch {
  console.warn("no local chain file to back up");
}

const fresh = await generateChain(length);
await saveChainFile(fresh);
console.log("new chain:", JSON.stringify({
  seed: fresh.seed,
  length: fresh.length,
  reveal0: fresh.reveals[0].slice(0, 16) + "…",
}));

const sig = await sendIx(
  bundle,
  signer,
  await initChainIx(signer.address, hexToBytes(fresh.seed), BigInt(fresh.length)),
);
console.log("init_chain:", sig);

await sleep(2000);
const after = await fetchAccount(bundle, chain);
if (!after || after.data === null) throw new Error("chain gone after rotate");
const n = parseChainState(after.data);
const onChainSeed = Buffer.from(n.seed).toString("hex");
if (onChainSeed !== fresh.seed) {
  throw new Error(`on-chain seed mismatch: ${onChainSeed.slice(0, 16)}… != ${fresh.seed.slice(0, 16)}…`);
}
console.log("rotated:", JSON.stringify({
  index: n.index.toString(),
  length: n.length.toString(),
  active: n.active,
  vrfEnabled: n.vrfEnabled,
}));
console.log("restart serve.ts to pick up the new chain file (or it self-heals on the next poll after restart).");
