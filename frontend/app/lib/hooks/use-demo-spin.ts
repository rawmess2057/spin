"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { lamportsToDiamonds, diamondsToLamports } from "../diamonds";

/**
 * The surface a game's controls need from a bet hook. `useVaultSpin` returns
 * a superset of this; `useDemoSpin` returns exactly this plus demo extras, so
 * a game can switch from demo to on-chain by swapping the hook call.
 */
export type SpinSurface = {
  balance: bigint | null;
  minBet: bigint | null;
  maxBet: bigint | null;
  isSending: boolean;
  rolling: boolean;
  sessionReady: boolean;
  spendLeft: bigint;
  betErrors: (lamports: bigint | null) => string[];
  placeBet: (lamports: bigint, target: bigint) => Promise<boolean>;
  reset: () => void;
};

const STORAGE_KEY = "spin.demo.balance.v1";
const DEFAULT_MIN_SPIN_MS = 700;

function readStored(): bigint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || !/^\d+$/.test(raw)) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

function writeStored(value: bigint): void {
  try {
    localStorage.setItem(STORAGE_KEY, value.toString());
  } catch {
    // storage unavailable — the balance just lives in memory for the session
  }
}

// The balance lives in a tiny module store so React reads it through
// useSyncExternalStore: the server snapshot is null, the client snapshot is
// the persisted value, and every tab of the game shares one number.
let cached: bigint | undefined;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getBalance(startBalance: bigint): bigint {
  if (cached === undefined) cached = readStored() ?? startBalance;
  return cached;
}
function setStoredBalance(value: bigint): void {
  cached = value;
  writeStored(value);
  for (const l of listeners) l();
}

/**
 * Demo-money bet surface for games that aren't on-chain yet.
 *
 * Mirrors `useVaultSpin`'s lifecycle: `placeBet` snapshots the stake, waits
 * the minimum spin duration, then calls `evaluate` with 64 bytes of fresh
 * CSPRNG randomness (the same shape the reveal chain produces) and credits
 * the payout. The balance is a local number persisted in localStorage.
 */
export function useDemoSpin<T extends { payout: bigint }>({
  evaluate,
  minSpinMs = DEFAULT_MIN_SPIN_MS,
  minBet = diamondsToLamports(10n),
  maxBet = diamondsToLamports(1_000n),
  startBalance = diamondsToLamports(10_000n),
}: {
  evaluate: (randomness: Uint8Array, bet: bigint) => T;
  minSpinMs?: number;
  minBet?: bigint;
  maxBet?: bigint;
  startBalance?: bigint;
}) {
  // null until hydrated, so server and first client render agree.
  const balance = useSyncExternalStore(
    subscribe,
    () => getBalance(startBalance),
    () => null
  );
  const [status, setStatus] = useState<"idle" | "placing" | "resolved">("idle");
  const [outcome, setOutcome] = useState<T | null>(null);
  const [betLamports, setBetLamports] = useState<bigint | null>(null);

  const evaluateRef = useRef(evaluate);
  const mounted = useRef(true);
  useEffect(() => {
    evaluateRef.current = evaluate;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const commitBalance = useCallback((next: bigint) => {
    setStoredBalance(next);
  }, []);

  const betErrors = useCallback(
    (lamports: bigint | null): string[] => {
      const out: string[] = [];
      if (lamports == null) return ["Enter a whole number of diamonds."];
      if (lamports < minBet) {
        out.push(
          `Bet below minimum (${lamportsToDiamonds(minBet).toLocaleString("en-US")} 💎).`
        );
      }
      if (lamports > maxBet) {
        out.push(
          `Bet above maximum (${lamportsToDiamonds(maxBet).toLocaleString("en-US")} 💎).`
        );
      }
      if (balance != null && lamports > balance) {
        out.push("Not enough diamonds — refill the demo balance.");
      }
      return out;
    },
    [minBet, maxBet, balance]
  );

  const placeBet = useCallback(
    async (lamports: bigint, target: bigint): Promise<boolean> => {
      void target; // unused in demo mode; kept for SpinSurface parity
      const current = getBalance(startBalance);
      if (lamports < minBet || lamports > maxBet || lamports > current) {
        return false;
      }
      const startedAt = performance.now();
      commitBalance(current - lamports);
      setBetLamports(lamports);
      setStatus("placing");

      const randomness = new Uint8Array(64);
      crypto.getRandomValues(randomness);

      const waitMs = Math.max(0, minSpinMs - (performance.now() - startedAt));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      if (!mounted.current) return false;

      const result = evaluateRef.current(randomness, lamports);
      if (result.payout > 0n) {
        commitBalance(getBalance(startBalance) + result.payout);
      }
      setOutcome(result);
      setStatus("resolved");
      return true;
    },
    [minBet, maxBet, minSpinMs, commitBalance, startBalance]
  );

  const reset = useCallback(() => {
    setOutcome(null);
    setBetLamports(null);
    setStatus("idle");
  }, []);

  const refill = useCallback(() => {
    commitBalance(startBalance);
  }, [commitBalance, startBalance]);

  return {
    isDemo: true as const,
    balance,
    minBet,
    maxBet,
    isSending: false,
    rolling: status === "placing",
    sessionReady: true,
    spendLeft: balance ?? 0n,
    betErrors,
    placeBet,
    reset,
    refill,
    status,
    outcome,
    bet: betLamports,
  };
}
