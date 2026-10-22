"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Signature } from "@solana/kit";
import { SPIN_PROGRAM_ADDRESS } from "../solana/client";
import {
  activityFromTransaction,
  type ActivityRow,
  type RawTransaction,
} from "../solana/events";
import { useAppClient } from "./use-app-client";
import { useCluster } from "./use-cluster";
import { usePda } from "./use-pda";
import { useAddressSeed } from "./use-vault";

/** Parsed rows by signature; transactions never change once confirmed. */
const cache = new Map<string, ActivityRow[]>();

/**
 * The player's money history, straight from the chain: every deposit,
 * cash-out, bet, settlement and refund touches the vault PDA, so its
 * signature list is the complete ledger. `version` should change when the
 * vault account changes, which re-lists the newest signatures.
 */
export function useVaultActivity(
  player: Address | undefined,
  version: unknown,
  limit = 20
) {
  const client = useAppClient();
  const { cluster } = useCluster();
  const seed = useAddressSeed(player);
  const vault = usePda(SPIN_PROGRAM_ADDRESS, ["vault", seed], player != null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const inflight = useRef(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    const run = async () => {
      const id = ++inflight.current;
      setIsLoading(true);
      try {
        const sigs = await client.rpc
          .getSignaturesForAddress(vault, { limit })
          .send();
        const out: ActivityRow[] = [];
        for (const s of sigs) {
          const sig = s.signature as string;
          let parsed = cache.get(sig);
          if (!parsed) {
            const tx = (await client.rpc
              .getTransaction(sig as Signature, {
                encoding: "json",
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
              })
              .send()) as unknown as RawTransaction | null;
            if (!tx) continue;
            parsed = activityFromTransaction(sig, tx);
            if (parsed.length === 0) {
              parsed = [
                {
                  signature: sig,
                  blockTime: tx.blockTime == null ? null : Number(tx.blockTime),
                  kind: "other",
                  lamports: 0n,
                  err: tx.meta?.err != null,
                },
              ];
            }
            cache.set(sig, parsed);
          }
          out.push(...parsed);
          if (cancelled || id !== inflight.current) return;
        }
        if (!cancelled && id === inflight.current) setRows(out);
      } catch (err) {
        console.error("useVaultActivity", err);
      } finally {
        if (!cancelled && id === inflight.current) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [client, vault, limit, cluster, version, tick]);

  return { rows: vault ? rows : [], isLoading, refresh };
}
