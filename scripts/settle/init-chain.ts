/**
 * Publishes the first chain epoch: init_chain(genesis, length).
 *
 *   npx tsx settle/init-chain.ts [chain.json]
 */
import { fetchAccount, parseChainState } from "../lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "../lib/config.js";
import { sendIx } from "../lib/send.js";
import { chainAddress, initChainIx } from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import { bytesToHex, chainFilePath, hexToBytes, loadChainFile } from "./chain-file.js";

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const file = await loadChainFile(process.argv[2] ?? chainFilePath());

const chain = await chainAddress();
const existing = await fetchAccount(bundle, chain);
if (existing?.data) {
  const s = parseChainState(existing.data);
  console.error(`chain already initialized (epoch ${s.epoch}); use rotate-chain.ts`);
  process.exit(1);
}

console.log("publishing genesis", file.genesis, "length", file.length);
const sig = await sendIx(bundle, signer, await initChainIx(signer.address, hexToBytes(file.genesis), BigInt(file.length)));
console.log("init_chain:", sig);
await sleep(1500);
const acct = await fetchAccount(bundle, chain);
if (!acct?.data) throw new Error("chain account missing after init");
const s = parseChainState(acct.data);
if (bytesToHex(s.commitment) !== file.genesis) throw new Error("on-chain commitment != genesis");
console.log("chain live:", { epoch: s.epoch.toString(), length: s.length.toString(), active: s.active });
console.log("next: npm run settle");
