// Ops diagnostic: reports whether the ORAO VRF client account still has
// enough spendable balance to fund further randomness requests.
//
// That account pays, for every bet, the VRF request fee plus the rent for a
// new `request` PDA — and must itself stay rent-exempt. When it can no
// longer cover both, `place_bet` fails during simulation with Anchor error
// 2005 (ConstraintRentExempt) from inside the ORAO CPI.
//
// Run: npx tsx scripts/diagnose-vrf-client.ts
import { createSolanaRpc, fetchEncodedAccount } from "@solana/kit";
import {
  decodeNetworkState,
  findVrfClientPda,
  findVrfNetworkStatePda,
} from "../app/lib/solana/vrf";
import {
  findVrfStatePda,
  SPIN_PROGRAM_ADDRESS,
} from "../app/lib/solana/generated/spin";

const RPC_URL =
  process.env.SOLANA_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53";

const sol = (n: bigint | number) => `${(Number(n) / 1e9).toFixed(6)} SOL`;

async function main() {
  const rpc = createSolanaRpc(RPC_URL);

  const nsAddr = await findVrfNetworkStatePda();
  const nsAcct = await fetchEncodedAccount(rpc, nsAddr);
  if (!nsAcct.exists) throw new Error("ORAO network state not found");
  const ns = decodeNetworkState(nsAcct.data);

  const [vrfState] = await findVrfStatePda();
  const clientAddr = await findVrfClientPda(SPIN_PROGRAM_ADDRESS, vrfState);
  const clientAcct = await fetchEncodedAccount(rpc, clientAddr);

  console.log("VRF client account:", clientAddr);
  if (!clientAcct.exists) {
    console.error("  MISSING — run scripts/register-client.ts first.");
    process.exit(1);
  }

  const clientRent = await rpc
    .getMinimumBalanceForRentExemption(BigInt(clientAcct.data.length))
    .send();
  const spendable = clientAcct.lamports - clientRent;
  // A fulfilled ORAO request account: 8 disc + bump + slot + client + seed +
  // tag + 64B randomness ≈ 146 bytes.
  const requestRent = await rpc
    .getMinimumBalanceForRentExemption(146n)
    .send();
  const perBet = ns.requestFee + requestRent;

  console.log("  balance          :", sol(clientAcct.lamports));
  console.log("  data size        :", clientAcct.data.length, "bytes");
  console.log("  rent-exempt min  :", sol(clientRent));
  console.log("  spendable        :", sol(spendable));
  console.log();
  console.log("  VRF request fee  :", sol(ns.requestFee));
  console.log("  request PDA rent :", sol(requestRent));
  console.log("  cost per bet     :", sol(perBet));
  console.log();

  const remaining = perBet > 0n ? spendable / perBet : 0n;
  console.log("  bets fundable    :", remaining.toString());
  if (remaining <= 0n) {
    console.error(
      "\n  DRAINED — place_bet will fail with Anchor 2005 (ConstraintRentExempt)."
    );
    console.error(`  Top it up:  solana transfer ${clientAddr} 0.05 --allow-unfunded-recipient`);
    process.exit(2);
  }
  if (remaining < 20n) {
    console.warn("\n  LOW — top up soon to avoid failed bets.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
