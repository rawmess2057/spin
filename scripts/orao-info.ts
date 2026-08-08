import {
  fetchAccount,
  parseClient,
  parseNetworkState,
  parseRequestAccount,
} from "./lib/accounts.js";
import {
  clientAddress,
  networkStateAddress,
  requestAddress,
  vrfStateAddress,
} from "./lib/spin.js";
import { PROGRAM_ID, VRF_PROGRAM_ID, rpcUrl } from "./lib/config.js";
import { createRpcBundle } from "./lib/util.js";

const bundle = createRpcBundle(rpcUrl());

const vrfState = await vrfStateAddress();
const networkStateAddr = await networkStateAddress();
const client = await clientAddress(vrfState);

console.log("Programs:");
console.log(`  spin:    ${PROGRAM_ID}`);
console.log(`  vrf:     ${VRF_PROGRAM_ID}`);

console.log("\nAccounts:");
console.log(`  vrf_state (spin):  ${vrfState}`);
console.log(`  network_state:     ${networkStateAddr}`);
console.log(`  client (vrf):      ${client}`);

const vrfProg = await fetchAccount(bundle, VRF_PROGRAM_ID);
console.log(`\nVRF program on chain: ${vrfProg ? "YES" : "NO"}`);

const spinProg = await fetchAccount(bundle, PROGRAM_ID);
console.log(`spin program on chain: ${spinProg ? "YES" : "NO"}`);

const ns = await fetchAccount(bundle, networkStateAddr);
if (!ns || ns.data === null) {
  console.log(
    "\nNetworkState: NOT FOUND (is the ORAO VRF network initialized on this cluster?)",
  );
  process.exit(1);
}
const nsv = parseNetworkState(ns.data);
console.log("\nNetworkState:");
console.log(`  bump:               ${nsv.bump}`);
console.log(`  authority:          ${nsv.authority}`);
console.log(`  treasury:           ${nsv.treasury}`);
console.log(`  request_fee:        ${Number(nsv.requestFee) / 1e9} SOL`);
console.log(`  callback_deadline:  ${nsv.callbackDeadline} slots`);
console.log(`  fulfill_authorities: ${nsv.fulfillAuthorities.length}`);
console.log(`  num_requests:       ${nsv.numRequests}`);
console.log(`  num_registered:     ${nsv.numRegistered}`);
console.log(`  num_terminated:     ${nsv.numTerminated}`);

const c = await fetchAccount(bundle, client);
if (!c || c.data === null) {
  console.log("\nClient: NOT REGISTERED yet");
} else {
  const cv = parseClient(c.data);
  console.log("\nClient:");
  console.log(`  bump:        ${cv.bump}`);
  console.log(`  owner:       ${cv.owner}`);
  console.log(`  program:     ${cv.program}`);
  console.log(`  state:       ${cv.state}`);
  console.log(`  num_requests: ${cv.numRequests}`);
  console.log(`  balance:     ${Number(c.lamports) / 1e9} SOL`);
}

const seed = process.argv[2];
if (seed) {
  const seedBytes = Uint8Array.from(Buffer.from(seed, "hex"));
  const req = await requestAddress(client, seedBytes);
  const ra = await fetchAccount(bundle, req);
  console.log(`\nRequest (seed ${seed}): ${req}`);
  if (!ra || ra.data === null) {
    console.log("  NOT FOUND");
  } else {
    const rv = parseRequestAccount(ra.data);
    console.log(
      `  state: ${rv.state}${
        rv.randomness
          ? ` randomness=${Buffer.from(rv.randomness).toString("hex").slice(0, 32)}...`
          : ""
      }`,
    );
  }
}