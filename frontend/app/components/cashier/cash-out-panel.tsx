"use client";

import { useMemo, useState } from "react";
import type { Cashier } from "../../lib/hooks/use-cashier";
import {
  DIAMOND_LAMPORTS,
  diamondString,
  lamportsToDiamonds,
  parseDiamonds,
} from "../../lib/diamonds";
import { solString } from "../../lib/solana/format";
import { Button } from "../ui/button";

export function CashOutPanel({ cashier }: { cashier: Cashier }) {
  const c = cashier;
  const [input, setInput] = useState("");
  const lamports = useMemo(() => {
    if (input.trim() === "") return c.balance;
    const d = parseDiamonds(input);
    return d == null ? null : d * DIAMOND_LAMPORTS;
  }, [input, c.balance]);

  const blocked =
    c.openBet != null
      ? "Wait for your open bet to settle before cashing out."
      : c.balance === 0n
        ? "No chips to cash out."
        : lamports == null
          ? "Enter a whole number of chips."
          : lamports > c.balance
            ? "That's more than you hold."
            : null;

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-muted">
        Chips to cash out
        <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-border-low bg-background focus-within:border-gold">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            placeholder={diamondString(lamportsToDiamonds(c.balance))}
            disabled={c.isSending}
            className="w-full min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setInput("")}
            disabled={c.isSending}
            className="cursor-pointer border-l border-border-low px-3 text-xs font-bold text-muted transition hover:bg-cream hover:text-foreground"
          >
            All
          </button>
        </div>
      </label>
      {lamports != null && lamports > 0n && blocked == null && (
        <p className="text-xs text-muted">
          You receive{" "}
          <span className="font-mono font-bold text-foreground">
            {solString(lamports)} SOL
          </span>{" "}
          in your wallet. Your session key stays armed.
        </p>
      )}
      {blocked && <p className="text-xs text-destructive">{blocked}</p>}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => lamports != null && void c.cashOut(lamports)}
        disabled={c.isSending || blocked != null}
      >
        {c.isSending
          ? "Confirming…"
          : lamports != null && lamports > 0n
            ? `Cash out ${diamondString(lamportsToDiamonds(lamports))} 💎`
            : "Cash out"}
      </Button>
    </div>
  );
}
