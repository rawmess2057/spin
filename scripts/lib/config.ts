import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  createKeyPairSignerFromBytes,
  type KeyPairSigner,
} from "@solana/kit";

export const PROGRAM_ID = "9sd7ASeBUmcCNm4eVFfQ7rSujtbVLmu8wMUh9PwdNWvP" as const;

/** PDA seeds — must match programs/spin/src/constants.rs. */
export const SEEDS = {
  HOUSE: "house",
  GAME_CONFIG: "game",
  SESSION: "session",
  VAULT: "vault",
  CREDITS: "ledger",
  CHAIN: "chain2",
  BET: "bet",
} as const;

/** Game ids — must match programs/spin/src/constants.rs. */
export const GAMES = {
  PLINKO: 7,
  MEGAWAYS: 8,
  WHEEL: 9,
  HOLD_SPIN: 10,
} as const;

/** 1 💎 = 100,000 lamports, matching frontend/app/lib/diamonds.ts. */
export const DIAMOND_LAMPORTS = 100_000n;

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null) {
    throw new Error(`${name} is not set (see scripts/.env.example)`);
  }
  return v;
}

export function rpcUrl(): string {
  return requireEnv("SOLANA_RPC_URL", "https://api.devnet.solana.com");
}

export function wsUrl(): string {
  return requireEnv("SOLANA_WS_URL", "wss://api.devnet.solana.com");
}

export function clusterLabel(): string {
  return rpcUrl().includes("mainnet") ? "mainnet" : "devnet";
}

/** The house authority / crank keypair (`KEYPAIR`, default solana CLI id). */
export async function loadKeypairSigner(path?: string): Promise<KeyPairSigner<string>> {
  const file = path ?? process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`;
  const raw = readFileSync(file, "utf8");
  const bytes = JSON.parse(raw);
  return await createKeyPairSignerFromBytes(new Uint8Array(bytes));
}
