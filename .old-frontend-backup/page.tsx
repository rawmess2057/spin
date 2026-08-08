"use client";

import { SlotMachine } from "./components/slots/slot-machine";
import { StatsPanel } from "./components/dice/stats-panel";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-primary [text-shadow:0_0_24px_rgba(0,255,163,0.45)]">
            SPIN
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/50">
            A provably fair Solana casino. Neon Slots: match 3+ symbols across
            five reels, paid out on-chain by ORAO VRF randomness.
          </p>
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <SlotMachine />
        <StatsPanel />
      </div>
    </main>
  );
}
