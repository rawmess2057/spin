"use client";

import { useMemo } from "react";
import { type Address, type Lamports } from "@solana/kit";
import { useTrackedDataSWR } from "@solana/react/swr";
import { useCluster } from "../../components/cluster-context";
import { useAppClient } from "../client-provider";
import { base64ToBytes } from "../spin/util";

type AccountRaw = {
  lamports: Lamports;
  data: unknown;
};

function decodeAccountData(raw: AccountRaw | null): Uint8Array | null {
  if (!raw) return null;
  const data = raw.data;
  if (Array.isArray(data)) {
    const b64 = (data as [string, string])[0];
    return b64 ? base64ToBytes(b64) : null;
  }
  if (typeof data === "string" && data !== "") {
    return base64ToBytes(data);
  }
  return null;
}

export type AccountValue<T> = {
  /** Parsed account data, or null if the account does not exist yet. */
  data: T | null;
  /** Account lamports, or null if the account does not exist yet. */
  lamports: Lamports | null;
};

/**
 * Subscribes to a Solana account's data: one-shot fetch plus on-change
 * notifications, unified through SWR. Returns `{ data, lamports, isLoading }`.
 */
export function useAccountData<T>(
  address: Address | null,
  parser: (data: Uint8Array) => T
) {
  const { cluster } = useCluster();
  const client = useAppClient();

  const spec = useMemo(() => {
    if (!address) return null;
    const map = (raw: AccountRaw | null): AccountValue<T> => {
      const bytes = decodeAccountData(raw);
      return {
        data: bytes ? parser(bytes) : null,
        lamports: raw?.lamports ?? null,
      };
    };
    return {
      initialValueSource: client.rpc.getAccountInfo(address, {
        commitment: "confirmed",
        encoding: "base64",
      }),
      initialValueMapper: map,
      streamSource: client.rpcSubscriptions.accountNotifications(address, {
        commitment: "confirmed",
        encoding: "base64",
      }),
      streamValueMapper: map,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, address]);

  const { data, error } = useTrackedDataSWR(
    address ? (["account", cluster, address] as const) : null,
    spec
  );

  const value = data?.value ?? null;
  return {
    data: value?.data ?? null,
    lamports: value?.lamports ?? null,
    isLoading: address != null && value == null && error == null,
    error,
  };
}
