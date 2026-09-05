"use client";

import type { Address } from "@solana/kit";
import {
  getPlayerSessionDecoder,
  SPIN_PROGRAM_ADDRESS,
} from "../solana/client";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";
import { useAddressSeed } from "./use-vault";

export function usePlayerSession(player: Address | null) {
  // The address must go in as raw bytes: usePda encodes bare strings as UTF-8.
  const seed = useAddressSeed(player ?? undefined);
  const address = usePda(
    SPIN_PROGRAM_ADDRESS,
    ["session", seed],
    player != null
  );
  return useAccountData(address, (data) =>
    getPlayerSessionDecoder().decode(data)
  );
}
