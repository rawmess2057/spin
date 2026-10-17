import { sha256 } from "@noble/hashes/sha2.js";
import { getAddressEncoder, type Address } from "@solana/kit";

/**
 * Provably-fair helpers: the browser-side mirror of the program's
 * commit-reveal chain (programs/spin/src/games/mod.rs, state.rs).
 *
 * The house publishes a commitment `s_0`; settling bet after bet it reveals
 * `s_1, s_2, …` with `sha256(s_{i+1}) == s_i`. A bet records the commitment
 * it saw when placed and the reveal that settled it, so anyone can check
 *   sha256^(reveal_index - index_at_place)(reveal) == commitment
 * and then re-derive the randomness and re-run the game evaluator.
 */

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: ArrayLike<number>): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function u64Le(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}

/** 32 random bytes for a bet's client seed. */
export function randomClientSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

/**
 * The 64 bytes of randomness the program feeds the evaluator:
 * `r1 = sha256(reveal ‖ client_seed ‖ player ‖ nonce_le)`, `r2 = sha256(r1)`.
 * Mirrors `games::derive_randomness`.
 */
export function deriveRandomness(
  reveal: ArrayLike<number>,
  clientSeed: ArrayLike<number>,
  player: Address,
  nonce: bigint
): Uint8Array {
  const input = new Uint8Array(32 + 32 + 32 + 8);
  input.set(Uint8Array.from(reveal), 0);
  input.set(Uint8Array.from(clientSeed), 32);
  input.set(Uint8Array.from(getAddressEncoder().encode(player)), 64);
  input.set(u64Le(nonce), 96);
  const r1 = sha256(input);
  const r2 = sha256(r1);
  const out = new Uint8Array(64);
  out.set(r1, 0);
  out.set(r2, 32);
  return out;
}

/**
 * True when hashing `reveal` `steps` times yields `commitment`, i.e. the
 * reveal really is a link of the chain the player bet against.
 */
export function verifyChainLink(
  reveal: ArrayLike<number>,
  commitment: ArrayLike<number>,
  steps: number
): boolean {
  if (steps < 1 || steps > 100_000) return false;
  let h = Uint8Array.from(reveal);
  for (let i = 0; i < steps; i++) h = sha256(h);
  return bytesToHex(h) === bytesToHex(commitment);
}
