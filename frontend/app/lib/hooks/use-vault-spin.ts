"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { address, type Address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import {
  BetStatus,
  getChainStateDecoder,
  SPIN_PROGRAM_ADDRESS,
} from "../solana/client";
import { deriveRandomness, randomClientSeed } from "../solana/fairness";
import { parseTransactionError } from "../solana/errors";
import { useAppClient } from "./use-app-client";
import { useGameConfig } from "./use-game-config";
import { useHouse } from "./use-house";
import { useCluster } from "./use-cluster";
import { usePda } from "./use-pda";
import { useAccountData } from "./use-account-data";
import { useSend } from "./use-send";
import { useSessionKey } from "./use-session-key";
import { useBetAccount, useCreditLedger, useVault } from "./use-vault";
import { lamportsToDiamonds } from "../diamonds";

/** Minimum spin duration: the settlement usually lands in 1.5–3 s, and the
 * screen's own spin animation should cover that wait rather than end early. */
const DEFAULT_MIN_SPIN_MS = 2200;
const SLOT_POLL_MS = 4_000;
/** Mirrors BET_TIMEOUT_SLOTS in programs/spin/src/constants.rs. */
export const BET_TIMEOUT_SLOTS = 150n;
/** After this long without a settlement the UI says the house is slow. */
export const SETTLE_SLOW_MS = 8_000;
/** Mirrors MAX_PAYOUT_BANKROLL_DIVISOR in the program. */
const MAX_PAYOUT_BANKROLL_DIVISOR = 4n;

type Pending = {
  nonce: bigint;
  clientSeed: Uint8Array;
  lamports: bigint;
  target: bigint;
  startedAt: number;
};

export type SpinStatus = "idle" | "placing" | "awaiting" | "resolved";

/**
 * Everything a game screen needs to place a bet against the player's credit
 * vault, signed by their session key so no wallet prompt appears.
 *
 * Two steps: `place_bet` goes on-chain with a fresh client seed; the house's
 * settlement crank then reveals the next link of its commit-reveal chain and
 * `settle_bet` writes the result into the player's bet account, which this
 * hook streams. The outcome is re-derived here from the reveal + client seed
 * with the same evaluator the program ran, and the payouts must agree — that
 * is the "provably fair" check, done on every single spin.
 */
