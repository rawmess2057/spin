/**
 * End-to-end devnet check of the credit-vault flow.
 *
 *   deposit -> set_delegate -> place_bet signed by the SESSION KEY -> resolve
 *
 * This is the only test that exercises the ORAO callback with the new account
 * set (vault + credits + rent_payer) — LiteSVM can't, because the ORAO program
 * isn't loaded there. It also asserts the rent-leak fix: the pending account
 * must no longer exist once the spin resolves.
 *
 *   npx tsx scripts/smoke-vault.ts
 *
 * Env: GAME=slots|dice (default dice), BET_SOL (default 0.02).
 */
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createKeyPairSignerFromBytes, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import {
  fetchAccount,
  parseCreditLedger,
  parseNetworkState,
  parsePlayerVault,
  parseRequestAccount,
} from "./lib/accounts.js";
import { clusterLabel, loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx, sendSystemTransfer } from "./lib/send.js";
import {
  clientAddress,
  creditsAddress,
  depositIx,
  networkStateAddress,
  pendingAddress,
  placeBetIx,
  requestAddress,
  setDelegateIx,
  vaultAddress,
  vrfStateAddress,
  withdrawIx,
} from "./lib/spin.js";
import { createRpcBundle, sleep } from "./lib/util.js";

const PLAYER_FILE = "/tmp/spin-vault-player.json";
const bundle = createRpcBundle(rpcUrl());
const sol = (v: bigint) => `${(Number(v) / 1e9).toFixed(6)} SOL`;

console.log("cluster:", clusterLabel());

// A persistent throwaway player, so repeat runs reuse the same vault.
let player: KeyPairSigner<string>;
try {
  const stored = JSON.parse(await readFile(PLAYER_FILE, "utf8"));
  player = await createKeyPairSignerFromBytes(new Uint8Array(stored), true);
} catch {
  player = await generateKeyPairSigner(true);
  const bytes = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", player.keyPair.privateKey)
  ).slice(-32);
  const pub = new Uint8Array(
    await crypto.subtle.exportKey("raw", player.keyPair.publicKey)
  );
  await writeFile(PLAYER_FILE, JSON.stringify([...bytes, ...pub]));
}
console.log("player: ", player.address);

const admin = await loadKeypairSigner();
const ns = parseNetworkState((await fetchAccount(bundle, await networkStateAddress()))!.data);

// Make sure the player has SOL to buy in with.
{
  const { value } = await bundle.rpc.getBalance(player.address).send();
  if (value < 150_000_000n) {
    console.log("funding player from admin...");
    await sendSystemTransfer(bundle, admin, player.address, 200_000_000n);
    await sleep(2000);
  }
}

// 1. Buy credit -------------------------------------------------------------
const BUY = 100_000_000n; // 0.1 SOL = 1,000 diamonds
const vaultAddr = await vaultAddress(player.address);
const creditsAddr = await creditsAddress();

const creditsBefore = parseCreditLedger((await fetchAccount(bundle, creditsAddr))!.data).total;
console.log(`\ndeposit ${sol(BUY)} ...`);
console.log("  tx:", await sendIx(bundle, player, await depositIx(player.address, BUY)));
await sleep(2000);

let vault = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data);
const creditsAfterDeposit = parseCreditLedger((await fetchAccount(bundle, creditsAddr))!.data).total;
console.log("  vault balance:  ", sol(vault.balance));
console.log("  ledger delta:   ", sol(creditsAfterDeposit - creditsBefore));
if (creditsAfterDeposit - creditsBefore !== BUY) throw new Error("ledger did not track the deposit");

// 2. Arm a session key ------------------------------------------------------
const sessionKey = await generateKeyPairSigner();
const slot = await bundle.rpc.getSlot().send();
const expiry = BigInt(slot) + 200_000n; // ~24h of slots
console.log(`\nset_delegate ${sessionKey.address} (expiry slot ${expiry}) ...`);
console.log(
  "  tx:",
  await sendIx(bundle, player, await setDelegateIx(player.address, sessionKey.address, expiry, BUY))
);
// The session key pays tx fees and the pending account's rent, so it needs a float.
await sendSystemTransfer(bundle, player, sessionKey.address, 20_000_000n);
await sleep(2000);

