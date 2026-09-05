"use client";

import { useEffect, useState } from "react";
import type { Address, Signature } from "@solana/kit";
import { SPIN_PROGRAM_ADDRESS } from "../solana/client";
import { usePda } from "./use-pda";
import { useAppClient } from "./use-app-client";
import { useCluster } from "./use-cluster";
import { useAddressSeed } from "./use-vault";

export type RecentSpin = {
  signature: Signature;
  slot: bigint;
  blockTime: bigint | null;
  err: unknown;
};

/**
 * The program has no per-spin history account (only cumulative
 * PlayerSession counters), so "recent spins" comes straight from the
 * transaction history of the player's session PDA — real on-chain data,
 * no indexer required.
 */
export function useRecentSpins(player: Address | null, limit = 8) {
  const client = useAppClient();
  const { cluster } = useCluster();
  // The address goes in as its 32 raw bytes; usePda encodes bare strings as
  // UTF-8, which would exceed the 32-byte seed limit and derive nothing.
  const playerSeed = useAddressSeed(player ?? undefined);
  const session = usePda(
    SPIN_PROGRAM_ADDRESS,
    ["session", playerSeed],
    player != null
  );

  const [spins, setSpins] = useState<RecentSpin[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const fetchSpins = async () => {
      setIsLoading(true);
      try {
        const results = await client.rpc
          .getSignaturesForAddress(session, { limit })
          .send();
        if (cancelled) return;
        setSpins(
          results.map((r) => ({
            signature: r.signature,
            slot: r.slot,
            blockTime: r.blockTime ?? null,
            err: r.err,
          }))
        );
      } catch {
        if (!cancelled) setSpins([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchSpins();
    return () => {
      cancelled = true;
    };
  }, [client, session, limit, cluster]);

  return { spins: session ? spins : [], isLoading };
}
