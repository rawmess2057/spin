import {
  fetchAccount,
  parseGameConfig,
  parseHouseTreasury,
} from "./lib/accounts.js";
import { GAME_DICE, GAME_SLOTS, loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import {
  gameConfigAddress,
  houseAddress,
  initConfigIx,
  initGameConfigIx,
  treasuryDepositIx,
} from "./lib/spin.js";
import { createRpcBundle } from "./lib/util.js";

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

const gameConfig = await gameConfigAddress(GAME_DICE);
const gc = await fetchAccount(bundle, gameConfig);
if (!gc) {
  console.log("initializing game config (dice)...");
  const params = new Uint8Array(32);
  // [min_target u16][max_target u16] LE
  new DataView(params.buffer).setUint16(0, 101, true);
  new DataView(params.buffer).setUint16(2, 9800, true);
  const sig = await sendIx(
    bundle,
    signer,
    await initGameConfigIx(authority, GAME_DICE, 1_000_000n, 1_000_000_000n, 200, params),
  );
  console.log("init_game_config:", sig);
} else {
  const c = parseGameConfig(gc.data!);
  console.log("game config exists:", JSON.stringify({ min: c.minBet.toString(), max: c.maxBet.toString(), edge: c.houseEdgeBp }));
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

// Neon Slots game config (game 2). Config is immutable, so the max bet is
// pinned once, from the bankroll available at init time: the program caps a
// single bet at 1/100th of the treasury (100x payout coverage).
const slotsConfig = await gameConfigAddress(GAME_SLOTS);
const sc = await fetchAccount(bundle, slotsConfig);
if (!sc) {
  const finalTreasury = await fetchAccount(bundle, house);
  const lamports = finalTreasury ? BigInt(finalTreasury.lamports) : 0n;
  const maxBet = (lamports / 100n) * 75n / 100n; // 75% of the 100x coverage
  console.log("initializing game config (slots)... max bet:", (Number(maxBet) / 1e9).toFixed(4), "SOL");
  const sig = await sendIx(
    bundle,
    signer,
    await initGameConfigIx(authority, GAME_SLOTS, 1_000_000n, maxBet, 200, new Uint8Array(32)),
  );
  console.log("init_game_config:", sig);
} else {
  const c = parseGameConfig(sc.data!);
  console.log("slots game config exists:", JSON.stringify({ min: c.minBet.toString(), max: c.maxBet.toString(), edge: c.houseEdgeBp }));
}

console.log("\nDone.");
console.log("treasury:", house);
console.log("vrf_state PDA: see orao-info");