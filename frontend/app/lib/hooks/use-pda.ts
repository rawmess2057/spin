"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getProgramDerivedAddress,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";

type SeedPart = string | number | ReadonlyUint8Array;

function encodeSeedPart(part: SeedPart): Uint8Array {
  if (typeof part === "string") return new TextEncoder().encode(part);
  if (typeof part === "number") return Uint8Array.of(part);
  return Uint8Array.from(part);
}

/**
 * Computes a PDA on the client. Returns null until the address is derived
 * (or when disabled). The result is only used while it matches the current
 * seed key, so stale values never leak across parameter changes.
 */
export function usePda(
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
      .catch((err) => {
        console.error("usePda: PDA derivation failed", key, err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!enabled) return null;
  return state?.key === key ? state.address : null;
}
