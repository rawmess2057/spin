import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import {
  createKeyPairSignerFromBytes,
  type KeyPairSigner,
} from "@solana/kit";
import {
  fetchAccount,
  parseNetworkState,
  parsePendingSpin,
  parseRequestAccount,
} from "./lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx, sendSystemTransfer } from "./lib/send.js";
import {
  clientAddress,
  networkStateAddress,
  pendingAddress,
  placeBetIx,
  requestAddress,
  slotsEval,
  vrfStateAddress,
} from "./lib/spin.js";
import { createRpcBundle, sleep } from "./lib/util.js";

const bundle = createRpcBundle(rpcUrl());

const nsAcct = await fetchAccount(bundle, await networkStateAddress());
if (!nsAcct || nsAcct.data === null) throw new Error("network state not found");
const ns = parseNetworkState(nsAcct.data);
console.log("vrf treasury:", ns.treasury);

// --- player ----------------------------------------------------------------
const PLAYER_FILE = "/tmp/opencode/spin-player.json";
let player: KeyPairSigner<string>;
try {
  const stored = JSON.parse(await readFile(PLAYER_FILE, "utf8"));
  player = await createKeyPairSignerFromBytes(new Uint8Array(stored));
} catch {
  const kp = Keypair.generate();
  await writeFile(PLAYER_FILE, JSON.stringify([...kp.secretKey]));
  player = await createKeyPairSignerFromBytes(new Uint8Array(kp.secretKey));
}
console.log("player:", player.address);

// fund player
{
  const { value } = await bundle.rpc.getBalance(player.address).send();
  if (value < 200_000_000n) {
    // Helius blocks requestAirdrop; use the public devnet endpoint.
    const { createSolanaRpc } = await import("@solana/kit");
    const pubRpc = createSolanaRpc("https://api.devnet.solana.com");
    await (pubRpc as never as Record<string, (...a: any[]) => { send(): Promise<unknown> }>)
      .requestAirdrop(player.address, 200_000_000n, { commitment: "confirmed" })
      .send();
    await sleep(4000);
  }
  const b = await bundle.rpc.getBalance(player.address).send();
  console.log("player balance:", Number(b.value) / 1e9, "SOL");
}

// fund the ORAO client so request rent+fee can be paid from it
const vrfState = await vrfStateAddress();
const client = await clientAddress(vrfState);
const clientAcct = await fetchAccount(bundle, client);
const needed = ns.requestFee * 10n + 10_000_000n;
if (!clientAcct || clientAcct.lamports < needed) {
  const topUp = needed - (clientAcct ? clientAcct.lamports : 0n);
  console.log(`topping up client ${client} with ${Number(topUp) / 1e9} SOL`);
  const admin = await loadKeypairSigner();
  const sig = await sendSystemTransfer(bundle, admin, client, topUp);
  console.log("fund:", sig);
  await sleep(1500);
}

// bet ----------------------------------------------------------------------
const isSlots = process.env.GAME === "slots";
const gameId = isSlots ? 2 : 1;
const amount = BigInt(Math.round(Number(process.env.BET_SOL ?? "0.05") * 1e9));
const target = isSlots ? 0n : BigInt(Number(process.env.TARGET ?? "500"));
const seed = new Uint8Array(randomBytes(32));

const pending = await pendingAddress(seed);
const ix = await placeBetIx(player.address, seed, gameId, amount, target, ns.treasury);
const sig = await sendIx(bundle, player, ix);
console.log("place_bet tx:", sig);

const requestAddr = await requestAddress(client, seed);
console.log("request:", requestAddr);

let randomness: Uint8Array | null = null;
for (let i = 0; i < 60; i++) {
  const ra = await fetchAccount(bundle, requestAddr);
  if (ra && ra.data) {
    const rv = parseRequestAccount(ra.data);
    if (rv.state === "Fulfilled") {
      randomness = rv.randomness!;
      console.log(`fulfilled after ~${i * 5}s`);
      break;
    }
  }
  await sleep(5000);
}
if (!randomness) {
  console.error("timeout waiting for VRF fulfillment");
  process.exit(2);
}

await sleep(3000);
const pend = await fetchAccount(bundle, pending);
if (!pend || pend.data === null) throw new Error("pending missing");
const pv = parsePendingSpin(pend.data);
console.log("\npending spin:");
console.log("  status:", pv.status);
console.log("  amount:", pv.amount.toString(), "target:", pv.target.toString());

const playerBal = (await bundle.rpc.getBalance(player.address).send()).value;
console.log("player balance:", Number(playerBal) / 1e9, "SOL");

// independent outcome check (mirrors the on-chain evaluation)
const raw = new DataView(randomness.buffer, randomness.byteOffset, 8).getBigUint64(0, true);
let expectedPayout: number;
if (isSlots) {
  const ev = slotsEval(randomness);
  const mult = Number(ev.multiplierBp);
  const win = ev.multiplierBp > 0n;
  expectedPayout = win ? Math.floor((Number(amount) * mult) / 10_000) : 0;
  console.log(
    `slots symbols=[${ev.symbols.join(",")}] mult=${(mult / 10000).toFixed(2)}x expected payout=${expectedPayout}`,
  );
} else {
  const roll = Number(raw % 10_000n);
  const won = roll < Number(target);
  const mult = Math.floor(98_000_000 / Number(target));
  expectedPayout = won ? Math.floor((Number(amount) * mult) / 10_000) : 0;
  console.log(`roll=${roll} won=${won} expected payout=${expectedPayout}`);
}