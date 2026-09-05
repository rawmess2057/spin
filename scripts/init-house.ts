import {
  fetchAccount,
  parseGameConfig,
  parseHouseTreasury,
} from "./lib/accounts.js";
import { loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import {
  gameConfigAddress,
  houseAddress,
  initConfigIx,
  initGameConfigIx,
  treasuryDepositIx,
} from "./lib/spin.js";
import { createRpcBundle } from "./lib/util.js";

// Game ids — must match programs/spin/src/constants.rs.
const GAME_PLINKO = 7;
// Bet limits for Plinko, in diamonds.
const PLINKO_MIN_DIAMONDS = 1n;
const PLINKO_MAX_DIAMONDS = 10_000n;
const HOUSE_EDGE_BP = 200;

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();

const authority = signer.address;
console.log("authority:", authority);

const house = await houseAddress();
const existing = await fetchAccount(bundle, house);

if (!existing) {
  console.log("initializing house (init_config)...");
  const sig = await sendIx(bundle, signer, await initConfigIx(authority));
  console.log("init_config:", sig);
} else {
  const t = parseHouseTreasury(existing.data!);
  console.log("house already initialized; authority:", t.authority, "paused:", t.paused);
  if (t.authority !== authority) {
    throw new Error(`treasury authority ${t.authority} != signer ${authority}`);
  }
}

// Top up the bankroll to at least 1 SOL.
const treasury = await fetchAccount(bundle, house);
const current = treasury ? Number(treasury.lamports) : 0;
const target = Number(process.env.TREASURY_SOL ?? "2") * 1e9;
if (current < target) {
  const amount = BigInt(target - current);
  console.log(`funding bankroll: ${Number(amount) / 1e9} SOL`);
  const sig = await sendIx(bundle, signer, await treasuryDepositIx(authority, amount));
  console.log("treasury_deposit:", sig);
} else {
  console.log("bankroll already funded:", current / 1e9, "SOL");
}

// Register the Plinko game config if it isn't already set. Diamonds are
// 1/10000 SOL = 100_000 lamports each, matching lib/diamonds.ts.
const DIAMOND_LAMPORTS = 100_000n;
const cfgAddr = await gameConfigAddress(GAME_PLINKO);
const cfg = await fetchAccount(bundle, cfgAddr);
if (!cfg) {
  console.log(`registering game config for PLINKO (id ${GAME_PLINKO})...`);
  const sig = await sendIx(
    bundle,
    signer,
    await initGameConfigIx(
      authority,
      GAME_PLINKO,
      PLINKO_MIN_DIAMONDS * DIAMOND_LAMPORTS,
      PLINKO_MAX_DIAMONDS * DIAMOND_LAMPORTS,
      HOUSE_EDGE_BP,
      new Uint8Array(32)
    )
  );
  console.log("init_game_config(plinko):", sig);
} else {
  const g = parseGameConfig(cfg.data!);
  console.log("plinko config already registered; min:", g.minBet, "max:", g.maxBet);
}

console.log("\nDone.");
console.log("treasury:", house);
console.log("chain: run chain/init-chain.ts to publish the reveal chain (npx tsx chain/init-chain.ts)");