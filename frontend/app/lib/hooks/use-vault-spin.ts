"use client";

import { createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import {
  getChainStateDecoder,
  SPIN_ERROR__CHAIN_STALE,
  SPIN_PROGRAM_ADDRESS,
} from "../solana/client";
import {
  chainRandomness,
  fetchNextReveal,
  hexToBytes,
  type RevealError,
  type RevealResponse,
} from "../solana/chain";
import { getProgramErrorCode, parseTransactionError } from "../solana/errors";
import { useAppClient } from "./use-app-client";
import { useGameConfig } from "./use-game-config";
import { useHouse } from "./use-house";
import { useCluster } from "./use-cluster";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";
import { useSend } from "./use-send";
import { useSessionKey } from "./use-session-key";
import { useVault } from "./use-vault";
import { lamportsToDiamonds } from "../diamonds";

/** Minimum spin duration — the outcome is known instantly, so it is held back
 * until the screen's own spin animation would have run its course. */
const DEFAULT_MIN_SPIN_MS = 2200;
const REVEAL_RETRY_MS = 5000; // backoff after a failed reveal fetch
const SLOT_POLL_MS = 10_000; // session-expiry clock

function revealErrorMessage(e: unknown): string {
  const r = e as RevealError;
  if (r && typeof r.error === "string") {
    switch (r.error) {
      case "chain_not_found":
      case "chain_inactive":
        return "The house's reveal chain isn't active yet.";
      case "vrf_enabled":
        return "The house is still running in VRF mode.";
      case "chain_exhausted":
        return "The reveal chain is exhausted — the house is rotating a new one.";
      case "chain_broken":
        return `Reveal service issue: ${r.detail ?? "chain rotated"}`;
      default:
        return `Reveal service error: ${r.error}`;
    }
  }
  return "Can't reach the reveal service — spins are unavailable right now.";
}

/**
 * Everything a game screen needs to place a spin against the player's credit
 * vault, signed by their session key so no wallet prompt appears.
 *
 * Spins go through the instant reveal chain: the reveal service hands out the
 * reveal at the chain head, the `spin_chain` instruction settles the bet
 * atomically in one transaction, and the outcome is derived client-side from
 * `reveal || sha256(reveal)` — the same math the program ran. No oracle wait,
 * no pending state, no refund path.
 */
export function useVaultSpin<T>({
  gameId,
  evaluate,
  minSpinMs = DEFAULT_MIN_SPIN_MS,
}: {
  gameId: number;
  evaluate: (randomness: Uint8Array, bet: bigint) => T;
  minSpinMs?: number;
}) {
  const client = useAppClient();
  const connectedRaw = useConnectedWallet(client);
  const { run, isSending } = useSend();
  const session = useSessionKey();
  const { getExplorerUrl } = useCluster();

  // Wallet-standard can restore a connection before React hydrates, so the
  // client's first render would otherwise branch on `connected` differently
  // from the server's, throwing a hydration mismatch that leaves game
  // controls unbound (a physically-rendered but dead interface). Hold the
  // app in its disconnected state until after hydration.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const connected = hydrated ? connectedRaw : null;

  const player = connected ? address(connected.account.address) : undefined;
  const vault = useVault(player);
  const config = useGameConfig(gameId);
  const house = useHouse();
  const chainAddress = usePda(SPIN_PROGRAM_ADDRESS, ["chain"]);
  const chain = useAccountData(chainAddress, (data) =>
    getChainStateDecoder().decode(data)
  );

  const [status, setStatus] = useState<
    "idle" | "fetching" | "placing" | "resolved"
  >("idle");
  const [outcome, setOutcome] = useState<T | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  // The stake is snapshotted when the bet is sent, so a control moved
  // mid-spin can't change how the result is read.
  const [betLamports, setBetLamports] = useState<bigint | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  // The next reveal is prefetched while idle so click -> tx is instant. It is
  // only valid while it matches the chain head; the program rejects anything
  // else with ChainStale, which the client retries with a fresh reveal.
  const revealRef = useRef<RevealResponse | null>(null);
  const spinStartedAt = useRef(0);
  const failedAt = useRef(0);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  });

  const chainData = chain.data;
  const chainLive =
    chainData != null && chainData.active && !chainData.vrfEnabled;
  const chainHead = chainData?.index ?? null;

  // Slot clock for session-key expiry checks.
  const [slot, setSlot] = useState<bigint | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const value = await client.rpc
        .getSlot({ commitment: "confirmed" })
        .send()
        .catch(() => null);
      if (!cancelled && value != null) setSlot(BigInt(value));
      timer = setTimeout(tick, SLOT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client]);

  // Prefetch the next reveal while idle. Failed fetches back off so a dead
  // service doesn't hammer the network; the banner keeps the player informed.
  useEffect(() => {
    if (status !== "idle" || !chainLive) return;
    if (revealRef.current != null && chainHead != null) {
      if (revealRef.current.index === Number(chainHead)) return;
      revealRef.current = null;
    }
    if (Date.now() - failedAt.current < REVEAL_RETRY_MS) return;
    let cancelled = false;
    setStatus("fetching");
    fetchNextReveal()
      .then((r) => {
        if (!cancelled && statusRef.current === "idle") revealRef.current = r;
      })
      .catch((e) => {
        if (!cancelled) {
          failedAt.current = Date.now();
          setChainError(revealErrorMessage(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatus((s) => (s === "fetching" ? "idle" : s));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, chainLive, chainHead]);

  const minBet = config.data?.minBet ?? null;
  const maxBet = config.data?.maxBet ?? null;
  const balance = vault.data?.balance ?? null;

  const delegate = vault.data?.delegate ?? null;
  const sessionArmed =
    session.signer != null &&
    delegate != null &&
    delegate === (session.signer.address as string);
  const spendLeft = vault.data?.delegateSpendLeft ?? 0n;
  const expirySlot = vault.data?.delegateExpiry ?? 0n;
  const sessionExpired = sessionArmed && slot != null && slot >= expirySlot;

  /** True when the session key can sign the next bet without a wallet prompt. */
  const sessionReady = sessionArmed && !sessionExpired && spendLeft > 0n;

  const networkProblem =
    config.error != null || house.error != null || vault.error != null;
  const connecting = connected != null && (config.isLoading || house.isLoading);

  const betErrors = useCallback(
    (lamports: bigint | null): string[] => {
      const out: string[] = [];
      if (lamports == null) return ["Enter a whole number of diamonds."];
      if (minBet != null && lamports < minBet) {
        out.push(
          `Bet below minimum (${lamportsToDiamonds(minBet).toLocaleString("en-US")} 💎).`
        );
      }
      if (maxBet != null && lamports > maxBet) {
        out.push(
          `Bet above maximum (${lamportsToDiamonds(maxBet).toLocaleString("en-US")} 💎).`
        );
      }
      if (balance != null && lamports > balance) {
        out.push("Not enough diamonds — buy in to keep playing.");
      }
      if (sessionReady && lamports > spendLeft) {
        out.push("Bet exceeds this session's remaining limit.");
      }
      return out;
    },
    [minBet, maxBet, balance, sessionReady, spendLeft]
  );

  /**
   * Sends the spin. Signed by the session key when one is armed, otherwise by
   * the player's wallet (which prompts) — so the game still works before the
   * player has started a session.
   *
   * The reveal is sent with the transaction and consumed atomically: the
   * program checks it against the chain head and rejects a raced reveal with
   * ChainStale, which is retried once with a fresh fetch.
   */
  const placeBet = useCallback(
    async (lamports: bigint, target: bigint) => {
      const walletSigner = connected?.signer;
      const authority = sessionReady ? session.signer : walletSigner;
      if (!authority || !player) return false;
      setChainError(null);
      spinStartedAt.current = performance.now();

      for (let attempt = 0; attempt < 2; attempt++) {
        let r = revealRef.current;
        if (r == null || (chainHead != null && r.index !== Number(chainHead))) {
          setStatus("fetching");
          try {
            r = await fetchNextReveal();
          } catch (e) {
            setChainError(revealErrorMessage(e));
            setStatus("idle");
            return false;
          }
        }
        revealRef.current = null;
        setBetLamports(lamports);
        setStatus("placing");

        try {
          const result = await client.spin.instructions
            .spinChain({
              player,
              authority,
              gameId,
              amount: lamports,
              target,
              reveal: hexToBytes(r.reveal),
            })
            .sendTransaction();
          const sig = result.context.signature;
          setLastSig(sig);
          toast.success("Spin placed", {
            description: createElement(
              "a",
              {
                href: getExplorerUrl(`/tx/${sig}`),
                target: "_blank",
                rel: "noopener noreferrer",
                className: "underline",
              },
              "View transaction"
            ),
          });

          // Hold the outcome back until the spin's minimum duration, so the
          // reels still read as a spin rather than an instant reveal.
          const waitMs = Math.max(
            0,
            minSpinMs - (performance.now() - spinStartedAt.current)
          );
          if (waitMs > 0)
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          setOutcome(evaluate(chainRandomness(hexToBytes(r.reveal)), lamports));
          setStatus("resolved");
          return true;
        } catch (err) {
          console.error(err);
          const code = getProgramErrorCode(err);
          if (attempt === 0 && code === SPIN_ERROR__CHAIN_STALE) {
            continue;
          }
          toast.error(parseTransactionError(err));
          setStatus("idle");
          setBetLamports(null);
          return false;
        }
      }
      setStatus("idle");
      setBetLamports(null);
      return false;
    },
    // `evaluate` is redefined every render by callers; the reveal and the
    // frozen bet are what actually determine the outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      client,
      connected,
      gameId,
      player,
      chainHead,
      getExplorerUrl,
      minSpinMs,
      run,
      session.signer,
      sessionReady,
    ]
  );

  const reset = useCallback(() => {
    setOutcome(null);
    setBetLamports(null);
    setLastSig(null);
    setStatus("idle");
  }, []);

  return {
    // identity + chain state
    player,
    connected,
    vault,
    config,
    house,
    chain,
    balance,
    minBet,
    maxBet,
    connecting,
    networkProblem,
    chainError,
    chainLive,
    // session key
    session,
    sessionArmed,
    sessionExpired,
    sessionReady,
    spendLeft,
    // spin lifecycle
    status,
    outcome,
    bet: betLamports,
    lastSig,
    isSending,
    rolling: status === "placing",
    betErrors,
    placeBet,
    reset,
  };
}
