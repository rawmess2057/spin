/**
 * Creates the global credit ledger PDA (["credits"]).
 *
 * One-time bootstrap, required before any player can `deposit`. The ledger
 * tracks the sum of every player's vault balance so `treasury_withdraw` can
 * refuse to hand the house money it owes players.
 *
 *   npx tsx scripts/init-credits.ts
 */
import { fetchAccount, parseCreditLedger } from "./lib/accounts.js";
import { clusterLabel, loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import { creditsAddress, initCreditsIx } from "./lib/spin.js";
import { createRpcBundle } from "./lib/util.js";

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();

console.log("cluster:  ", clusterLabel());
console.log("authority:", signer.address);

const credits = await creditsAddress();
console.log("credits:  ", credits);

const existing = await fetchAccount(bundle, credits);
if (existing?.data) {
  const ledger = parseCreditLedger(existing.data);
  console.log(
    `already initialized — outstanding player credits: ${
      Number(ledger.total) / 1e9
    } SOL`
  );
} else {
  console.log("initializing credit ledger (init_credits)...");
  const sig = await sendIx(bundle, signer, await initCreditsIx(signer.address));
  console.log("init_credits:", sig);

  const created = await fetchAccount(bundle, credits);
  if (!created?.data) throw new Error("credit ledger was not created");
  console.log("total:", parseCreditLedger(created.data).total.toString());
}