vault = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data);
console.log("  delegate:       ", vault.delegate);
console.log("  spend left:     ", sol(vault.delegateSpendLeft));
if (vault.delegate !== sessionKey.address) throw new Error("delegate not recorded");

// 3. Bet, signed by the session key — NOT the player ------------------------
const isSlots = process.env.GAME === "slots";
const gameId = isSlots ? 2 : 1;
const amount = BigInt(Math.round(Number(process.env.BET_SOL ?? "0.02") * 1e9));
const target = isSlots ? 0n : 5000n;
const seed = new Uint8Array(randomBytes(32));
const pendingAddr = await pendingAddress(seed);
const vrfState = await vrfStateAddress();
const client = await clientAddress(vrfState);

// Captured rather than assumed: the vault may already carry credit from an
// earlier run of this script.
const vaultBeforeBet = vault.balance;
const capBeforeBet = vault.delegateSpendLeft;
const sessionSolBefore = (await bundle.rpc.getBalance(sessionKey.address).send()).value;
console.log(`\nplace_bet ${sol(amount)} on game ${gameId}, signed by the session key ...`);
const betIx = await placeBetIx(
  player.address,
  seed,
  gameId,
  amount,
  target,
  ns.treasury,
  sessionKey.address
);
console.log("  tx:", await sendIx(bundle, sessionKey, betIx));
await sleep(2000);

vault = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data);
console.log("  vault after bet:", sol(vault.balance));
console.log("  spend left:     ", sol(vault.delegateSpendLeft));
if (vault.balance !== vaultBeforeBet - amount)
  throw new Error("stake was not debited from the vault");
if (vault.delegateSpendLeft !== capBeforeBet - amount)
  throw new Error("spend cap was not decremented");

// 4. Wait for the oracle ----------------------------------------------------
const requestAddr = await requestAddress(client, seed);
console.log("\nwaiting for VRF fulfillment...");
let fulfilled = false;
for (let i = 0; i < 60; i++) {
  const ra = await fetchAccount(bundle, requestAddr);
  if (ra?.data && parseRequestAccount(ra.data).state === "Fulfilled") {
    console.log(`  fulfilled after ~${i * 5}s`);
    fulfilled = true;
    break;
  }
  await sleep(5000);
}
if (!fulfilled) throw new Error("timeout waiting for VRF fulfillment");
await sleep(4000);

// 5. The callback must have credited the vault and closed the pending PDA ---
vault = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data);
const payout = vault.balance - (vaultBeforeBet - amount);
console.log("\nresolved:");
console.log("  vault balance:  ", sol(vault.balance));
console.log("  payout:         ", sol(payout), payout > 0n ? "(win)" : "(loss)");

const pendingAccount = await fetchAccount(bundle, pendingAddr);
if (pendingAccount) {
  throw new Error(
    `pending account ${pendingAddr} still exists — rent leak is NOT fixed ` +
      `(${sol(pendingAccount.lamports)} stranded)`
  );
}
console.log("  pending closed:  yes (rent reclaimed)");

const sessionSolAfter = (await bundle.rpc.getBalance(sessionKey.address).send()).value;
console.log(
  "  session key net:",
  `${Number(sessionSolAfter - sessionSolBefore) / 1e9} SOL (fees minus reclaimed rent)`
);

// 6. Cash out ---------------------------------------------------------------
console.log(`\nwithdraw ${sol(vault.balance)} back to the wallet ...`);
const walletBefore = (await bundle.rpc.getBalance(player.address).send()).value;
console.log("  tx:", await sendIx(bundle, player, await withdrawIx(player.address, vault.balance)));
await sleep(2000);
const walletAfter = (await bundle.rpc.getBalance(player.address).send()).value;

vault = parsePlayerVault((await fetchAccount(bundle, vaultAddr))!.data);
console.log("  wallet delta:   ", sol(walletAfter - walletBefore));
console.log("  vault balance:  ", sol(vault.balance));
if (vault.balance !== 0n) throw new Error("vault was not drained");
if (walletAfter <= walletBefore) throw new Error("SOL did not return to the wallet");

console.log("\nvault flow OK");
