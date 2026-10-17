/**
 * Settlement crank: settles open bets, in FIFO order, with the house's next
 * reveal.
 *
 * Position is never cached locally — the on-chain `ChainState.commitment` is
 * looked up in the chain file to find the next reveal, so a restart, a
 * dropped tx or a reorg all self-heal on the next pass. Open bets are
 * discovered through a `programNotifications` subscription (fast path) and a
 * periodic getProgramAccounts reconciliation (safety net).
 *
 *   npm run settle        (env: SOLANA_RPC_URL, SOLANA_WS_URL, KEYPAIR, CHAIN_FILE,
 *                               HEALTH_PORT=8788, POLL_MS=5000)
 *   GET http://127.0.0.1:8788/health
 */
import { createServer } from "node:http";
import bs58 from "bs58";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getSignatureFromTransaction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from "@solana/kit";
import {
  BET_STATE_SIZE,
  BET_STATUS_OFFSET,
  accountDiscriminator,
  fetchAccount,
  fetchProgramAccounts,
  parseBetState,
  parseChainState,
  type BetStateData,
} from "../lib/accounts.js";
import { GAMES, PROGRAM_ID, loadKeypairSigner, rpcUrl } from "../lib/config.js";
import {
  cancelBetIx,
  chainAddress,
  setComputeUnitLimitIx,
  setComputeUnitPriceIx,
  settleBetIx,
} from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import { getSubscriptions } from "../lib/ws.js";
import { bytesToHex, chainFilePath, hexToBytes, indexByValue, loadChainFile } from "./chain-file.js";

const POLL_MS = Number(process.env.POLL_MS ?? "5000");
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? "8788");
const BET_TIMEOUT_SLOTS = 150n; // mirrors constants.rs
const PRIORITY_FEE_MICRO_LAMPORTS = BigInt(process.env.PRIORITY_FEE ?? "1000");

/** Compute units requested per game; Megaways cascades need the most. */
const CU_LIMIT: Record<number, number> = {
  [GAMES.PLINKO]: 100_000,
  [GAMES.MEGAWAYS]: 1_400_000,
  [GAMES.WHEEL]: 100_000,
  [GAMES.HOLD_SPIN]: 600_000,
};

const bundle = createRpcBundle(rpcUrl());
const signer = await loadKeypairSigner();
const chainPda = await chainAddress();

const file = await loadChainFile(chainFilePath());
const position = indexByValue(file);
console.log(`[settle] chain file: genesis ${file.genesis.slice(0, 16)}… length ${file.length}`);
console.log(`[settle] cranker: ${signer.address}`);

type Health = {
  epoch: string;
  index: string;
  length: string;
  openBets: number;
  cursor: string;
  stalls: string;
  lastSettleAgoMs: number | null;
  lastError: string | null;
  chainFileOk: boolean;
};
const health: Health = {
  epoch: "0",
  index: "0",
  length: "0",
  openBets: 0,
  cursor: "0",
  stalls: "0",
  lastSettleAgoMs: null,
  lastError: null,
  chainFileOk: true,
};
let lastSettleAt: number | null = null;

// Open bets by player address; refreshed by both discovery paths.
const openBets = new Map<string, BetStateData>();

function noteBet(address: string, data: Uint8Array) {
  const bet = parseBetState(data);
  if (bet.status === "Open") openBets.set(bet.player, bet);
  else openBets.delete(bet.player);
  void address;
}

async function reconcile(): Promise<void> {
  const accounts = await fetchProgramAccounts(bundle, PROGRAM_ID, "BetState", [
    { offset: BET_STATUS_OFFSET, bytes: Uint8Array.of(1) }, // status == Open
  ]);
  const seen = new Set<string>();
  for (const a of accounts) {
    if (a.data.length !== BET_STATE_SIZE) continue;
    const bet = parseBetState(a.data);
    seen.add(bet.player);
    openBets.set(bet.player, bet);
  }
  for (const player of [...openBets.keys()]) {
    if (!seen.has(player)) openBets.delete(player);
  }
}

async function sendIxs(ixs: ReturnType<typeof setComputeUnitLimitIx>[]): Promise<string> {
  const { value: bh } = await bundle.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    appendTransactionMessageInstructions(
      ixs as never,
      setTransactionMessageFeePayerSigner(signer as never, createTransactionMessage({ version: 0 })),
    ),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  await bundle.sendAndConfirm(signed as never, { commitment: "confirmed" });
  return signature;
}

