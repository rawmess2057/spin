"use client";

import {
  getHouseTreasuryDecoder,
  SPIN_PROGRAM_ADDRESS,
} from "../solana/client";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";

export function useHouse() {
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["house"]);
  return useAccountData(address, (data) =>
    getHouseTreasuryDecoder().decode(data)
  );
}
