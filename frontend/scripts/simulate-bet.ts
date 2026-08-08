// Builds a real place_bet transaction through the app's own client plugin
// and simulates it, dumping the program logs. Use to diagnose failures that
// only appear on the UI path.
//
// Run: BET_SOL=0.01 npx tsx scripts/simulate-bet.ts
import { homedir } from "node:os";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  createKeyPairSignerFromBytes,
} from "@solana/kit";
import { readFile } from "node:fs/promises";
import {
  findGameConfigPda,
  getPlaceBetInstructionAsync,
} from "../app/lib/solana/client";
import {
  decodeNetworkState,
  findVrfNetworkStatePda,
} from "../app/lib/solana/vrf";
import { GAME_SLOTS } from "../app/lib/solana/config";
import { fetchEncodedAccount } from "@solana/kit";

const RPC_URL =
  process.env.SOLANA_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53";
const PLAYER_FILE = process.env.KEYPAIR ?? "/tmp/opencode/spin-player.json";

async function main() {
  const rpc = createSolanaRpc(RPC_URL);
  const bytes = JSON.parse(await readFile(PLAYER_FILE, "utf8"));
  const player = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
  const amount = BigInt(
    Math.round(Number(process.env.BET_SOL ?? "0.01") * 1e9)
  );
  console.log("player:", player.address, "bet:", process.env.BET_SOL ?? "0.01");

  const nsAddr = await findVrfNetworkStatePda();
  const nsAcct = await fetchEncodedAccount(rpc, nsAddr);
  if (!nsAcct.exists) throw new Error("no network state");
  const vrfTreasury = decodeNetworkState(nsAcct.data).treasury;

  const config = await findGameConfigPda(GAME_SLOTS);
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const ix = await getPlaceBetInstructionAsync({
    // The player is now an identity account; the signer is the `authority`,
    // which for a self-placed bet is the player's own keypair.
    authority: player,
    player: player.address,
    config,
    vrfTreasury,
    gameId: GAME_SLOTS,
    amount,
    target: 0n,
    seed,
  });

  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(player, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstruction(ix, m)
  );
  const signed = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(signed);

  const sim = await rpc
    .simulateTransaction(wire, { encoding: "base64", sigVerify: false })
    .send();

  console.log(
    "\nerr:",
    JSON.stringify(sim.value.err, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    )
  );
  console.log("units consumed:", sim.value.unitsConsumed);
  console.log("\n--- logs ---");
  for (const line of sim.value.logs ?? []) console.log(line);
  void compileTransaction;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
