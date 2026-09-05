import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  createKeyPairSignerFromBytes,
  type KeyPairSigner,
} from "@solana/kit";

export const PROGRAM_ID = "9sd7ASeBUmcCNm4eVFfQ7rSujtbVLmu8wMUh9PwdNWvP" as const;

export const VRF_PROGRAM_ID =
  "VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU" as const;

export const SEEDS = {
  HOUSE: "house",
  CHAIN: "chain",
  VRF_STATE: "vrf_state",
  PENDING: "pending",
  GAME_CONFIG: "game_config",
  SESSION: "session",
  VAULT: "vault",
  CREDITS: "credits",
  VRF_CONFIG: "OraoVrfCbConfig",
  VRF_CLIENT: "OraoVrfCbClient",
  VRF_REQUEST: "OraoVrfCbRequest",
} as const;

export function rpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    "https://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53"
  );
}

export function wsUrl(): string {
  return (
    process.env.SOLANA_WS_URL ??
    "wss://devnet.helius-rpc.com/?api-key=d9b9a17e-14dc-4e55-996f-02e096dc0c53"
  );
}

export function clusterLabel(): string {
  return process.env.SOLANA_RPC_URL?.includes("mainnet")
    ? "mainnet"
    : "devnet";
}

export async function loadKeypairSigner(path?: string): Promise<KeyPairSigner<string>> {
  const file = path ?? process.env.KEYPAIR ?? `${homedir()}/.config/solana/id.json`;
  const raw = readFileSync(file, "utf8");
  const bytes = JSON.parse(raw);
  return await createKeyPairSignerFromBytes(new Uint8Array(bytes));
}