"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddressEncoder } from "@solana/kit";
import { getPendingSpinDecoder, SPIN_PROGRAM_ADDRESS } from "../solana/client";
import { PendingStatus } from "../solana/generated/spin";
import {
  decodeRequestAccount,
  VRF_PROGRAM_ADDRESS,
  type RequestAccountData,
} from "../solana/vrf";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";
import { useAppClient } from "./use-app-client";
import { useNetworkState } from "./use-network-state";

const addressEncoder = getAddressEncoder();

export function usePendingSpin(seed: Uint8Array | null) {
  const address = usePda(
    SPIN_PROGRAM_ADDRESS,
    ["pending", seed ?? new Uint8Array(32)],
    seed != null
  );
  return useAccountData(address, (data) =>
    getPendingSpinDecoder().decode(data)
  );
}

export function useVrfRequest(seed: Uint8Array | null) {
  const vrfState = usePda(SPIN_PROGRAM_ADDRESS, ["vrf_state"]);
  const client = usePda(
    VRF_PROGRAM_ADDRESS,
    [
      "OraoVrfCbClient",
      addressEncoder.encode(SPIN_PROGRAM_ADDRESS),
      vrfState != null ? addressEncoder.encode(vrfState) : new Uint8Array(32),
    ],
    vrfState != null
  );
  const request = usePda(
    VRF_PROGRAM_ADDRESS,
    [
      "OraoVrfCbRequest",
      client != null ? addressEncoder.encode(client) : new Uint8Array(32),
      seed ?? new Uint8Array(32),
    ],
    client != null && seed != null
  );
  return useAccountData<RequestAccountData>(request, decodeRequestAccount);
}

export type SpinStatus =
  "idle" | "placing" | "awaitingOracle" | "refundable" | "resolved";

/**
 * Tracks a live spin (Slots or Dice — this is game-agnostic) through its
 * lifecycle using the pending spin PDA and the ORAO request account:
 *  - placing: transaction in flight
 *  - awaitingOracle: request pending, oracle working (~5s)
 *  - refundable: request fulfilled but callback never resolved the spin, or
 *    the callback deadline elapsed
 *  - resolved: callback ran, pending spin status is Resolved
 */
export function useSpinStatus(seed: Uint8Array | null, placing: boolean) {
  const client = useAppClient();
  const pending = usePendingSpin(seed);
  const request = useVrfRequest(seed);
  const networkState = useNetworkState();

  const [slotState, setSlotState] = useState<{
    key: string;
    slot: bigint;
  } | null>(null);
  const seedKey = seed != null ? Array.from(seed).join(",") : null;

  useEffect(() => {
    if (!seed || !seedKey) return;
    let cancelled = false;
    const tick = async () => {
      const value = await client.rpc
        .getSlot({ commitment: "confirmed" })
        .send()
        .catch(() => null);
      if (!cancelled && value != null) {
        setSlotState({ key: seedKey, slot: BigInt(value) });
      }
    };
    void tick();
    const id = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, seed, seedKey]);
  const slot =
    slotState != null && slotState.key === seedKey ? slotState.slot : null;

  const status: SpinStatus = useMemo(() => {
    if (!seed) return "idle";
    if (placing) return "placing";
    const pendingData = pending.data;
    const requestData = request.data;

    if (pendingData?.status === PendingStatus.Resolved) return "resolved";
    if (requestData?.state === "Fulfilled") return "refundable";
    if (
      requestData?.state === "Pending" &&
      networkState.data &&
      slot != null &&
      slot - requestData.slot > networkState.data.callbackDeadline
    ) {
      return "refundable";
    }
    return "awaitingOracle";
  }, [seed, placing, pending.data, request.data, networkState.data, slot]);

  return {
    status,
    pending,
    request,
    networkState,
    slot,
  };
}
