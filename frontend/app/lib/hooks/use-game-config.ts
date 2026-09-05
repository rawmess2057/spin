"use client";

import { getGameConfigDecoder, SPIN_PROGRAM_ADDRESS } from "../solana/client";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";

export function useGameConfig(gameId: number) {
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["game_config", gameId]);
  return useAccountData(address, (data) => getGameConfigDecoder().decode(data));
}
