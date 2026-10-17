"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { address } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import { useAppClient } from "./use-app-client";
import { useBalance } from "./use-balance";
import { useSend } from "./use-send";
import { useSessionKey } from "./use-session-key";
import { useBetAccount, useVault } from "./use-vault";
import { BET_TIMEOUT_SLOTS } from "./use-vault-spin";
import { parseTransactionError } from "../solana/errors";

/** ~2.5 slots a second, so one approval lasts roughly a day. */
export const SESSION_SLOTS = 200_000n;
/** SOL kept on the session key for transaction fees (~5k lamports a bet). */
export const SESSION_FEE_FLOAT = 20_000_000n;
export const SESSION_FEE_MIN = 5_000_000n;
export const BUY_PRESETS = [0.05, 0.1, 0.25, 0.5];
const SLOT_POLL_MS = 4_000;

/**
 * Everything the cashier needs: the player's chips, wallet SOL, session key
 * state, any open bet, and the actions that move money. Chips (💎) are SOL
 * in the player's vault at a fixed 1 💎 = 0.0001 SOL. The buy is one
 * transaction that funds the session key (if it needs fees), deposits, and
 * arms the session key with a net-loss allowance equal to the whole stack,
 * so the player approves once and plays without prompts.
 */
export function useCashier() {
  const client = useAppClient();
  const connectedRaw = useConnectedWallet(client);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const connected = hydrated ? connectedRaw : null;
  const player = connected ? address(connected.account.address) : undefined;

  const { run, isSending } = useSend();
  const session = useSessionKey();
  const wallet = useBalance(player);
  const vault = useVault(player);
  const bet = useBetAccount(player);
  const sessionAddress = session.signer?.address ?? null;
  const sessionWallet = useBalance(sessionAddress ?? undefined);

  const [slot, setSlot] = useState<bigint | null>(null);
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const v = await client.rpc
        .getSlot({ commitment: "confirmed" })
        .send()
        .catch(() => null);
      if (!cancelled && v != null) setSlot(BigInt(v));
      timer = setTimeout(tick, SLOT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, player]);

  const balance = vault.data?.balance ?? 0n;
  const delegate = vault.data?.delegate ?? null;
  const sessionArmed =
    sessionAddress != null && delegate != null && delegate === sessionAddress;
  const spendLeft = vault.data?.delegateSpendLeft ?? 0n;
  const expirySlot = vault.data?.delegateExpiry ?? 0n;
  const sessionExpired = sessionArmed && slot != null && slot >= expirySlot;
  const sessionReady = sessionArmed && !sessionExpired && spendLeft > 0n;
  const sessionNeedsFloat =
    sessionWallet.lamports == null || sessionWallet.lamports < SESSION_FEE_MIN;
  const floatLamports = sessionNeedsFloat ? SESSION_FEE_FLOAT : 0n;

  const openBet = bet.openBet;
  const ageSlots =
    openBet != null && slot != null ? slot - openBet.placedSlot : null;
  const canCancel = ageSlots != null && ageSlots >= BET_TIMEOUT_SLOTS;
  const refundInSeconds =
    ageSlots == null
      ? null
      : Math.max(0, Math.ceil(Number(BET_TIMEOUT_SLOTS - ageSlots) * 0.4));

  const buy = useCallback(
    async (amountLamports: bigint): Promise<boolean> => {
      const signer = connected?.signer;
      if (!signer || !sessionAddress || amountLamports <= 0n) return false;
      const current = BigInt(await client.rpc.getSlot().send());
      const expiry = current + SESSION_SLOTS;
      const ok = await run(async () => {
        const ixs = [];
        if (floatLamports > 0n) {
          ixs.push(
            getTransferSolInstruction({
              source: signer,
              destination: sessionAddress,
              amount: floatLamports,
            })
          );
        }
        ixs.push(
          await client.spin.instructions.deposit({
            player: signer,
            amount: amountLamports,
          })
        );
        ixs.push(
          await client.spin.instructions.setDelegate({
            player: signer,
            delegate: sessionAddress,
            expirySlot: expiry,
            spendLimit: balance + amountLamports,
          })
        );
        return client.sendTransaction(ixs);
      }, "Chips bought — session active");
      return ok != null;
    },
    [client, connected, run, sessionAddress, floatLamports, balance]
  );

  const cashOut = useCallback(
    async (lamports: bigint): Promise<boolean> => {
      const signer = connected?.signer;
      if (!signer || lamports <= 0n) return false;
      const ok = await run(
        () =>
          client.spin.instructions
            .withdraw({ player: signer, amount: lamports })
            .sendTransaction(),
        "Cashed out to your wallet"
      );
      return ok != null;
    },
    [client, connected, run]
  );

  const rearm = useCallback(async (): Promise<boolean> => {
    const signer = connected?.signer;
    if (!signer || !sessionAddress) return false;
    const current = BigInt(await client.rpc.getSlot().send());
    const ok = await run(
      () =>
        client.spin.instructions
          .setDelegate({
            player: signer,
            delegate: sessionAddress,
            expirySlot: current + SESSION_SLOTS,
            spendLimit: balance > 0n ? balance : 1n,
          })
          .sendTransaction(),
      "Session armed for about a day"
    );
    return ok != null;
  }, [client, connected, run, sessionAddress, balance]);

  const revoke = useCallback(async (): Promise<boolean> => {
    const signer = connected?.signer;
    if (!signer) return false;
    const ok = await run(
      () =>
        client.spin.instructions
          .revokeDelegate({ player: signer })
          .sendTransaction(),
      "Session key revoked"
    );
    return ok != null;
  }, [client, connected, run]);

  const refund = useCallback(async (): Promise<boolean> => {
    const signer = connected?.signer;
    if (!signer || !player || !canCancel) return false;
    try {
      await client.spin.instructions
        .cancelBet({ caller: signer, player })
        .sendTransaction();
      toast.success("Bet refunded");
      return true;
    } catch (err) {
      toast.error(parseTransactionError(err));
      return false;
    }
  }, [client, connected, player, canCancel]);

  return {
    hydrated,
    player,
    walletLamports: wallet.lamports,
    vault,
    balance,
    hasVault: vault.data != null,
    sessionAddress,
    sessionArmed,
    sessionExpired,
    sessionReady,
    spendLeft,
    expirySlot,
    slot,
    floatLamports,
    openBet,
    lastBet: bet.data,
    canCancel,
    refundInSeconds,
    isSending,
    buy,
    cashOut,
    rearm,
    revoke,
    refund,
  };
}

export type Cashier = ReturnType<typeof useCashier>;
