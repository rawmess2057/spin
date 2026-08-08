// Devnet smoke test for the rebuilt integration layer (app/lib/solana/*).
// Places a real Slots bet and a real Dice bet through the exact same
// `spinProgram()` plugin the app uses, waits for the ORAO oracle to fulfil
// randomness, and cross-checks the client-side slotsEval/diceEval math
// against the actual on-chain payout. Run with: npx tsx scripts/smoke-test.ts
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  createClient,
  fetchEncodedAccount,
  lamports,
  createSolanaRpc,
  type TransactionSigner,
} from "@solana/kit";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { systemProgram } from "@solana-program/system";
import {
  getPendingSpinDecoder,
  PendingStatus,
  spinProgram,
} from "../app/lib/solana/client";
import {
  decodeNetworkState,
  decodeRequestAccount,
  findVrfClientPda,
  findVrfNetworkStatePda,
  findVrfRequestPda,
} from "../app/lib/solana/vrf";
import {
  findVrfStatePda,
  findPendingPda,
  SPIN_PROGRAM_ADDRESS,
} from "../app/lib/solana/generated/spin";
import {
  GAME_DICE,
  GAME_DRAGON,
  GAME_MINES,
  GAME_PHARAOH,
  GAME_SLOTS,
} from "../app/lib/solana/config";
import { slotsEval } from "../app/lib/solana/games/slots";
import { diceEval } from "../app/lib/solana/games/dice";
import { pharaohEval } from "../app/lib/solana/games/pharaoh";
import { dragonEval } from "../app/lib/solana/games/dragon";
import { minesEval } from "../app/lib/solana/games/mines";
import { solString } from "../app/lib/solana/format";

const RPC_URL =
  process.env.SOLANA_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53";
const WS_URL =
  process.env.SOLANA_WS_URL ??
  "wss://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53";
const PLAYER_FILE = "/tmp/opencode/spin-player.json";
const ADMIN_FILE = `${homedir()}/.config/solana/id.json`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePlayerFile(): Promise<string> {
  try {
    await readFile(PLAYER_FILE, "utf8");
  } catch {
    throw new Error(
      `No test player keypair at ${PLAYER_FILE}. Create one (standard Solana ` +
        `CLI JSON array format, e.g. \`solana-keygen new --no-bip39-passphrase ` +
        `-o ${PLAYER_FILE}\`) and fund it with devnet SOL before running this script.`
    );
  }
  return PLAYER_FILE;
}

