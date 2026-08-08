"use client";

import { getGameConfigDecoder, SPIN_PROGRAM_ADDRESS } from "../solana/client";
import { GAME_SLOTS } from "../solana/config";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";

export function useGameConfig(gameId: number = GAME_SLOTS) {
  const address = usePda(SPIN_PROGRAM_ADDRESS, ["game_config", gameId]);
  return useAccountData(address, (data) => getGameConfigDecoder().decode(data));
}
