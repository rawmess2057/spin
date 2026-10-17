/**
 * End-to-end smoke test against the live cluster: deposit a little, place a
 * Plinko bet as the signer, wait for the settlement crank, and check the
 * on-chain payout against the game evaluator's replay.
 *
 *   npm run smoke            (crank must be running: npm run settle)
 */
import { randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";
import {
  fetchAccount,
  parseBetState,
  parseChainState,
  parsePlayerVault,
} from "./lib/accounts.js";
import { DIAMOND_LAMPORTS, GAMES, loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import { betAddress, chainAddress, depositIx, placeBetIx, vaultAddress } from "./lib/spin.js";
import { createRpcBundle, sleep } from "./lib/util.js";

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const player = signer.address;
console.log("player:", player);

const vaultAddr = await vaultAddress(player);
let vault = await fetchAccount(bundle, vaultAddr);
const stake = 1n * DIAMOND_LAMPORTS;
if (!vault?.data || parsePlayerVault(vault.data).balance < stake) {
  console.log("depositing 0.02 SOL…");
  console.log("  ", await sendIx(bundle, signer, await depositIx(player, 20_000_000n)));
  vault = await fetchAccount(bundle, vaultAddr);
}
const before = parsePlayerVault(vault!.data!).balance;
console.log("vault balance:", before.toString(), "lamports");

const betAddr = await betAddress(player);
const prev = await fetchAccount(bundle, betAddr);
const prevNonce = prev?.data ? parseBetState(prev.data).nonce : 0n;

const chain = parseChainState((await fetchAccount(bundle, await chainAddress()))!.data!);
console.log("chain:", { epoch: chain.epoch.toString(), index: chain.index.toString(), open: (chain.nextSeq - chain.cursor).toString() });

// Plinko, 8 rows, Low risk: target = (8 << 8) | 0
const target = (8n << 8n) | 0n;
const clientSeed = new Uint8Array(randomBytes(32));
const t0 = Date.now();
const sig = await sendIx(bundle, signer, await placeBetIx(player, player, GAMES.PLINKO, stake, target, clientSeed));
console.log("place_bet:", sig, `(${Date.now() - t0} ms)`);

for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const acct = await fetchAccount(bundle, betAddr);
  if (!acct?.data) continue;
  const bet = parseBetState(acct.data);
  if (bet.nonce === prevNonce + 1n && bet.status !== "Open") {
    console.log(`settled after ${Date.now() - t0} ms:`, {
      status: bet.status,
      roll: bet.roll.toString(),
      payout: bet.payout.toString(),
      revealIndex: bet.revealIndex.toString(),
    });
    // Replay: randomness = sha256(reveal‖seed‖player‖nonce) ‖ sha256(..); bucket = popcount of first 8 bits.
    const nonce = new Uint8Array(8);
    new DataView(nonce.buffer).setBigUint64(0, bet.nonce, true);
    const r1 = sha256(new Uint8Array([...bet.reveal, ...clientSeed, ...bs58.decode(player), ...nonce]));
    let rights = 0;
    for (let b = 0; b < 8; b++) if (r1[0] & (1 << b)) rights++;
    console.log("replayed bucket:", rights, bet.roll === BigInt(rights) ? "✓ matches" : "✗ MISMATCH");
    // Chain link: sha256(reveal) must equal the commitment recorded at placement.
    const linked = Buffer.from(sha256(bet.reveal)).equals(Buffer.from(bet.commitment));
    console.log("reveal hashes to commitment:", linked ? "✓" : "✗");
    const after = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data!).balance;
    console.log("vault:", before.toString(), "→", after.toString(), `(stake ${stake}, payout ${bet.payout})`);
    process.exit(bet.status === "Settled" && bet.roll === BigInt(rights) && linked ? 0 : 1);
  }
}
console.error("bet did not settle within 60 s — is the crank running?");
process.exit(1);
