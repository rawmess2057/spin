"use client";

import type { Cashier } from "../../lib/hooks/use-cashier";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { GAMES } from "../../lib/games/registry";
import { Button } from "../ui/button";

export function PendingBetCard({ cashier }: { cashier: Cashier }) {
  const c = cashier;
  const bet = c.openBet;
  if (!bet) return null;
  const game = GAMES.find((g) => g.id === bet.gameId);
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/5 p-4 text-xs">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gold">
        Bet in flight
      </p>
      <p className="mt-1 text-sm font-bold text-foreground">
        {diamondString(lamportsToDiamonds(bet.amount))} 💎 on{" "}
        {game?.title ?? `game ${bet.gameId}`}
      </p>
      <p className="mt-1 text-muted">
        {c.canCancel
          ? "The house missed its settlement window — you can take the stake back."
          : c.refundInSeconds == null
            ? "Waiting for the house to reveal…"
            : `Waiting for the house to reveal. Refund available in ~${c.refundInSeconds}s if it doesn't.`}
      </p>
      {c.canCancel && (
        <Button
          variant="outline"
          className="mt-3 px-3 py-1.5 text-xs"
          onClick={() => void c.refund()}
          disabled={c.isSending}
        >
          Refund bet
        </Button>
      )}
    </div>
  );
}
