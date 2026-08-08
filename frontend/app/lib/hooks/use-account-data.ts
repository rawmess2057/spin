"use client";

import { useMemo } from "react";
import { getBase64Encoder, type Address, type Lamports } from "@solana/kit";
import { useTrackedDataSWR } from "@solana/react/swr";
import { useCluster } from "./use-cluster";
import { useAppClient } from "./use-app-client";

type AccountRaw = {
  lamports: Lamports;
  data: unknown;
};

const base64Encoder = getBase64Encoder();

function decodeAccountData(raw: AccountRaw | null): Uint8Array | null {
  if (!raw) return null;
  const data = raw.data;
  const b64 = Array.isArray(data) ? (data as [string, string])[0] : data;
  if (typeof b64 !== "string" || b64 === "") return null;
  return base64Encoder.encode(b64) as Uint8Array;
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
  decode: (data: Uint8Array) => T
) {
  const { cluster } = useCluster();
  const client = useAppClient();

  const spec = useMemo(() => {
    if (!address) return null;
    const map = (raw: AccountRaw | null): AccountValue<T> => {
      const bytes = decodeAccountData(raw);
      return {
        data: bytes ? decode(bytes) : null,
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
