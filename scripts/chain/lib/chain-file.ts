import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha256";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

export type ChainFile = {
  seed: string; // 64 hex chars (32 bytes)
  length: number;
  reveals: string[]; // hex reveals, ascending by index
};

export function chainFilePath(): string {
  return join(DATA_DIR, "chain.json");
}

export function cursorFilePath(): string {
  return join(DATA_DIR, "cursor.json");
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

/** reveal_i = sha256(seed || i.to_le_bytes()), mirror of `chain_head`. */
export function revealAt(seedHex: string, index: number): string {
  const seed = hexToBytes(seedHex);
  const idx = new Uint8Array(8);
  new DataView(idx.buffer).setBigUint64(0, BigInt(index), true);
  const out = new Uint8Array(32 + 8);
  out.set(seed, 0);
  out.set(idx, 32);
  return bytesToHex(sha256(out));
}

/** Generates a fresh chain: random 32-byte seed + `length` reveals. */
export async function generateChain(length: number): Promise<ChainFile> {
  if (length < 1) throw new Error("length must be >= 1");
  const seed = randomBytes(32);
  const idx = new Uint8Array(8);
  const reveals: string[] = [];
  const scratch = new Uint8Array(40);
  scratch.set(seed, 0);
  for (let i = 0; i < length; i++) {
    new DataView(idx.buffer).setBigUint64(0, BigInt(i), true);
    scratch.set(idx, 32);
    reveals.push(bytesToHex(sha256(scratch)));
  }
  return { seed: bytesToHex(seed), length, reveals };
}

export async function saveChainFile(file: ChainFile, path = chainFilePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file));
  await rename(tmp, path);
}

export async function loadChainFile(path = chainFilePath()): Promise<ChainFile> {
  const raw = await readFile(path, "utf8");
  const file = JSON.parse(raw) as ChainFile;
  if (typeof file.seed !== "string" || file.seed.length !== 64) {
    throw new Error(`bad chain file ${path}: seed must be 64 hex chars`);
  }
  if (!Array.isArray(file.reveals) || file.reveals.length !== file.length) {
    throw new Error(`bad chain file ${path}: reveals length != length`);
  }
  return file;
}

export async function loadCursor(): Promise<number> {
  try {
    const raw = await readFile(cursorFilePath(), "utf8");
    const v = JSON.parse(raw);
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  } catch {
    // no cursor yet
  }
  return 0;
}

export async function saveCursor(cursor: number): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${cursorFilePath()}.tmp`;
  await writeFile(tmp, JSON.stringify(cursor));
  await rename(tmp, cursorFilePath());
}
