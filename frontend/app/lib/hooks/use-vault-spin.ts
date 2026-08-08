"use client";

import { useCallback, useMemo, useState } from "react";
import { address, type Address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "./use-app-client";
import { useGameConfig } from "./use-game-config";
import { useHouse } from "./use-house";
import { useSend } from "./use-send";
import { useSessionKey } from "./use-session-key";
import { useSpinStatus } from "./use-spin-status";
import { useVault } from "./use-vault";
import { lamportsToDiamonds } from "../diamonds";

/**
 * Everything a game screen needs to place a spin against the player's credit
 * vault, signed by their session key so no wallet prompt appears.
 *
 * The outcome still comes from the on-chain ORAO VRF callback — this hook only
 * changes who signs and where the stake comes from. `randomness` is exposed so
 * the screen can run the same eval the program ran and animate the result.
 */
export function useVaultSpin<T>({
  gameId,
  evaluate,
}: {
  gameId: number;
  evaluate: (randomness: Uint8Array, bet: bigint) => T;
}) {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { run, isSending } = useSend();
  const session = useSessionKey();

  const player = connected ? address(connected.account.address) : undefined;
  const vault = useVault(player);
  const config = useGameConfig(gameId);
  const house = useHouse();

  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [placing, setPlacing] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  // The stake and any per-game parameter are snapshotted when the bet is sent,
  // so a control moved mid-spin can't change how the result is read.
  const [betLamports, setBetLamports] = useState<bigint | null>(null);

  const spin = useSpinStatus(seed, placing);
  const randomness = spin.request.data?.randomness ?? null;
  const outcome = useMemo(
    () =>
      randomness && betLamports != null
        ? evaluate(randomness, betLamports)
        : null,
    // `evaluate` is redefined every render by callers; the randomness and the
    // frozen bet are what actually determine the outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [randomness, betLamports]
  );

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
  const slot = spin.slot;
  const sessionExpired =
    sessionArmed && slot != null && BigInt(slot) >= expirySlot;

  /** True when the session key can sign the next bet without a wallet prompt. */
  const sessionReady = sessionArmed && !sessionExpired && spendLeft > 0n;

  const networkProblem =
    config.error != null || house.error != null || vault.error != null;
  const connecting =
    connected != null && (config.isLoading || house.isLoading);

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
   * Sends the bet. Signed by the session key when one is armed, otherwise by
   * the player's wallet (which prompts) — so the game still works before the
   * player has started a session.
   */
  const placeBet = useCallback(
    async (lamports: bigint, target: bigint) => {
      const walletSigner = connected?.signer;
      const authority = sessionReady ? session.signer : walletSigner;
      if (!authority || !player) return false;

      const newSeed = crypto.getRandomValues(new Uint8Array(32));
      setSeed(newSeed);
      setBetLamports(lamports);
      setPlacing(true);
      const sig = await run(
        () =>
          client.spin.instructions
            .placeBet({
              player,
              authority,
              gameId,
              amount: lamports,
              target,
              seed: newSeed,
            })
            .sendTransaction(),
        "Bet placed"
      );
      setPlacing(false);
      if (sig) {
        setLastSig(sig);
        return true;
      }
      setSeed(null);
      setBetLamports(null);
      return false;
    },
    [client, connected, gameId, player, run, session.signer, sessionReady]
  );

  const refund = useCallback(async () => {
    const walletSigner = connected?.signer;
    if (!walletSigner || !seed || !player) return;
    // Rent went to whoever paid it — the session key when one signed the bet.
    const rentPayer = (sessionReady && session.signer
      ? session.signer.address
      : walletSigner.address) as Address;
    await run(
      () =>
        client.spin.instructions
          .refundSpin({ player, authority: walletSigner, rentPayer, seed })
          .sendTransaction(),
      "Spin refunded"
    );
    setSeed(null);
    setBetLamports(null);
    setLastSig(null);
  }, [client, connected, player, run, seed, session.signer, sessionReady]);

  const reset = useCallback(() => {
    setSeed(null);
    setBetLamports(null);
    setLastSig(null);
  }, []);

  return {
    // identity + chain state
    player,
    connected,
    vault,
    config,
    house,
    balance,
    minBet,
    maxBet,
    connecting,
    networkProblem,
    // session key
    session,
    sessionArmed,
    sessionExpired,
    sessionReady,
    spendLeft,
    // spin lifecycle
    status: spin.status,
    outcome,
    bet: betLamports,
    lastSig,
    isSending,
    rolling:
      seed != null &&
      !outcome &&
      (spin.status === "placing" || spin.status === "awaitingOracle"),
    betErrors,
    placeBet,
    refund,
    reset,
  };
}
