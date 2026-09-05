import { fetchAccount, parseChainState } from "../lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "../lib/config.js";
import { sendIx } from "../lib/send.js";
import { chainAddress, initChainIx } from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import { chainFilePath, hexToBytes, loadChainFile } from "./lib/chain-file.js";

// Publishes the generated chain on-chain: init_chain(seed, length) signed by
// the house authority. Also switches the house into chain mode (vrf_enabled
// starts false) — the migration is deploy + init_chain.
//
// Usage: npx tsx chain/init-chain.ts [chain.json]

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();

const chainFile = await loadChainFile(process.argv[2] ?? chainFilePath());
const chain = await chainAddress();
const existing = await fetchAccount(bundle, chain);

if (existing && existing.data !== null) {
  const s = parseChainState(existing.data);
  console.log("existing chain:", JSON.stringify({
    index: s.index.toString(),
    length: s.length.toString(),
    active: s.active,
    vrfEnabled: s.vrfEnabled,
    seed: Buffer.from(s.seed).toString("hex").slice(0, 16) + "…",
  }));
  if (s.active && s.index < s.length) {
    console.error("chain still active with reveals left; init_chain would fail with ChainStillActive.");
    console.error("rotate only when index >= length (see rotate-chain.ts).");
    process.exit(1);
  }
}

console.log("publishing chain:");
console.log("  seed:", chainFile.seed);
console.log("  length:", chainFile.length);

const sig = await sendIx(
  bundle,
  signer,
  await initChainIx(signer.address, hexToBytes(chainFile.seed), BigInt(chainFile.length)),
);
console.log("init_chain:", sig);

await sleep(2000);
const acct = await fetchAccount(bundle, chain);
if (!acct || acct.data === null) throw new Error("chain account not found after init");
const s = parseChainState(acct.data);
const onChainSeed = Buffer.from(s.seed).toString("hex");
if (onChainSeed !== chainFile.seed) {
  throw new Error(`on-chain seed mismatch: ${onChainSeed.slice(0, 16)}… != ${chainFile.seed.slice(0, 16)}…`);
}
console.log("chain live:", JSON.stringify({
  index: s.index.toString(),
  length: s.length.toString(),
  active: s.active,
  vrfEnabled: s.vrfEnabled,
  seed: onChainSeed,
}));
console.log("next: npx tsx chain/serve.ts");
