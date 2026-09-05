import { createServer } from "node:http";
import { fetchAccount, parseChainState } from "../lib/accounts.js";
import { rpcUrl } from "../lib/config.js";
import { chainAddress } from "../lib/spin.js";
import { createRpcBundle, sleep } from "../lib/util.js";
import { chainFilePath, loadChainFile } from "./lib/chain-file.js";

// Standalone reveal service for the instant hash-chain.
//
// The on-chain ChainState.index is the ground truth for which reveal is
// current, so /next serves reveal[chain.index] — it never keeps a local
// cursor. Races self-heal through the program's ChainStale error:
//   - two spinners get the same reveal; one wins, the other retries and is
//     served the next one after the head advances.
//   - a reveal is fetched but never used (failed tx, closed tab): nothing is
//     burned — the next /next still returns the current head.
//   - a crash between serving and consuming: the retried /next returns the
//     fresh head, not a replay.
// The 1s poll bounds how stale `knownIndex` can be; clients handle one
// ChainStale retry, which is exactly the race this design allows.
//
// If the on-chain seed differs from the local chain file (chain rotated),
// the service stops and asks for the new chain file.
//
// Endpoints:
//   GET /next  -> { seed, index, reveal, length, remaining }  (index = head)
//   GET /head  -> same shape, never consumed (alias of /next's read)
//   GET /info  -> { seed, length, head, active, vrfEnabled, broken }
//
// Usage: npx tsx chain/serve.ts   (PORT=8787, HOST=127.0.0.1)

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? "8787");
// Public devnet RPCs throttle sustained per-IP polling; 5s bounds staleness
// just as well for the one-chain-stale-retry the clients handle.
const POLL_MS = Number(process.env.POLL_MS ?? "5000");

const bundle = createRpcBundle(rpcUrl());
const chain = await chainAddress();

const file = await loadChainFile(chainFilePath());
const seedHex = file.seed;

let knownIndex = 0n;
let active = false;
let vrfEnabled = false;
let chainLive = false;
let broken: string | null = null;

async function poll(): Promise<void> {
  try {
    const acct = await fetchAccount(bundle, chain);
    if (!acct || acct.data === null) {
      chainLive = false;
      active = false;
      return;
    }
    const s = parseChainState(acct.data);
    const onChainSeed = Buffer.from(s.seed).toString("hex");
    if (onChainSeed !== seedHex) {
      broken = `on-chain chain seed ${onChainSeed.slice(0, 16)}… != local ${seedHex.slice(0, 16)}…; ` +
        "the chain was rotated — update scripts/chain/data/chain.json (rotate-chain.ts) and restart.";
      return;
    }
    broken = null;
    chainLive = true;
    active = s.active;
    vrfEnabled = s.vrfEnabled;
    knownIndex = s.index;
  } catch (e) {
    console.warn("poll failed:", e instanceof Error ? e.message : e);
  }
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function nextReveal(res: import("node:http").ServerResponse): void {
  if (broken) {
    json(res, 503, { error: "chain_broken", detail: broken });
    return;
  }
  if (!chainLive) {
    json(res, 503, { error: "chain_not_found", detail: "run init-chain.ts" });
    return;
  }
  if (!active) {
    json(res, 503, { error: "chain_inactive", detail: "run init-chain.ts or set_chain_mode" });
    return;
  }
  if (vrfEnabled) {
    json(res, 503, { error: "vrf_enabled", detail: "chain mode is off; set_chain_mode(vrf_enabled=false)" });
    return;
  }
  const index = Number(knownIndex);
  if (index >= file.length) {
    json(res, 410, { error: "chain_exhausted", detail: "run rotate-chain.ts" });
    return;
  }
  json(res, 200, {
    seed: seedHex,
    index,
    reveal: file.reveals[index],
    length: file.length,
    remaining: file.length - index - 1,
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/next" || url.pathname === "/head") {
    return nextReveal(res);
  }
  if (url.pathname === "/info") {
    return json(res, 200, {
      seed: seedHex,
      length: file.length,
      head: knownIndex.toString(),
      active,
      vrfEnabled,
      broken,
    });
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  json(res, 404, { error: "not_found" });
});

setInterval(() => void poll(), POLL_MS).unref();
await poll();

server.listen(PORT, HOST, () => {
  console.log(`reveal service on http://${HOST}:${PORT}`);
  console.log(`chain seed ${seedHex.slice(0, 16)}… length ${file.length}`);
});
