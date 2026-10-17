"use client";

import { useMemo } from "react";
import { getAddressEncoder, type Address } from "@solana/kit";
import {
  BetStatus,
  getBetStateDecoder,
  getCreditLedgerDecoder,
  getPlayerVaultDecoder,
  SPIN_PROGRAM_ADDRESS,
  type BetState,
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
 * by the settlement — nothing needs to poll.
 *
 * `data == null` means the player has never deposited, which is the signal to
 * show the buy-in flow rather than the game.
 */
export function useVault(player: Address | undefined) {
  const seed = useAddressSeed(player);
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["vault", seed], player != null);
  return useAccountData(address, (data) =>
    getPlayerVaultDecoder().decode(data)
  );
}

/** Global ledger: what the house owes players + payouts reserved by open bets. */
export function useCreditLedger() {
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["ledger"]);
  return useAccountData(address, (data) =>
    getCreditLedgerDecoder().decode(data)
  );
}

/**
 * The player's bet account (`["bet", player]`): their one open bet, or the
 * last settled one. Streams, so settlement shows up without polling.
 */
export function useBetAccount(player: Address | undefined) {
  const seed = useAddressSeed(player);
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["bet", seed], player != null);
  const account = useAccountData(address, (data) =>
    getBetStateDecoder().decode(data)
  );
  const openBet: BetState | null =
    account.data != null && account.data.status === BetStatus.Open
      ? account.data
      : null;
  return { ...account, openBet };
}