function errorCode(err: unknown): number | null {
  const msg = err instanceof Error ? `${err.message} ${JSON.stringify((err as { context?: unknown }).context ?? {})}` : String(err);
  const m = /[Cc]ustom program error: (0x[0-9a-fA-F]+|#?\d+)/.exec(msg) ?? /"Custom":\s*"?(\d+)"?/.exec(msg);
  if (!m) return null;
  return m[1].startsWith("0x") ? parseInt(m[1], 16) : parseInt(m[1].replace("#", ""), 10);
}

/** One settlement pass: read the chain, settle the head bet if we hold its reveal. */
async function pass(): Promise<void> {
  const acct = await fetchAccount(bundle, chainPda);
  if (!acct?.data) {
    health.lastError = "chain account not found";
    return;
  }
  const chain = parseChainState(acct.data);
  health.epoch = chain.epoch.toString();
  health.index = chain.index.toString();
  health.length = chain.length.toString();
  health.cursor = chain.cursor.toString();
  health.stalls = chain.stalls.toString();
  health.openBets = Number(chain.nextSeq - chain.cursor);

  const commitmentHex = bytesToHex(chain.commitment);
  const idx = position.get(commitmentHex);
  if (idx === undefined) {
    health.chainFileOk = false;
    health.lastError = `on-chain commitment ${commitmentHex.slice(0, 16)}… not in chain file (rotated elsewhere?)`;
    console.error("[settle]", health.lastError);
    return;
  }
  health.chainFileOk = true;
  if (chain.length - chain.index < 500n) {
    console.warn(`[settle] chain nearly exhausted: ${chain.index}/${chain.length} — rotate soon`);
  }
  if (chain.nextSeq === chain.cursor) return; // nothing open

  const slot = BigInt(await bundle.rpc.getSlot({ commitment: "confirmed" }).send());
  let head: BetStateData | null = null;
  for (const bet of openBets.values()) {
    if (bet.chainEpoch !== chain.epoch) {
      // Unsettleable: cancel as a courtesy once it has timed out.
      if (slot >= bet.placedSlot + BET_TIMEOUT_SLOTS) {
        try {
          const sig = await sendIxs([await cancelBetIx(signer.address, bet.player)]);
          console.log(`[settle] cancelled stale-epoch bet of ${bet.player}: ${sig}`);
          openBets.delete(bet.player);
        } catch (err) {
          console.warn("[settle] cancel failed:", err instanceof Error ? err.message : err);
        }
      }
      continue;
    }
    if (bet.seq === chain.cursor) head = bet;
  }
  if (!head) return; // head bet not discovered yet; the poll will catch it

  if (idx + 1 >= file.values.length) {
    health.lastError = "chain file exhausted";
    return;
  }
  const reveal = hexToBytes(file.values[idx + 1]);
  try {
    const sig = await sendIxs([
      setComputeUnitLimitIx(CU_LIMIT[head.gameId] ?? 200_000),
      setComputeUnitPriceIx(PRIORITY_FEE_MICRO_LAMPORTS),
      await settleBetIx(signer.address, head.player, reveal),
    ]);
    lastSettleAt = Date.now();
    health.lastError = null;
    openBets.delete(head.player);
    console.log(`[settle] seq ${head.seq} game ${head.gameId} player ${head.player.slice(0, 8)}… idx ${idx} → ${sig}`);
  } catch (err) {
    const code = errorCode(err);
    // 6023 BetNotOpen / 6024 BetNotHead / 6020 ChainBadReveal: the state moved
    // under us; the next pass re-reads everything.
    if (code === 6023 || code === 6024 || code === 6020) {
      console.log(`[settle] state moved (code ${code}); re-reading`);
      openBets.delete(head.player);
      return;
    }
    health.lastError = err instanceof Error ? err.message : String(err);
    console.error("[settle] settle failed:", health.lastError);
    await sleep(1000);
  }
}

// --- discovery: subscription + reconciliation ------------------------------

async function subscribeLoop(signal: AbortSignal): Promise<void> {
  const subs = getSubscriptions();
  while (!signal.aborted) {
    try {
      const notifications = await subs
        .programNotifications(PROGRAM_ID as Address, {
          commitment: "confirmed",
          encoding: "base64",
          filters: [
            { dataSize: BigInt(BET_STATE_SIZE) },
            { memcmp: { offset: 0n, bytes: bs58.encode(accountDiscriminator("BetState")) as never, encoding: "base58" } },
          ],
        } as never)
        .subscribe({ abortSignal: signal });
      for await (const n of notifications as AsyncIterable<{ value: { pubkey: string; account: { data: unknown } } }>) {
        const raw = n.value.account.data;
        const b64 = Array.isArray(raw) ? (raw[0] as string) : (raw as string);
        noteBet(n.value.pubkey, Uint8Array.from(Buffer.from(b64, "base64")));
        wake();
      }
    } catch (err) {
      if (signal.aborted) return;
      console.warn("[settle] subscription dropped:", err instanceof Error ? err.message : err);
      await sleep(2000);
    }
  }
}

let wakeResolve: (() => void) | null = null;
function wake() {
  wakeResolve?.();
  wakeResolve = null;
}
function waitForWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    wakeResolve = resolve;
    setTimeout(resolve, ms);
  });
}

async function mainLoop(): Promise<void> {
  let lastReconcile = 0;
  for (;;) {
    try {
      if (Date.now() - lastReconcile > POLL_MS) {
        await reconcile();
        lastReconcile = Date.now();
      }
      await pass();
      // Keep draining while bets are queued; otherwise wait for a push.
      if (openBets.size > 0) await sleep(250);
      else await waitForWake(POLL_MS);
    } catch (err) {
      health.lastError = err instanceof Error ? err.message : String(err);
      console.error("[settle] loop error:", health.lastError);
      await sleep(2000);
    }
  }
}

createServer((req, res) => {
  if (req.url === "/health") {
    health.lastSettleAgoMs = lastSettleAt == null ? null : Date.now() - lastSettleAt;
    res.writeHead(health.chainFileOk ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(health));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(HEALTH_PORT, "127.0.0.1", () => {
  console.log(`[settle] health on http://127.0.0.1:${HEALTH_PORT}/health`);
});

const abort = new AbortController();
void subscribeLoop(abort.signal);
await mainLoop();
