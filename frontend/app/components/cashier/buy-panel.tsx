"use client";

import { useMemo, useState } from "react";
import { sol, solToLamports } from "@solana/kit";
import { BUY_PRESETS, type Cashier } from "../../lib/hooks/use-cashier";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { solString } from "../../lib/solana/format";
import { Button } from "../ui/button";

export function BuyPanel({ cashier }: { cashier: Cashier }) {
  const c = cashier;
  const [amount, setAmount] = useState("0.1");
  const lamports = useMemo(() => {
    try {
      return solToLamports(sol(amount as `${number}`));
    } catch {
      return null;
    }
  }, [amount]);
  const canBuy =
    lamports != null &&
    lamports > 0n &&
    c.sessionAddress != null &&
    !c.isSending &&
    (c.walletLamports == null ||
      c.walletLamports > lamports + c.floatLamports + 10_000n);

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-muted">
        Spend (SOL)
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          disabled={c.isSending}
          className="mt-1 w-full rounded-lg border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-gold disabled:opacity-50"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {BUY_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={c.isSending}
            onClick={() => setAmount(p.toString())}
            className="cursor-pointer rounded-md border border-border-low bg-cream/50 px-2.5 py-1 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
          >
            {p} SOL
          </button>
        ))}
      </div>
      {lamports != null && lamports > 0n && (
        <p className="text-xs text-muted">
          You get{" "}
          <span className="font-mono font-bold text-gold">
            {diamondString(lamportsToDiamonds(lamports))} 💎
          </span>
          {c.floatLamports > 0n &&
            ` (+ ${solString(c.floatLamports)} SOL to your session key for fees)`}
          .
        </p>
      )}
      <Button
        className="w-full"
        onClick={() => lamports != null && void c.buy(lamports)}
        disabled={!canBuy}
      >
        {c.isSending
          ? "Confirming…"
          : c.sessionAddress == null
            ? "Preparing session key…"
            : "Buy chips — one approval"}
      </Button>
      <p className="text-[10px] leading-relaxed text-muted">
        One signature deposits your SOL and lets your browser&apos;s session key
        place bets for about a day without prompting. It can wager at most the
        chips you hold (wins top the allowance back up) and can never withdraw.
      </p>
    </div>
  );
}
