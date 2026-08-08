"use client";

import { useMemo } from "react";
import { getAddressEncoder, type Address } from "@solana/kit";
import {
  getCreditLedgerDecoder,
  getPlayerVaultDecoder,
  SPIN_PROGRAM_ADDRESS,
} from "../solana/client";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";

/**
 * `usePda` encodes string seed parts as UTF-8, so an address has to be handed
 * over as its 32 raw bytes — passing the base58 string would silently derive a
 * different PDA.
 */
export function useAddressSeed(address: Address | undefined): Uint8Array {
  return useMemo(
    () =>
      address
        ? Uint8Array.from(getAddressEncoder().encode(address))
        : new Uint8Array(32),
    [address]
  );
}

/**
 * The player's credit vault. Streams over `accountNotifications`, so the
 * balance updates on its own the moment a bet is placed or a win is credited
 * by the VRF callback — nothing needs to poll.
 *
 * `data == null` means the player has never deposited, which is the signal to
 * show the buy-in flow rather than the game.
 */
export function useVault(player: Address | undefined) {
  const seed = useAddressSeed(player);
  const address = usePda(
    SPIN_PROGRAM_ADDRESS,
    ["vault", seed],
    player != null
  );
  return useAccountData(address, (data) => getPlayerVaultDecoder().decode(data));
}

/** Global outstanding player credit — what the house owes players. */
export function useCreditLedger() {
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["credits"]);
  return useAccountData(address, (data) =>
    getCreditLedgerDecoder().decode(data)
  );
}
