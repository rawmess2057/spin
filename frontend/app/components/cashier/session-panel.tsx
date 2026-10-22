"use client";

import type { Cashier } from "../../lib/hooks/use-cashier";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { Button } from "../ui/button";

export function SessionPanel({ cashier }: { cashier: Cashier }) {
  const c = cashier;
  const hoursLeft =
    c.slot != null && c.expirySlot > c.slot
      ? Math.round((Number(c.expirySlot - c.slot) * 0.4) / 3600)
      : null;
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl border border-border-low bg-cream/30 p-3">
        <p className="font-semibold text-foreground">
          {c.sessionAddress == null
            ? "Preparing session key…"
            : c.sessionReady
              ? "Session active"
              : c.sessionExpired
                ? "Session expired"
                : c.sessionArmed
                  ? "Session allowance used up"
                  : "No active session"}
        </p>
        {c.sessionArmed && (
          <p className="mt-1 text-muted">
            Allowance left:{" "}
            <span className="font-mono text-foreground">
              {diamondString(lamportsToDiamonds(c.spendLeft))} 💎
            </span>
            {hoursLeft != null && <> · expires in ~{hoursLeft}h</>}
          </p>
        )}
        {c.sessionAddress != null && (
          <p className="mt-1 break-all font-mono text-[10px] text-muted">
            {c.sessionAddress}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => void c.rearm()}
          disabled={c.isSending || c.sessionAddress == null || c.balance === 0n}
        >
          {c.sessionArmed ? "Re-arm for a day" : "Arm session"}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => void c.revoke()}
          disabled={c.isSending || !c.sessionArmed}
        >
          Revoke
        </Button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        Without an active session every bet prompts your wallet. Arming sets the
        allowance to your current chip balance; wins and refunds restore it. The
        session key can never withdraw.
      </p>
    </div>
  );
}
