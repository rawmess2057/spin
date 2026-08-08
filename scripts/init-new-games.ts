import {
  fetchAccount,
  parseGameConfig,
  parseHouseTreasury,
} from "./lib/accounts.js";
import {
  GAME_DRAGON,
  GAME_MINES,
  GAME_PHARAOH,
  loadKeypairSigner,
  rpcUrl,
} from "./lib/config.js";
import { sendIx } from "./lib/send.js";
import {
  gameConfigAddress,
  houseAddress,
  initGameConfigIx,
} from "./lib/spin.js";
import { createRpcBundle } from "./lib/util.js";

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const authority = signer.address;
console.log("authority:", authority);

const house = await houseAddress();
const treasury = await fetchAccount(bundle, house);
if (!treasury) throw new Error("house not initialized — run init-house.ts first");
const t = parseHouseTreasury(treasury.data!);
if (t.authority !== authority) {
  throw new Error(`treasury authority ${t.authority} != signer ${authority}`);
}

// RTP is baked into each game's on-chain paytable (~95.5%), so the
// separate house edge is 0 bp. Max bet pinned at 75% of the 100x
// bankroll coverage, mirroring the slots config.
const lamports = BigInt(treasury.lamports);
const maxBet = ((lamports / 100n) * 75n) / 100n;
console.log("bankroll:", Number(lamports) / 1e9, "SOL; max bet:", (Number(maxBet) / 1e9).toFixed(4), "SOL");

const games: Array<{ id: number; name: string }> = [
  { id: GAME_PHARAOH, name: "pharaoh" },
  { id: GAME_DRAGON, name: "dragon" },
  { id: GAME_MINES, name: "mines" },
];

for (const { id, name } of games) {
  const config = await gameConfigAddress(id);
  const existing = await fetchAccount(bundle, config);
  if (existing) {
    const c = parseGameConfig(existing.data!);
    console.log(`${name} config exists:`, JSON.stringify({
      min: c.minBet.toString(),
      max: c.maxBet.toString(),
      edge: c.houseEdgeBp,
    }));
    continue;
  }
  console.log(`initializing game config (${name})...`);
  const sig = await sendIx(
    bundle,
    signer,
    await initGameConfigIx(authority, id, 1_000_000n, maxBet, 0, new Uint8Array(32)),
  );
  console.log(`init_game_config (${name}):`, sig);
}

console.log("\nDone.");
