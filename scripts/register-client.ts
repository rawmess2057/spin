import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AnchorProvider, Wallet, web3 } from "@coral-xyz/anchor";
import {
  OraoCb,
  RegisterBuilder,
  clientAddress,
} from "@orao-network/solana-vrf-cb";
import { PROGRAM_ID, SEEDS, rpcUrl } from "./lib/config.js";
import { sleep } from "./lib/util.js";
import { vrfStateAddress } from "./lib/spin.js";

const SIGNATURE = process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`;

async function main() {
  // Anchor/web3 v1 world (ORAO SDK is built on web3 v1).
  const raw = JSON.parse(readFileSync(SIGNATURE, "utf8"));
  const keypair = web3.Keypair.fromSecretKey(new Uint8Array(raw));
  const wallet = new Wallet(keypair);
  const connection = new web3.Connection(rpcUrl(), "confirmed");
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const vrf = new OraoCb(provider);
  const program = new web3.PublicKey(PROGRAM_ID);

  const stateAddrStr = await vrfStateAddress();
  const stateAddr = new web3.PublicKey(stateAddrStr);

  // Recompute the vrf_state bump (needed as the last state seed element).
  const bump = await vrfStateBump();
  console.log("vrf_state:", stateAddrStr, "bump:", bump);

  const [client] = clientAddress(program, stateAddr);
  console.log("client:", client.toBase58());

  const existing = await vrf.getClient(client).catch(() => null);
  if (existing) {
    console.log("client already registered");
  } else {
    // state seeds must include the bump as the last element
    const stateSeeds = [Buffer.from(SEEDS.VRF_STATE), Buffer.from([bump])];
    const builder = new RegisterBuilder(vrf, program, stateAddr, stateSeeds);
    const sig = await builder.withComputeUnitLimit(200_000).rpc();
    console.log("register tx:", sig);
  }

  // Fund the client so it can pay request fees and account rent.
  const networkState = await vrf.getNetworkState();
  const fee = networkState.config.requestFee.toNumber();
  const ourBal = BigInt((await vrf.clientBalance(client)).toString());
  const target = BigInt(fee) * 5n + 1_000_000n;
  if (ourBal < target) {
    const topUp = target - ourBal;
    console.log("client balance:", ourBal.toString(), "; topping up:", topUp.toString());
    const tx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: client,
        lamports: topUp,
      }),
    );
    tx.feePayer = keypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const sig2 = await web3.sendAndConfirmTransaction(connection, tx, [keypair]);
    console.log("fund tx:", sig2);
  }

  await sleep(1000);
  console.log("final client balance:", (await vrf.clientBalance(client)).toString());
}

async function vrfStateBump(): Promise<number> {
  const { getProgramDerivedAddress } = await import("@solana/kit");
  const [, bump] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID as never,
    seeds: [new TextEncoder().encode(SEEDS.VRF_STATE)],
  });
  return Number(bump);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});