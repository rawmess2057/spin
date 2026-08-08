"use client";

import { decodeNetworkState, VRF_PROGRAM_ADDRESS } from "../solana/vrf";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";

export function useNetworkState() {
  const address = usePda(VRF_PROGRAM_ADDRESS, ["OraoVrfCbConfig"]);
  return useAccountData(address, decodeNetworkState);
}
