"use client";

import type { Cashier } from "../../lib/hooks/use-cashier";
import {
  DIAMOND_LAMPORTS,
  diamondString,
  lamportsToDiamonds,
} from "../../lib/diamonds";
import { solString } from "../../lib/solana/format";
import { Badge } from "../ui/badge";

export function BalanceCard({ cashier }: { cashier: Cashier }) {
  const c = cashier;
  const sessionLabel =
    c.sessionAddress == null
      ? "Preparing session key…"
      : c.sessionReady
        ? "Session active"
        : c.sessionExpired
          ? "Session expired"
          : c.sessionArmed
            ? "Allowance used up"
            : "No session";
  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Your chips
          </p>
          <p className="font-mono text-4xl font-black tabular-nums text-gold">
            {diamondString(lamportsToDiamonds(c.balance))} 💎
          </p>
          <p className="mt-1 text-[11px] text-muted">
            = {solString(c.balance)} SOL · 1 💎 = {solString(DIAMOND_LAMPORTS)}{" "}
            SOL
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Wallet
          </p>
          <p className="font-mono text-lg font-bold tabular-nums">
            {c.walletLamports == null ? "—" : solString(c.walletLamports)}{" "}
            <span className="text-xs font-normal text-muted">SOL</span>
          </p>
          <Badge tone={c.sessionReady ? "primary" : "muted"} className="mt-2">
            {sessionLabel}
          </Badge>
        </div>
      </div>
    </div>
  );
}
