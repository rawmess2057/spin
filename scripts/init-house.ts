/**
 * Bootstraps (or tops up) the house on the configured cluster:
 *   1. init_config        — treasury PDA (once)
 *   2. treasury_deposit   — fund the bankroll up to TREASURY_SOL (default 10)
 *   3. init_credits       — credit ledger (once), seeded with the sum of any
 *                           existing player vaults so nothing owed is forgotten
 *   4. init_game_config   — register every game the program knows
 *
 *   npx tsx init-house.ts        (env: TREASURY_SOL, SOLANA_RPC_URL, KEYPAIR)
 */
import {
  fetchAccount,
  fetchProgramAccounts,
  parseCreditLedger,
  parseGameConfig,
  parseHouseTreasury,
  parsePlayerVault,
} from "./lib/accounts.js";
import { DIAMOND_LAMPORTS, GAMES, PROGRAM_ID, clusterLabel, loadKeypairSigner, rpcUrl } from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import {
  creditsAddress,
  gameConfigAddress,
  houseAddress,
  initConfigIx,
  initCreditsIx,
  initGameConfigIx,
  treasuryDepositIx,
} from "./lib/spin.js";
import { createRpcBundle } from "./lib/util.js";

/**
 * Bet limits per game, in diamonds. Max bets are sized so a max-multiplier
 * win fits the bankroll guard (max payout ≤ free bankroll / 4): Plinko's
 * steepest table pays ~921×, so 100 💎 × 921 ≈ 9.2 SOL needs ~37 SOL free.
 * Raise these as the bankroll grows (set_game_limits).
 */
const GAME_LIMITS: { id: number; name: string; min: bigint; max: bigint }[] = [
  { id: GAMES.PLINKO, name: "plinko", min: 1n, max: 100n },
  // Megaways caps at 10,000×, so the bankroll guard (not this max) is what
  // limits bets on a small devnet treasury; the UI shows the live cap.
  { id: GAMES.MEGAWAYS, name: "megaways", min: 1n, max: 100n },
];

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const authority = signer.address;
console.log("cluster:  ", clusterLabel());
console.log("authority:", authority);

// 1. Treasury
const house = await houseAddress();
const existing = await fetchAccount(bundle, house);
if (!existing) {
  console.log("init_config…");
  console.log("  ", await sendIx(bundle, signer, await initConfigIx(authority)));
} else {
  const t = parseHouseTreasury(existing.data!);
  console.log("treasury exists; authority:", t.authority, "paused:", t.paused);
  if (t.authority !== authority) throw new Error(`treasury authority ${t.authority} != signer ${authority}`);
}

// 2. Bankroll
const current = Number((await fetchAccount(bundle, house))?.lamports ?? 0n);
const target = Number(process.env.TREASURY_SOL ?? "10") * 1e9;
if (current < target) {
  const amount = BigInt(target - current);
  console.log(`treasury_deposit ${Number(amount) / 1e9} SOL…`);
  console.log("  ", await sendIx(bundle, signer, await treasuryDepositIx(authority, amount)));
} else {
  console.log("bankroll:", current / 1e9, "SOL");
}

// 3. Ledger
const credits = await creditsAddress();
const ledger = await fetchAccount(bundle, credits);
if (!ledger?.data) {
  const vaults = await fetchProgramAccounts(bundle, PROGRAM_ID, "PlayerVault");
  const owed = vaults.reduce((acc, v) => acc + parsePlayerVault(v.data).balance, 0n);
  console.log(`init_credits with ${vaults.length} existing vault(s), ${Number(owed) / 1e9} SOL owed…`);
  console.log("  ", await sendIx(bundle, signer, await initCreditsIx(authority, owed)));
} else {
  const l = parseCreditLedger(ledger.data);
  console.log("ledger exists; owed:", Number(l.total) / 1e9, "SOL reserved:", Number(l.reserved) / 1e9, "SOL");
}

// 4. Games
for (const g of GAME_LIMITS) {
  const addr = await gameConfigAddress(g.id);
  const cfg = await fetchAccount(bundle, addr);
  if (!cfg?.data) {
    console.log(`init_game_config ${g.name} (id ${g.id}) ${g.min}–${g.max} 💎…`);
    console.log(
      "  ",
      await sendIx(bundle, signer, await initGameConfigIx(authority, g.id, g.min * DIAMOND_LAMPORTS, g.max * DIAMOND_LAMPORTS)),
    );
  } else {
    const c = parseGameConfig(cfg.data);
    console.log(`${g.name}: registered, ${c.minBet / DIAMOND_LAMPORTS}–${c.maxBet / DIAMOND_LAMPORTS} 💎${c.paused ? " (paused)" : ""}`);
  }
}

console.log("\ntreasury:", house);
console.log("next: npm run generate-chain && npm run init-chain && npm run settle");
