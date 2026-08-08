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
  parsePlayerSession,
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
  sessionAddress,
  vrfStateAddress,
} from "./lib/spin.js";
import { createRpcBundle, sleep } from "./lib/util.js";
import { pharaohEval } from "../frontend/app/lib/solana/games/pharaoh.ts";
import { dragonEval } from "../frontend/app/lib/solana/games/dragon.ts";
import { minesEval } from "../frontend/app/lib/solana/games/mines.ts";

const GAMES: Array<{ id: number; name: string; evalFn: (r: Uint8Array) => any }> = [
  { id: 3, name: "pharaoh", evalFn: pharaohEval },
  { id: 4, name: "dragon", evalFn: dragonEval },
  { id: 5, name: "mines", evalFn: minesEval },
];

const bundle = createRpcBundle(rpcUrl());

const nsAcct = await fetchAccount(bundle, await networkStateAddress());
if (!nsAcct || nsAcct.data === null) throw new Error("network state not found");
const ns = parseNetworkState(nsAcct.data);

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

const bal = await bundle.rpc.getBalance(player.address).send();
if (bal.value < 200_000_000n) {
  const { createSolanaRpc } = await import("@solana/kit");
  const pubRpc = createSolanaRpc("https://api.devnet.solana.com");
  await (pubRpc as never as Record<string, (...a: any[]) => { send(): Promise<unknown> }>)
    .requestAirdrop(player.address, 200_000_000n, { commitment: "confirmed" })
    .send();
  await sleep(4000);
}
console.log("player balance:", Number((await bundle.rpc.getBalance(player.address).send()).value) / 1e9, "SOL");

const vrfState = await vrfStateAddress();
const client = await clientAddress(vrfState);
const clientAcct = await fetchAccount(bundle, client);
const needed = ns.requestFee * 10n + 10_000_000n;
if (!clientAcct || clientAcct.lamports < needed) {
  const topUp = needed - (clientAcct ? clientAcct.lamports : 0n);
  console.log(`topping up client ${client} with ${Number(topUp) / 1e9} SOL`);
  const admin = await loadKeypairSigner();
  await sendSystemTransfer(bundle, admin, client, topUp);
  await sleep(1500);
}

const amount = 10_000_000n; // 0.01 SOL

for (const game of GAMES) {
  console.log(`\n=== game ${game.id} (${game.name}) ===`);
  const sessionBefore = await fetchAccount(bundle, await sessionAddress(player.address));
  const wonBefore = sessionBefore
    ? parsePlayerSession(sessionBefore.data!).won
    : 0n;

  const seed = new Uint8Array(randomBytes(32));
  const pending = await pendingAddress(seed);
  const ix = await placeBetIx(player.address, seed, game.id, amount, 0n, ns.treasury);
  const sig = await sendIx(bundle, player, ix);
  console.log("place_bet tx:", sig);

  const requestAddr = await requestAddress(client, seed);
  let randomness: Uint8Array | null = null;
  for (let i = 0; i < 72; i++) {
    const ra = await fetchAccount(bundle, requestAddr);
    if (ra && ra.data) {
      const rv = parseRequestAccount(ra.data);
      if (rv.state === "Fulfilled") {
        randomness = rv.randomness!;
        console.log(`request FULFILLED after ~${i * 5}s`);
        break;
      }
    }
    await sleep(5000);
  }
  if (!randomness) {
    console.error(`REQUEST NEVER FULFILLED (${game.name}) — 360s timeout`);
    continue;
  }

  let status = "waiting";
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const pend = await fetchAccount(bundle, pending);
    if (!pend || pend.data === null) continue;
    const pv = parsePendingSpin(pend.data);
    status = pv.status;
    if (pv.status === "Resolved") {
      console.log(`pending spin RESOLVED after ~${(i + 1) * 5}s`);
      break;
    }
  }
  if (status !== "Resolved") {
    console.error(`PENDING NEVER RESOLVED (${game.name}) — stuck in ${status}`);
    continue;
  }

  const sessionAfter = await fetchAccount(bundle, await sessionAddress(player.address));
  const wonAfter = sessionAfter ? parsePlayerSession(sessionAfter.data!).won : wonBefore;
  const actualPayout = wonAfter - wonBefore;

  const ev = game.evalFn(randomness);
  const mult = Number(ev.multiplierBp) / 10_000;
  const predictedPayout = ev.win
    ? (amount * ev.multiplierBp) / 10_000n
    : 0n;
  console.log(`mirror: win=${ev.win} mult=${mult.toFixed(2)}x cells=[${ev.cells.join(",")}] boards=${ev.boards?.length ?? 1}`);
  console.log(`payout: predicted=${predictedPayout} actual=${actualPayout} ${predictedPayout === actualPayout ? "MATCH" : "MISMATCH"}`);

  if (predictedPayout === actualPayout) {
    console.log(`game ${game.id} (${game.name}): PASS`);
  } else {
    console.error(`game ${game.id} (${game.name}): FAIL`);
  }
}
