import { wsUrl } from "./config.js";
import { createSolanaRpcSubscriptions } from "@solana/kit";

let cached: ReturnType<typeof createSolanaRpcSubscriptions> | null = null;

export function getSubscriptions(): ReturnType<typeof createSolanaRpcSubscriptions> {
  if (!cached) cached = createSolanaRpcSubscriptions(wsUrl());
  return cached;
}