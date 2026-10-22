"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useVaultSpin } from "../lib/hooks/use-vault-spin";
import { useDemoSpin } from "../lib/hooks/use-demo-spin";
import {
  bigWinFanfare,
  lose as loseSound,
  spinEnd,
  spinStart,
  wheelTick,
  win as winSound,
} from "../lib/sound/events";
import {
  GAME_WHEEL,
  WHEEL_RISK,
  WHEEL_RISK_NAMES,
  WHEEL_TABLES,
  wheelDecodeTarget,
  wheelEval,
  wheelMaxMultiplierBp,
  type WheelOutcome,
  type WheelRisk,
} from "../lib/solana/games/wheel";
import { diamondString, lamportsToDiamonds } from "../lib/diamonds";
import { winTier } from "../lib/win-tiers";
import { WheelControls } from "../components/wheel/wheel-controls";
import {
  WheelHistory,
  type WheelRecord,
} from "../components/wheel/wheel-history";
import type { WheelBoardHandle } from "../components/wheel/wheel-board";
import { ConfettiCanvas } from "../components/animations/confetti-canvas";
import { FairPanel } from "../components/fairness/fair-panel";

const WheelBoard = dynamic(
  () => import("../components/wheel/wheel-board").then((m) => m.WheelBoard),
  { ssr: false }
);

type Landed = { outcome: WheelOutcome; bet: bigint; key: number };

export default function WheelPage() {
  const [risk, setRisk] = useState<WheelRisk>(WHEEL_RISK.MED);
  const riskRef = useRef(risk);
  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);

  const [records, setRecords] = useState<WheelRecord[]>([]);
  const [landed, setLanded] = useState<Landed | null>(null);
  const [animating, setAnimating] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [celebration, setCelebration] = useState<{
    mode: "confetti" | "coins";
    id: number;
  } | null>(null);
  const boardRef = useRef<WheelBoardHandle | null>(null);
  const landSeq = useRef(0);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLanded = useCallback((outcome: WheelOutcome, bet: bigint) => {
    spinEnd();
    if (outcome.payout >= bet) winSound(outcome.multiplierBp);
    else loseSound();
    const tier = winTier(outcome.multiplierBp);
    if (tier === "big") {
      setCelebration((p) => ({ mode: "confetti", id: (p?.id ?? 0) + 1 }));
    } else if (tier === "huge" || tier === "jackpot") {
      bigWinFanfare(tier);
      setCelebration((p) => ({ mode: "coins", id: (p?.id ?? 0) + 1 }));
    }
    if (landTimer.current != null) clearTimeout(landTimer.current);
    setLanded({ outcome, bet, key: ++landSeq.current });
    landTimer.current = setTimeout(() => setLanded(null), 3200);
    setRecords((prev) =>
      [
        ...prev,
        { segment: outcome.segment, multiplierBp: outcome.multiplierBp },
      ].slice(-60)
    );
    setAnimating(false);
  }, []);
  const handleLandedRef = useRef(handleLanded);
  useEffect(() => {
    handleLandedRef.current = handleLanded;
  });
  useEffect(
    () => () => {
      if (landTimer.current != null) clearTimeout(landTimer.current);
    },
    []
  );

  const evaluate = useCallback(
    (randomness: Uint8Array, bet: bigint, target: bigint) => {
      const outcome = wheelEval(randomness, bet, target);
      if (landTimer.current != null) clearTimeout(landTimer.current);
      setLanded(null);
      queueMicrotask(() =>
        boardRef.current?.spinTo(outcome.segment, {
          onTick: () => wheelTick(),
          onLand: () => handleLandedRef.current(outcome, bet),
        })
      );
      return outcome;
    },
    []
  );

  const vaultSpin = useVaultSpin<WheelOutcome>({
    gameId: GAME_WHEEL,
    evaluate,
    maxMultiplierBp: wheelMaxMultiplierBp,
    minSpinMs: 900,
  });
  const demoSpin = useDemoSpin<WheelOutcome>({
    evaluate,
    minSpinMs: 900,
    minBet: 1n * 100_000n,
    maxBet: 1_000n * 100_000n,
  });
  const spin = vaultSpin.connected ? vaultSpin : demoSpin;

  // The wheel starts turning the moment the bet goes out and keeps the
  // controls locked until it has come to rest.
  const surface = useMemo(
    () => ({
      ...spin,
      rolling: spin.rolling || animating,
      placeBet: async (lamports: bigint, target: bigint) => {
        setAnimating(true);
        spinStart();
        boardRef.current?.spinUp({ onTick: () => wheelTick() });
        const ok = await spin.placeBet(lamports, target);
        if (!ok) {
          setAnimating(false);
          spinEnd();
          boardRef.current?.reset();
        }
        return ok;
      },
    }),
    [spin, animating]
  );

  const table = WHEEL_TABLES[risk];
  const landNet = landed == null ? null : landed.outcome.payout - landed.bet;
  const landWon = landNet != null && landNet >= 0n;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="flex w-full min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border-low bg-card/70 p-3 sm:p-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.45)]">
                Spin Wheel
              </h1>
              <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted sm:inline">
                24 segments · {WHEEL_RISK_NAMES[risk]} risk
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFairOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-low bg-cream/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted transition hover:bg-cream hover:text-foreground"
            >
              <span
                className={`h-1.5 w-1.5 animate-pulse rounded-full ${
                  vaultSpin.connected
                    ? "bg-primary shadow-[0_0_6px_#00ffa3]"
                    : "bg-gold shadow-[0_0_6px_#ffd700]"
                }`}
              />
              {vaultSpin.connected ? "Provably fair" : "Demo"}
            </button>
          </header>

          <div className="relative w-full">
            <WheelBoard ref={boardRef} table={table} />
            {landed != null && landNet != null && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
                <div
                  key={landed.key}
                  className={`result-pop flex items-center gap-2 rounded-full border px-3.5 py-1.5 backdrop-blur-md ${
                    landWon
                      ? "border-[#00ffa3]/60 bg-[#00ffa3]/10 shadow-[0_0_24px_rgba(0,255,163,0.35)]"
                      : "border-white/15 bg-black/40 shadow-[0_0_18px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  {landWon ? (
                    <>
                      <span className="text-sm">🎉</span>
                      <span className="font-mono text-lg font-black tabular-nums text-[#00ffa3]">
                        +{diamondString(lamportsToDiamonds(landNet))}💎
                      </span>
                      <span className="text-[11px] font-bold text-[#9dffd9]">
                        {(Number(landed.outcome.multiplierBp) / 10000)
                          .toFixed(2)
                          .replace(/\.?0+$/, "")}
                        ×
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                      No win
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <WheelHistory records={records} />
        </section>

        <aside className="w-full lg:w-[350px] lg:shrink-0">
          <WheelControls risk={risk} onRiskChange={setRisk} spin={surface} />
        </aside>
      </div>

      <FairPanel
        open={fairOpen}
        onClose={() => setFairOpen(false)}
        chain={vaultSpin.chain.data}
        bet={vaultSpin.lastBet}
        demo={!vaultSpin.connected}
        evaluatePayout={(r, bet, target) =>
          wheelEval(
            r,
            bet,
            wheelDecodeTarget(target) == null ? BigInt(riskRef.current) : target
          ).payout
        }
      />

      {celebration != null && (
        <ConfettiCanvas
          key={celebration.id}
          mode={celebration.mode}
          durationMs={celebration.mode === "coins" ? 2400 : 1800}
          spawnEveryMs={celebration.mode === "coins" ? 150 : 0}
        />
      )}
    </main>
  );
}