async function main() {
  const playerFile = await ensurePlayerFile();
  const client = await createClient()
    .use(signerFromFile(playerFile))
    .use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL }))
    .use(rpcAirdrop())
    .use(systemProgram())
    .use(spinProgram());

  const player = client.payer as TransactionSigner;
  console.log("player:", player.address);

  // Fund the player if low. Helius blocks requestAirdrop, so use public devnet.
  {
    const { value } = await client.rpc.getBalance(player.address).send();
    if (value < 50_000_000n) {
      const pubRpc = createSolanaRpc("https://api.devnet.solana.com");
      await (
        pubRpc as unknown as {
          requestAirdrop: (
            addr: typeof player.address,
            amount: bigint,
            cfg: object
          ) => { send(): Promise<unknown> };
        }
      )
        .requestAirdrop(player.address, 200_000_000n, {
          commitment: "confirmed",
        })
        .send();
      await sleep(4000);
    }
    const b = await client.rpc.getBalance(player.address).send();
    console.log("player balance:", solString(b.value), "SOL");
  }

  // Top up the ORAO VRF client account if its balance is getting low — it
  // pays the VRF request fee + rent for each `request` PDA.
  const networkStateAddr = await findVrfNetworkStatePda();
  const networkStateAccount = await fetchEncodedAccount(
    client.rpc,
    networkStateAddr
  );
  if (!networkStateAccount.exists)
    throw new Error("ORAO network state not found");
  const networkState = decodeNetworkState(networkStateAccount.data);
  console.log("vrf treasury:", networkState.treasury);

  // The ORAO VRF client account pays each request's fee and PDA rent, and
  // must itself stay rent-exempt. Topping it up is deliberately NOT
  // automatic: doing it silently spends the admin keypair's SOL on every run
  // and — worse — hides a drained client, which is a real failure mode the
  // UI hits (Anchor 2005 ConstraintRentExempt from the ORAO CPI). Opt in
  // with TOP_UP_VRF_CLIENT=1 when you actually intend to spend.
  const [vrfState] = await findVrfStatePda();
  const vrfClientAddr = await findVrfClientPda(SPIN_PROGRAM_ADDRESS, vrfState);
  const vrfClientAccount = await fetchEncodedAccount(client.rpc, vrfClientAddr);
  const needed = networkState.requestFee * 10n + 10_000_000n;
  if (!vrfClientAccount.exists || vrfClientAccount.lamports < needed) {
    const have = vrfClientAccount.exists ? vrfClientAccount.lamports : 0n;
    if (process.env.TOP_UP_VRF_CLIENT !== "1") {
      console.error(
        `\nVRF client ${vrfClientAddr} is low (${solString(have)} SOL).\n` +
          `Bets will fail with Anchor 2005 (ConstraintRentExempt).\n` +
          `Diagnose : npx tsx scripts/diagnose-vrf-client.ts\n` +
          `Fix      : solana transfer ${vrfClientAddr} 0.5 --url devnet --allow-unfunded-recipient\n` +
          `Or re-run this script with TOP_UP_VRF_CLIENT=1 to fund it from ${ADMIN_FILE}.`
      );
      process.exit(3);
    }
    const topUp = needed - have;
    console.log(
      `topping up VRF client ${vrfClientAddr} with ${solString(topUp)} SOL`
    );
    const admin = await client.use(signerFromFile(ADMIN_FILE));
    const sig = await admin.system.instructions
      .transferSol({
        source: admin.payer,
        destination: vrfClientAddr,
        amount: topUp,
      })
      .sendTransaction();
    console.log("fund tx:", sig.context.signature);
    await sleep(1500);
  }

  const results: { game: string; ok: boolean; detail: string }[] = [];

  type GameSpec = {
    key: string;
    id: number;
    target: bigint;
    evalFn: (r: Uint8Array) => {
      multiplierBp: bigint;
      win: boolean;
      cells?: number[];
    };
  };

  const games: GameSpec[] = [
    { key: "slots", id: GAME_SLOTS, target: 0n, evalFn: slotsEval },
    {
      key: "pharaoh",
      id: GAME_PHARAOH,
      target: 0n,
      evalFn: (r) => pharaohEval(r),
    },
    {
      key: "dragon",
      id: GAME_DRAGON,
      target: 0n,
      evalFn: (r) => dragonEval(r),
    },
    { key: "mines", id: GAME_MINES, target: 0n, evalFn: (r) => minesEval(r) },
    {
      key: "dice",
      id: GAME_DICE,
      target: 5000n,
      evalFn: (r) => diceEval(r, 5000n),
    },
  ];

  async function runBet(spec: GameSpec) {
    const { key: game, id: gameId, target } = spec;
    const amount = lamports(1_000_000n); // 0.001 SOL
    const seed = crypto.getRandomValues(new Uint8Array(32));

    console.log(`\n=== ${game} bet ===`);
    const balBefore = (await client.rpc.getBalance(player.address).send())
      .value;

    const sig = await client.spin.instructions
      .placeBet({
        player: player.address,
        authority: player,
        gameId,
        amount,
        target,
        seed,
      })
      .sendTransaction();
    console.log("place_bet tx:", sig.context.signature);

    const [vrfClient] = [vrfClientAddr];
    const requestAddr = await findVrfRequestPda(vrfClient, seed);
    let randomness: Uint8Array | null = null;
    for (let i = 0; i < 40; i++) {
      const acct = await fetchEncodedAccount(client.rpc, requestAddr);
      if (acct.exists) {
        const req = decodeRequestAccount(acct.data);
        if (req.state === "Fulfilled") {
          randomness = req.randomness ?? null;
          console.log(`fulfilled after ~${i * 5}s`);
          break;
        }
      }
      await sleep(5000);
    }
    if (!randomness) {
      results.push({
        game,
        ok: false,
        detail: "timed out waiting for VRF fulfillment",
      });
      return;
    }

    await sleep(3000);
    const [pendingAddr] = await findPendingPda({ seed });
    const pendingAccount = await fetchEncodedAccount(client.rpc, pendingAddr);
    if (!pendingAccount.exists) {
      results.push({
        game,
        ok: false,
        detail: "pending account missing after fulfillment",
      });
      return;
    }
    const pending = getPendingSpinDecoder().decode(pendingAccount.data);
    const balAfter = (await client.rpc.getBalance(player.address).send()).value;
    const actualDelta = balAfter - balBefore;

    const outcome = spec.evalFn(randomness);
    const expectedPayout = outcome.win
      ? (amount * outcome.multiplierBp) / 10_000n
      : 0n;

    // The `pending` PDA is created fresh per bet (`init`, unique seed) and is
    // never closed on the successful resolve_spin path (only refund_spin
    // reclaims it) — so every resolved bet permanently costs the player this
    // account's rent-exemption on top of the stake and tx fee.
    const pendingAccountSize = BigInt(pendingAccount.data.length);
    const pendingRent = await client.rpc
      .getMinimumBalanceForRentExemption(pendingAccountSize)
      .send();
    const txFeeEstimate = 5_000n;
    const expectedDelta = expectedPayout - amount - txFeeEstimate - pendingRent;
    const deltaMatches =
      actualDelta <= expectedDelta + txFeeEstimate &&
      actualDelta >= expectedDelta - txFeeEstimate;

    console.log("pending status:", PendingStatus[pending.status]);
    console.log("outcome:", outcome);
    console.log("expected payout:", solString(expectedPayout), "SOL");
    console.log(
      `pending-account rent (never reclaimed on this path): ${solString(pendingRent)} SOL`
    );
    console.log(
      `balance delta: actual=${actualDelta} expected≈${expectedDelta} (payout - stake - fee - pending rent)`
    );

    const resolved = pending.status === PendingStatus.Resolved;
    results.push({
      game,
      ok: resolved && deltaMatches,
      detail: `resolved=${resolved} deltaMatches=${deltaMatches} actualDelta=${actualDelta} expectedDelta=${expectedDelta}`,
    });
  }

  for (const spec of games) {
    await runBet(spec);
  }

  console.log("\n=== summary ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.game}: ${r.detail}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
