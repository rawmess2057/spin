/**
 * Starts a new chain epoch once every bet is settled or cancelled.
 *
 *   npx tsx settle/rotate-chain.ts [--length=20000]
 *
 * Generates the next chain, publishes it with rotate_chain and swaps the
 * local file (the old one is kept as a timestamped backup). Restart the
 * settlement crank afterwards.
 */
import { rename } from "node:fs/promises";
import { fetchAccount, parseChainState } from "../lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "../lib/config.js";
import { sendIx } from "../lib/send.js";
import { chainAddress, rotateChainIx } from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import { bytesToHex, chainFilePath, generateChain, hexToBytes, saveChainFile } from "./chain-file.js";

const args = process.argv.slice(2);
const length = Number(args.find((a) => a.startsWith("--length="))?.split("=")[1] ?? 20_000);

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const chain = await chainAddress();
const acct = await fetchAccount(bundle, chain);
if (!acct?.data) {
  console.error("no chain on-chain; run init-chain.ts first");
  process.exit(1);
}
const s = parseChainState(acct.data);
const open = s.nextSeq - s.cursor;
console.log("current:", { epoch: s.epoch.toString(), index: `${s.index}/${s.length}`, openBets: open.toString() });
if (open > 0n) {
  console.error("open bets remain; settle or cancel them first (rotate_chain would fail with ChainHasOpenBets)");
  process.exit(1);
}

const path = chainFilePath();
const fresh = generateChain(length);
const sig = await sendIx(bundle, signer, await rotateChainIx(signer.address, hexToBytes(fresh.genesis), BigInt(fresh.length)));
console.log("rotate_chain:", sig);

try {
  await rename(path, `${path}.bak-${Date.now()}`);
} catch {
  // no previous file
}
await saveChainFile(fresh, path);

await sleep(1500);
const after = await fetchAccount(bundle, chain);
if (!after?.data) throw new Error("chain gone after rotate");
const n = parseChainState(after.data);
if (bytesToHex(n.commitment) !== fresh.genesis) throw new Error("on-chain commitment != new genesis");
console.log("rotated:", { epoch: n.epoch.toString(), length: n.length.toString() });
console.log("restart the settlement crank to load the new chain file");
