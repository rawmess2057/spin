"use client";

import { useEffect } from "react";
import { ConfettiCanvas } from "../../animations/confetti-canvas";
import { CountUp } from "../../animations/count-up";
import { WIN_TIER_LABEL, type WinTier } from "../../../lib/win-tiers";

export function BigWinOverlay({
  tier,
  payout,
  onDismiss,
}: {
  tier: Extract<WinTier, "big" | "huge" | "jackpot">;
  /** Diamonds won on the spin. */
  payout: bigint;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, tier === "jackpot" ? 7000 : 4200);
    return () => clearTimeout(t);
  }, [onDismiss, tier]);

  const jackpot = tier === "jackpot";
  const huge = tier === "huge";

  const glow = jackpot
    ? "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(255,192,87,0.30) 0%, rgba(240,0,1,0.25) 45%, rgba(0,0,0,0.9) 75%)"
    : huge
      ? "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,192,87,0.18) 0%, rgba(0,0,0,0.85) 70%)"
      : "rgba(0,0,0,0.6)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className={`absolute inset-0 ${jackpot ? "" : "bg-black/60"}`}
        style={jackpot || huge ? { background: glow } : undefined}
      />
      <ConfettiCanvas durationMs={jackpot ? 4000 : huge ? 3000 : 2000} />
      <div className="relative flex flex-col items-center gap-3 text-center">
        {jackpot && (
          <p
            className="font-display animate-pulse text-lg font-bold uppercase tracking-[0.5em] text-red-500"
            style={{ textShadow: "0 0 24px rgba(240,0,1,0.9)" }}
          >
            ★ Jackpot ★
          </p>
        )}
        <p
          className={`font-display text-4xl font-black tracking-wide sm:text-6xl ${
            jackpot ? "text-red-500" : "text-gold"
          }`}
          style={{
            textShadow: jackpot
              ? "0 0 40px rgba(240,0,1,0.9), 0 0 80px rgba(255,192,87,0.5)"
              : "0 0 40px rgba(255,192,87,0.8)",
          }}
        >
          {WIN_TIER_LABEL[tier].toUpperCase()}
        </p>
        <p className="font-mono text-2xl font-bold text-foreground sm:text-3xl">
          <CountUp
            value={Number(payout)}
            format={(n) => `+${Math.round(n).toLocaleString("en-US")} 💎`}
          />
        </p>
        <button
          onClick={onDismiss}
          className="mt-4 cursor-pointer rounded-sm border border-border-low bg-card/80 px-4 py-2 text-xs font-medium text-muted transition hover:bg-cream"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
