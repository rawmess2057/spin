"use client";

import { useEffect, useMemo, useState } from "react";
import { address, sol, solToLamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import { useAppClient } from "../../lib/hooks/use-app-client";
import { useBalance } from "../../lib/hooks/use-balance";
import { useSend } from "../../lib/hooks/use-send";
import { useSessionKey } from "../../lib/hooks/use-session-key";
import { useBetAccount, useVault } from "../../lib/hooks/use-vault";
import {
  DIAMOND_LAMPORTS,
  diamondString,
  lamportsToDiamonds,
} from "../../lib/diamonds";
import { solString } from "../../lib/solana/format";
import { parseTransactionError } from "../../lib/solana/errors";
import { BET_TIMEOUT_SLOTS } from "../../lib/hooks/use-vault-spin";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";

export type BuyChipsTab = "buy" | "session" | "cash";

/** ~2.5 slots a second, so one approval lasts roughly a day. */
const SESSION_SLOTS = 200_000n;
/** SOL kept on the session key for transaction fees (~5k lamports a bet). */
const SESSION_FEE_FLOAT = 20_000_000n;
const SESSION_FEE_MIN = 5_000_000n;
const BUY_PRESETS = [0.05, 0.1, 0.25, 0.5];
const SLOT_POLL_MS = 4_000;

/**
 * Buy chips / manage the session key / cash out.
 *
 * Chips (💎) are the in-game credit: SOL deposited into the player's vault at
 * a fixed 1 💎 = 0.0001 SOL. The buy is one transaction that funds the
 * session key, deposits, and authorizes the session key to wager the whole
 * stack, so the player approves once and plays without further prompts. The
 * session key can never withdraw.
 */
export function BuyChipsModal({
  tab,
  onTabChange,
  onClose,
}: {
  tab: BuyChipsTab | null;
  onTabChange: (tab: BuyChipsTab) => void;
  onClose: () => void;
}) {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { run, isSending } = useSend();
  const session = useSessionKey();

  const player = connected ? address(connected.account.address) : undefined;
  const wallet = useBalance(player);
  const vault = useVault(player);
  const bet = useBetAccount(player);
  const sessionAddress = session.signer?.address ?? null;
  const sessionWallet = useBalance(sessionAddress ?? undefined);

  const [amount, setAmount] = useState("0.1");
  const [cashAmount, setCashAmount] = useState("");
  const [slot, setSlot] = useState<bigint | null>(null);

  const open = tab != null;
  useEffect(() => {
    if (!open) return;
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
  }, [client, open]);

  const balance = vault.data?.balance ?? 0n;
  const delegate = vault.data?.delegate ?? null;
  const sessionArmed =
    sessionAddress != null && delegate != null && delegate === sessionAddress;
  const spendLeft = vault.data?.delegateSpendLeft ?? 0n;
  const expirySlot = vault.data?.delegateExpiry ?? 0n;
  const sessionExpired = sessionArmed && slot != null && slot >= expirySlot;
  const sessionReady = sessionArmed && !sessionExpired && spendLeft > 0n;

  const amountLamports = useMemo(() => {
    try {
      return solToLamports(sol(amount as `${number}`));
    } catch {
      return null;
    }
  }, [amount]);

  const sessionNeedsFloat =
    sessionWallet.lamports == null || sessionWallet.lamports < SESSION_FEE_MIN;
  const floatLamports = sessionNeedsFloat ? SESSION_FEE_FLOAT : 0n;

  const canBuy =
    player != null &&
    amountLamports != null &&
    amountLamports > 0n &&
    sessionAddress != null &&
    !isSending &&
    (wallet.lamports == null ||
      wallet.lamports > amountLamports + floatLamports + 10_000n);

  const buy = async () => {
    const signer = connected?.signer;
    if (!signer || amountLamports == null || !sessionAddress) return;
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
          // Net-loss allowance: the whole stack. Wins restore it.
          spendLimit: balance + amountLamports,
        })
      );
      return client.sendTransaction(ixs);
    }, "Chips bought — session active");
    if (ok) onClose();
  };

  const rearm = async () => {
    const signer = connected?.signer;
    if (!signer || !sessionAddress) return;
    const current = BigInt(await client.rpc.getSlot().send());
    await run(
      () =>
        client.spin.instructions
          .setDelegate({
            player: signer,
            delegate: sessionAddress,
            expirySlot: current + SESSION_SLOTS,
            spendLimit: balance > 0n ? balance : 1n,
          })
          .sendTransaction(),
      "Session re-armed for about a day"
    );
  };

  const revoke = async () => {
    const signer = connected?.signer;
    if (!signer) return;
    await run(
      () =>
        client.spin.instructions
          .revokeDelegate({ player: signer })
          .sendTransaction(),
      "Session key revoked"
    );
  };

  const cashLamports = useMemo(() => {
    if (cashAmount.trim() === "") return balance;
    const d = cashAmount.trim().replace(/,/g, "");
    if (!/^\d+$/.test(d)) return null;
    return BigInt(d) * DIAMOND_LAMPORTS;
  }, [cashAmount, balance]);

  const cashOut = async () => {
    const signer = connected?.signer;
    if (!signer || cashLamports == null || cashLamports <= 0n) return;
    const ok = await run(
      () =>
        client.spin.instructions
          .withdraw({ player: signer, amount: cashLamports })
          .sendTransaction(),
      "Cashed out to your wallet"
    );
    if (ok) onClose();
  };

  // Pending bet / refund
  const openBet = bet.openBet;
  const ageSlots =
    openBet != null && slot != null ? slot - openBet.placedSlot : null;
  const canCancel = ageSlots != null && ageSlots >= BET_TIMEOUT_SLOTS;
  const refundInSeconds =
    ageSlots == null
      ? null
      : Math.max(0, Math.ceil(Number(BET_TIMEOUT_SLOTS - ageSlots) * 0.4));
  const refund = async () => {
    const signer = connected?.signer;
    if (!signer || !player) return;
    try {
      await client.spin.instructions
        .cancelBet({ caller: signer, player })
        .sendTransaction();
      toast.success("Bet refunded");
    } catch (err) {
      toast.error(parseTransactionError(err));
    }
  };

  const tabs: { id: BuyChipsTab; label: string }[] = [
    { id: "buy", label: "Buy chips" },
    { id: "session", label: "Session" },
    { id: "cash", label: "Cash out" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Chips">
      {player == null ? (
        <p className="text-sm text-muted">
          Connect a wallet to buy chips. Until then every game runs in demo mode
          with practice chips.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Your chips
              </p>
              <p className="font-mono text-2xl font-black tabular-nums text-gold">
                {diamondString(lamportsToDiamonds(balance))} 💎
              </p>
              <p className="text-[10px] text-muted">
                = {solString(balance)} SOL · 1 💎 ={" "}
                {solString(DIAMOND_LAMPORTS)} SOL
              </p>
            </div>
            <div className="text-right text-[10px] text-muted">
              Wallet
              <div className="font-mono text-xs text-foreground">
                {wallet.lamports == null ? "—" : solString(wallet.lamports)} SOL
              </div>
            </div>
          </div>

          {openBet != null && (
            <div className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-xs">
              <p className="font-semibold text-gold">
                A bet of {diamondString(lamportsToDiamonds(openBet.amount))} 💎
                is waiting for the house to settle.
              </p>
              <p className="mt-1 text-muted">
                {canCancel
                  ? "The house has missed its settlement window — you can take the stake back."
                  : refundInSeconds == null
                    ? "Checking…"
                    : `Refund available in ~${refundInSeconds}s if it doesn't settle.`}
              </p>
              {canCancel && (
                <Button
                  variant="outline"
                  className="mt-2 px-3 py-1.5 text-xs"
                  onClick={refund}
                  disabled={isSending}
                >
                  Refund bet
                </Button>
              )}
            </div>
          )}

          <div className="flex overflow-hidden rounded-lg border border-border-low">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={`flex-1 cursor-pointer px-3 py-2 text-xs font-bold transition ${
                  tab === t.id
                    ? "bg-gold/20 text-gold"
                    : "text-muted hover:bg-cream/50 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "buy" && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted">
                Spend (SOL)
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isSending}
                  className="mt-1 w-full rounded-lg border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-gold disabled:opacity-50"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BUY_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={isSending}
                    onClick={() => setAmount(p.toString())}
                    className="cursor-pointer rounded-md border border-border-low bg-cream/50 px-2.5 py-1 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                  >
                    {p} SOL
                  </button>
                ))}
              </div>
              {amountLamports != null && amountLamports > 0n && (
                <p className="text-xs text-muted">
                  You get{" "}
                  <span className="font-mono font-bold text-gold">
                    {diamondString(lamportsToDiamonds(amountLamports))} 💎
                  </span>
                  {floatLamports > 0n &&
                    ` (+ ${solString(floatLamports)} SOL to your session key for fees)`}
                  .
                </p>
              )}
              <Button className="w-full" onClick={buy} disabled={!canBuy}>
                {isSending
                  ? "Confirming…"
                  : sessionAddress == null
                    ? "Preparing session key…"
                    : "Buy chips — one approval"}
              </Button>
              <p className="text-[10px] leading-relaxed text-muted">
                One signature deposits your SOL and lets your browser&apos;s
                session key place bets for about a day without prompting. It can
                wager at most the chips you hold (wins top the allowance back
                up) and can never withdraw — cashing out always needs your
                wallet.
              </p>
            </div>
          )}

          {tab === "session" && (
            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-border-low bg-cream/30 p-3">
                <p className="font-semibold text-foreground">
                  {sessionAddress == null
                    ? "Preparing session key…"
                    : sessionReady
                      ? "Session active"
                      : sessionExpired
                        ? "Session expired"
                        : sessionArmed
                          ? "Session allowance used up"
                          : "No active session"}
                </p>
                {sessionArmed && (
                  <p className="mt-1 text-muted">
                    Allowance left:{" "}
                    <span className="font-mono text-foreground">
                      {diamondString(lamportsToDiamonds(spendLeft))} 💎
                    </span>
                    {slot != null && expirySlot > slot && (
                      <>
                        {" "}
                        · expires in ~
                        {Math.round((Number(expirySlot - slot) * 0.4) / 3600)}h
                      </>
                    )}
                  </p>
                )}
                {sessionAddress != null && (
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">
                    {sessionAddress}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={rearm}
                  disabled={
                    isSending || sessionAddress == null || balance === 0n
                  }
                >
                  {sessionArmed ? "Re-arm for a day" : "Arm session"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={revoke}
                  disabled={isSending || !sessionArmed}
                >
                  Revoke
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                Without an active session every bet prompts your wallet. Arming
                sets the allowance to your current chip balance.
              </p>
            </div>
          )}

          {tab === "cash" && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted">
                Chips to cash out (blank = all)
                <input
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder={diamondString(lamportsToDiamonds(balance))}
                  disabled={isSending}
                  className="mt-1 w-full rounded-lg border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-gold disabled:opacity-50"
                />
              </label>
              <Button
                variant="outline"
                className="w-full"
                onClick={cashOut}
                disabled={
                  isSending ||
                  cashLamports == null ||
                  cashLamports <= 0n ||
                  cashLamports > balance ||
                  openBet != null
                }
              >
                {isSending
                  ? "Confirming…"
                  : cashLamports != null && cashLamports > 0n
                    ? `Cash out ${solString(cashLamports)} SOL`
                    : "Cash out"}
              </Button>
              {openBet != null && (
                <p className="text-[10px] text-muted">
                  Wait for your open bet to settle before cashing out.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
