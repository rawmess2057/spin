"use client";

import { useEffect, useMemo, useState } from "react";
import { getProgramDerivedAddress, type Address } from "@solana/kit";
import {
  parseGameConfig,
  parseHouseTreasury,
  parseNetworkState,
  parsePendingSpin,
  parsePlayerSession,
  parseRequestAccount,
  type PendingSpinData,
  type RequestAccountData,
} from "../spin/accounts";
import { GAME_SLOTS, PROGRAM_ID, VRF_PROGRAM_ID } from "../spin/config";
import { useAccountData } from "./use-account";
import { useAppClient } from "../client-provider";

type SeedPart = string | number | Uint8Array;

function encodeSeedPart(part: SeedPart): Uint8Array {
  if (typeof part === "string") return new TextEncoder().encode(part);
  if (typeof part === "number") return Uint8Array.of(part);
  return part;
}

/**
 * Computes a PDA on the client. Returns null until the address is derived
 * (or when disabled). The result is only used while it matches the current
 * seed key, so stale values never leak across parameter changes.
 */
function usePda(
  program: string,
  parts: ReadonlyArray<SeedPart>,
  enabled = true
): Address | null {
  const key = useMemo(
    () =>
      JSON.stringify([
        program,
        enabled,
        ...parts.map((p) =>
          typeof p === "string" || typeof p === "number" ? p : Array.from(p)
        ),
      ]),
    [program, enabled, parts]
  );
  const [state, setState] = useState<{ key: string; address: Address } | null>(
    null
  );

  // Callers pass a fresh `parts` array reference on every render, so the
  // effect must not depend on it. `key` is a JSON string that encodes
  // `program`, `enabled` and every seed part, and it changes exactly when any
  // of those change, so it is the only dependency the effect needs; the
  // closure captures the matching values whenever it re-runs.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getProgramDerivedAddress({
      programAddress: program as Address,
      seeds: parts.map(encodeSeedPart),
    })
      .then(([addr]) => {
        if (!cancelled) setState({ key, address: addr });
      })
      .catch(() => {
        // PDA derivation failed; stay unset.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!enabled) return null;
  return state?.key === key ? state.address : null;
}

export function useHouse() {
  const address = usePda(PROGRAM_ID, ["house"]);
  return useAccountData(address, parseHouseTreasury);
}

export function useGameConfig(gameId: number = GAME_SLOTS) {
  const address = usePda(PROGRAM_ID, ["game_config", gameId]);
  return useAccountData(address, parseGameConfig);
}

export function useNetworkState() {
  const address = usePda(VRF_PROGRAM_ID, ["OraoVrfCbConfig"]);
  return useAccountData(address, parseNetworkState);
}

export function usePlayerSession(player: Address | null) {
  const address = usePda(
    PROGRAM_ID,
    ["session", player ?? new Uint8Array(32)],
    player != null
  );
  return useAccountData(address, parsePlayerSession);
}

export function usePendingSpin(seed: Uint8Array | null) {
  const address = usePda(
    PROGRAM_ID,
    ["pending", seed ?? new Uint8Array(32)],
    seed != null
  );
  return useAccountData(address, parsePendingSpin);
}

export function useVrfRequest(seed: Uint8Array | null) {
  const vrfState = usePda(PROGRAM_ID, ["vrf_state"]);
  const client = usePda(
    VRF_PROGRAM_ID,
    ["OraoVrfCbClient", PROGRAM_ID, vrfState ?? new Uint8Array(32)],
    vrfState != null
  );
  const request = usePda(
    VRF_PROGRAM_ID,
    [
      "OraoVrfCbRequest",
      client ?? new Uint8Array(32),
      seed ?? new Uint8Array(32),
    ],
    client != null && seed != null
  );
  return useAccountData(request, parseRequestAccount);
}

export type SpinStatus =
  "idle" | "placing" | "awaitingOracle" | "refundable" | "resolved";

/**
 * Tracks a live spin through its lifecycle using the pending spin PDA and the
 * ORAO request account:
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
    const pendingData: PendingSpinData | null = pending.data;
    const requestData: RequestAccountData | null = request.data;

    if (pendingData?.status === "Resolved") return "resolved";
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
