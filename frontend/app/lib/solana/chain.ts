import { sha256 } from "@noble/hashes/sha2.js";
import { getBytesEncoder } from "@solana/kit";

/**
 * Instant reveal chain: client-side mirror of the on-chain `chain_head` and
 * `chain_randomness` (programs/spin/src/instructions/chain.rs), plus a client
 * for the house's reveal service (scripts/chain/serve.ts).
 *
 * Reveal *i* = sha256(seed || i.to_le_bytes()); the randomness fed to the
 * eval mirrors is reveal || sha256(reveal). Every reveal a client uses can be
 * re-verified: sha256(seed || index) must equal the reveal sent on-chain.
 */

export const REVEAL_URL =
  process.env.NEXT_PUBLIC_REVEAL_URL ?? "http://127.0.0.1:8787";

export type RevealResponse = {
  seed: string; // 64 hex chars — must equal the on-chain ChainState seed
  index: number;
  reveal: string; // 64 hex chars
  length: number;
  remaining: number;
};

export type RevealError = {
  status: number;
  error: string; // chain_not_found | chain_inactive | vrf_enabled | chain_exhausted | chain_broken
  detail?: string;
};

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function u64Le(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}

/** reveal_i = sha256(seed || i.to_le_bytes()), mirror of the on-chain head. */
export function chainHeadReveal(seed: Uint8Array, index: bigint): Uint8Array {
  const input = new Uint8Array(40);
  input.set(seed, 0);
  input.set(u64Le(index), 32);
  return sha256(input);
}

/** The 64 bytes of randomness fed to the eval mirrors: reveal || sha256(reveal). */
export function chainRandomness(reveal: Uint8Array): Uint8Array {
  const hashed = sha256(reveal);
  const out = new Uint8Array(64);
  out.set(reveal, 0);
  out.set(hashed, 32);
  return out;
}

/** Verifies a served reveal against a seed+index, independent of the service. */
export function verifyReveal(
  seedHex: string,
  index: bigint,
  revealHex: string
): boolean {
  return bytesToHex(chainHeadReveal(hexToBytes(seedHex), index)) === revealHex;
}

/** The "chain" PDA seed bytes, matching constants.rs CHAIN_SEED. */
export const CHAIN_SEED_BYTES = getBytesEncoder().encode(
  new TextEncoder().encode("chain")
);

/**
 * Fetches the next reveal from the reveal service. Throws `RevealError` for
 * the house-facing failure states (503/410), which the UI should surface
 * instead of offering a bet.
 */
export async function fetchNextReveal(): Promise<RevealResponse> {
  const res = await fetch(`${REVEAL_URL}/next`, { cache: "no-store" });
  if (!res.ok) {
    throw (await res.json()) as RevealError;
  }
  return (await res.json()) as RevealResponse;
}

export async function fetchChainInfo(): Promise<{
  seed: string;
  length: number;
  served: number;
  knownIndex: string;
  active: boolean;
  vrfEnabled: boolean;
  broken: string | null;
}> {
  const res = await fetch(`${REVEAL_URL}/info`, { cache: "no-store" });
  if (!res.ok) throw new Error(`reveal service /info failed (${res.status})`);
  return await res.json();
}
