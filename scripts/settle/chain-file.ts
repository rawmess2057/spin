/**
 * Commit-reveal chain files for the settlement crank.
 *
 * A chain is generated offline from a random secret:
 *   s_N = sha256(secret),  s_i = sha256(s_{i+1})
 * `values[i]` is `s_i`; `values[0]` is the genesis published on-chain and
 * `values[index + 1]` is the reveal that settles the bet consuming chain
 * index `index`. The file is the house's only secret and lives in
 * scripts/settle/data/ (gitignored).
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha256";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");

export type ChainFile = {
  version: 2;
  genesis: string; // hex of values[0]
  length: number; // N reveals available
  values: string[]; // hex, N + 1 entries
};

export function chainFilePath(name = "chain.json"): string {
  return process.env.CHAIN_FILE ?? join(DATA_DIR, name);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`odd hex length: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function generateChain(length: number): ChainFile {
  if (length < 1) throw new Error("length must be >= 1");
  const values: Uint8Array[] = new Array(length + 1);
  values[length] = sha256(randomBytes(32));
  for (let i = length - 1; i >= 0; i--) values[i] = sha256(values[i + 1]);
  const hex = values.map(bytesToHex);
  return { version: 2, genesis: hex[0], length, values: hex };
}

export async function saveChainFile(file: ChainFile, path = chainFilePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file), { mode: 0o600 });
  await rename(tmp, path);
}

export async function loadChainFile(path = chainFilePath()): Promise<ChainFile> {
  const raw = await readFile(path, "utf8");
  const file = JSON.parse(raw) as ChainFile;
  if (file.version !== 2) throw new Error(`bad chain file ${path}: not a v2 chain`);
  if (!Array.isArray(file.values) || file.values.length !== file.length + 1) {
    throw new Error(`bad chain file ${path}: values must have length + 1 entries`);
  }
  if (file.values[0] !== file.genesis) throw new Error(`bad chain file ${path}: genesis mismatch`);
  // Spot-check the links so a corrupted file is caught before it is published.
  for (const i of [0, Math.floor(file.length / 2), file.length - 1]) {
    if (bytesToHex(sha256(hexToBytes(file.values[i + 1]))) !== file.values[i]) {
      throw new Error(`bad chain file ${path}: link ${i} does not hash to its parent`);
    }
  }
  return file;
}

/** Position lookup: on-chain `commitment` → chain index. */
export function indexByValue(file: ChainFile): Map<string, number> {
  const m = new Map<string, number>();
  file.values.forEach((v, i) => m.set(v, i));
  return m;
}