export function useVaultSpin<T extends { payout: bigint }>({
  gameId,
  evaluate,
  maxMultiplierBp,
  minSpinMs = DEFAULT_MIN_SPIN_MS,
}: {
  gameId: number;
  evaluate: (randomness: Uint8Array, bet: bigint, target: bigint) => T;
  /** The game's largest multiplier for a target; clamps the bet to the bankroll guard. */
  maxMultiplierBp?: (target: bigint) => bigint;
  minSpinMs?: number;
}) {
  const client = useAppClient();
  const connectedRaw = useConnectedWallet(client);
  const { isSending } = useSend();
  const session = useSessionKey();
  const { getExplorerUrl } = useCluster();

  // Wallet-standard can restore a connection before React hydrates, so the
  // client's first render would otherwise branch on `connected` differently
  // from the server's. Hold the disconnected state until after hydration.
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
  const ledger = useCreditLedger();
  const chainAddress = usePda(SPIN_PROGRAM_ADDRESS, ["chain2"]);
  const chain = useAccountData(chainAddress, (data) =>
    getChainStateDecoder().decode(data)
  );
  const bet = useBetAccount(player);

  const [status, setStatus] = useState<SpinStatus>("idle");
  const [outcome, setOutcome] = useState<T | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [betLamports, setBetLamports] = useState<bigint | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  const pendingRef = useRef<Pending | null>(null);
  const evaluateRef = useRef(evaluate);
  useEffect(() => {
    evaluateRef.current = evaluate;
  });

  const chainData = chain.data;
  const chainLive =
    chainData != null && chainData.active && chainData.index < chainData.length;

  // Slot clock for session-key expiry and bet-timeout checks.
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

  const minBet = config.data?.minBet ?? null;
  const configMaxBet = config.data?.maxBet ?? null;
  const balance = vault.data?.balance ?? null;

  // The program refuses a bet whose best case exceeds a quarter of the free
  // bankroll; mirror that so the chip ladder never offers a doomed bet.
  const treasuryLamports = house.lamports;
  const freeBankroll =
    treasuryLamports != null && ledger.data != null
      ? BigInt(treasuryLamports) - ledger.data.total - ledger.data.reserved
      : null;
  const bankrollMaxBet = useCallback(
    (target: bigint): bigint | null => {
      if (freeBankroll == null || maxMultiplierBp == null) return null;
      const mult = maxMultiplierBp(target);
      if (mult <= 0n) return null;
      const cap = freeBankroll / MAX_PAYOUT_BANKROLL_DIVISOR;
      return (cap * 10_000n) / mult;
    },
    [freeBankroll, maxMultiplierBp]
  );
  const maxBet = configMaxBet;

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

  // --- open bet tracking ----------------------------------------------------

  const betData = bet.data;
  const openBet = bet.openBet;
  const openBetAgeSlots =
    openBet != null && slot != null ? slot - openBet.placedSlot : null;
  const canCancel =
    openBetAgeSlots != null && openBetAgeSlots >= BET_TIMEOUT_SLOTS;

  // A bet left open from a previous page load is still ours to wait on.
  useEffect(() => {
    if (openBet != null && status === "idle" && pendingRef.current == null) {
      const t = setTimeout(() => {
        setStatus("awaiting");
        setBetLamports(openBet.amount);
      });
      return () => clearTimeout(t);
    }
  }, [openBet, status]);

  // Settlement: the bet account flips to Settled with the reveal and payout.
  // State updates are scheduled (not run synchronously in the effect) so the
  // hook never cascades renders from inside the subscription callback.
  useEffect(() => {
    if (betData == null || status !== "awaiting" || player == null) return;
    const pending = pendingRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (fn: () => void, ms = 0) => {
      timer = setTimeout(fn, ms);
    };

    if (betData.status === BetStatus.Cancelled) {
      if (pending == null || betData.nonce === pending.nonce) {
        pendingRef.current = null;
        schedule(() => {
          setStatus("idle");
          setBetLamports(null);
          toast.info("Bet refunded — the house didn't settle in time.");
        });
      }
    } else if (betData.status === BetStatus.Settled) {
      if (pending == null) {
        // Settled while we weren't watching (reload mid-bet): nothing to
        // replay, the vault balance already reflects it.
        schedule(() => {
          setStatus("idle");
          setBetLamports(null);
        });
      } else if (betData.nonce === pending.nonce) {
        pendingRef.current = null;
        const randomness = deriveRandomness(
          betData.reveal,
          pending.clientSeed,
          player,
          betData.nonce
        );
        let result: T | null = null;
        try {
          result = evaluateRef.current(
            randomness,
            pending.lamports,
            pending.target
          );
        } catch (err) {
          console.error("evaluate failed", err);
        }
        if (result == null) {
          schedule(() => setStatus("idle"));
        } else {
          const ok = result.payout === betData.payout;
          if (!ok) {
            console.error("payout verification failed", {
              local: result.payout.toString(),
              onChain: betData.payout.toString(),
              bet: betData,
            });
          }
          const waitMs = Math.max(
            0,
            minSpinMs - (performance.now() - pending.startedAt)
          );
          const final = result;
          schedule(() => {
            setVerified(ok);
            if (!ok) {
              toast.error(
                "Verification failed: the house's payout doesn't match our replay. Please contact support with this bet."
              );
            }
            setOutcome(final);
            setStatus("resolved");
          }, waitMs);
        }
      }
    }
    return () => {
      if (timer != null) clearTimeout(timer);
    };
  }, [betData, status, player, minSpinMs]);

  // --- bet validation -------------------------------------------------------

  const betErrors = useCallback(
    (lamports: bigint | null, target?: bigint): string[] => {
      const out: string[] = [];
      if (lamports == null) return ["Enter a whole number of chips."];
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
      if (target != null) {
        const cap = bankrollMaxBet(target);
        if (cap != null && lamports > cap) {
          out.push(
            `The house can only cover up to ${lamportsToDiamonds(cap).toLocaleString("en-US")} 💎 on these options.`
          );
        }
      }
      if (balance != null && lamports > balance) {
        out.push("Not enough chips — buy some to keep playing.");
      }
      if (sessionReady && lamports > spendLeft) {
        out.push("Bet exceeds this session's remaining allowance.");
      }
      if (openBet != null) {
        out.push("Your previous bet is still settling.");
      }
      return out;
    },
    [minBet, maxBet, balance, sessionReady, spendLeft, openBet, bankrollMaxBet]
  );

  // --- actions --------------------------------------------------------------

  /**
   * Sends `place_bet`. Signed by the session key when one is armed, otherwise
   * by the player's wallet (which prompts). Resolves once the transaction is
   * confirmed; the outcome arrives later through the bet account stream.
   */
  const placeBet = useCallback(
    async (lamports: bigint, target: bigint) => {
      const walletSigner = connected?.signer;
      const authority = sessionReady ? session.signer : walletSigner;
      if (!authority || !player) return false;
      if (!chainLive) {
        setChainError("The house isn't accepting bets right now.");
        return false;
      }
      setChainError(null);
      setVerified(null);
      const clientSeed = randomClientSeed();
      const nonce = (bet.data?.nonce ?? 0n) + 1n;
      pendingRef.current = {
        nonce,
        clientSeed,
        lamports,
        target,
        startedAt: performance.now(),
      };
      setBetLamports(lamports);
      setStatus("placing");

      try {
        const result = await client.spin.instructions
          .placeBet({
            player,
            authority,
            gameId,
            amount: lamports,
            target,
            clientSeed,
          })
          .sendTransaction();
        const sig = result.context.signature;
        setLastSig(sig);
        toast.success("Bet placed", {
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
        setStatus("awaiting");
        return true;
      } catch (err) {
        console.error(err);
        toast.error(parseTransactionError(err));
        pendingRef.current = null;
        setStatus("idle");
        setBetLamports(null);
        return false;
      }
    },
    [
      client,
      connected,
      gameId,
      player,
      chainLive,
      bet.data?.nonce,
      getExplorerUrl,
      session.signer,
      sessionReady,
    ]
  );

  /** Refunds a bet the house failed to settle within the timeout. */
  const cancelBet = useCallback(async () => {
    const walletSigner = connected?.signer;
    const caller = sessionReady ? session.signer : walletSigner;
    if (!caller || !player || !canCancel) return false;
    try {
      await client.spin.instructions
        .cancelBet({ caller, player })
        .sendTransaction();
      return true;
    } catch (err) {
      console.error(err);
      toast.error(parseTransactionError(err));
      return false;
    }
  }, [client, connected, player, canCancel, session.signer, sessionReady]);

  const reset = useCallback(() => {
    setOutcome(null);
    setBetLamports(null);
    setLastSig(null);
    setVerified(null);
    if (pendingRef.current == null) setStatus("idle");
  }, []);

  return {
    // identity + chain state
    player,
    connected,
    vault,
    config,
    house,
    chain,
    ledger,
    balance,
    minBet,
    maxBet,
    bankrollMaxBet,
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
    expirySlot,
    slot,
    // bet lifecycle
    status,
    outcome,
    bet: betLamports,
    lastBet: betData,
    openBet,
    canCancel,
    verified,
    lastSig,
    isSending,
    rolling: status === "placing" || status === "awaiting",
    betErrors,
    placeBet,
    cancelBet,
    reset,
  };
}

export type VaultSpin<T extends { payout: bigint }> = ReturnType<
  typeof useVaultSpin<T>
>;

export type { Address };
