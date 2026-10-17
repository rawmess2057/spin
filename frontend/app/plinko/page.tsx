"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useVaultSpin } from "../lib/hooks/use-vault-spin";
import { useDemoSpin } from "../lib/hooks/use-demo-spin";
import {
  win as winSound,
  lose as loseSound,
  bigWinFanfare,
} from "../lib/sound/events";
import { winTier } from "../lib/win-tiers";
import {
  GAME_PLINKO,
  PLINKO_RISK,
  PLINKO_RISK_NAMES,
  type PlinkoConfig,
  type PlinkoOutcome,
  plinkoEval,
} from "../lib/solana/games/plinko";
import {
  diamondString,
  diamondsToLamports,
  lamportsToDiamonds,
} from "../lib/diamonds";
import { PlinkoControls } from "../components/plinko/plinko-controls";
import {
  PlinkoHistory,
  type WinRecord,
} from "../components/plinko/plinko-history";
import { ConfettiCanvas } from "../components/animations/confetti-canvas";

const PlinkoBoard = dynamic(
  () => import("../components/plinko/plinko-board").then((m) => m.PlinkoBoard),
  { ssr: false }
);

type Landed = {
  outcome: PlinkoOutcome;
  bet: bigint;
  key: number;
};

export default function PlinkoPage() {
  const [config, setConfig] = useState<PlinkoConfig>({
    rows: 12,
    risk: PLINKO_RISK.LOW,
  });
  // `evaluate` is captured by useVaultSpin's internal `placeBet` (which doesn't
  // re-run on config changes), so the evaluator reads config through a ref to
  // always see the latest selection.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [wins, setWins] = useState<WinRecord[]>([]);
  const [landed, setLanded] = useState<Landed | null>(null);
  const [celebration, setCelebration] = useState<{
    mode: "confetti" | "coins";
    id: number;
  } | null>(null);

  const boardRef = useRef<{
    dropBall: (
      outcome: PlinkoOutcome,
      onLanded?: (o: PlinkoOutcome) => void
    ) => void;
    bounceBucket: (bucketIndex: number) => void;
    clearBalls: () => void;
  } | null>(null);
  const landSeq = useRef(0);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenOutcomeRef = useRef<PlinkoOutcome | null>(null);

  // Called once the ball visually lands in its bucket: celebrate + announce.
  const handleLanded = useCallback((outcome: PlinkoOutcome, bet: bigint) => {
    if (outcome.payout >= bet) winSound(outcome.multiplierBp);
    else loseSound();

    // Shared celebration tiers (lib/win-tiers.ts): confetti for a big win,
    // coins + fanfare above that.
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

  // The spinner held outcome is resolved after the minimum spin duration; we
  // immediately hand it to the board to animate the deterministic path.
  const evaluate = useCallback((randomness: Uint8Array, bet: bigint) => {
    const outcome = plinkoEval(randomness, bet, configRef.current);
    // Trigger the board animation before the hook releases the outcome to
    // the controls, so the reveal and the drop start together. Hide any
    // previous result chip as the next ball begins its run.
    if (landTimer.current != null) clearTimeout(landTimer.current);
    setLanded(null);
    queueMicrotask(() =>
      boardRef.current?.dropBall(outcome, (o) =>
        handleLandedRef.current(o, bet)
      )
    );
    return outcome;
  }, []);

  // On-chain when a wallet is connected, practice diamonds otherwise. Both
  // hooks always run (hook order), and the page reads from whichever applies.
  const vaultSpin = useVaultSpin<PlinkoOutcome>({
    gameId: GAME_PLINKO,
    evaluate,
    minSpinMs: 2200,
  });
  const demoSpin = useDemoSpin<PlinkoOutcome>({
    evaluate,
    minSpinMs: 1500,
    minBet: diamondsToLamports(1n),
    maxBet: diamondsToLamports(1_000n),
  });
  const spin = vaultSpin.connected ? vaultSpin : demoSpin;

  // Record each newly resolved spin into the recent-drops history. We compare
  // by object identity because the hook creates a fresh outcome per spin.
  useEffect(() => {
    const outcome = spin.outcome;
    if (outcome == null || outcome === lastSeenOutcomeRef.current) return;
    lastSeenOutcomeRef.current = outcome;
    setWins((prev) =>
      [
        ...prev,
        {
          bucket: outcome.bucket,
          rowCount: outcome.path.length,
          multiplierBp: outcome.multiplierBp,
        },
      ].slice(-60)
    );
  }, [spin.outcome]);

  // Changing the row count rebuilds the board; drop any in-flight balls.
  useEffect(() => {
    boardRef.current?.clearBalls();
  }, [config.rows]);

  const handleConfigChange = useCallback((next: PlinkoConfig) => {
    setConfig(next);
  }, []);

  const riskName = PLINKO_RISK_NAMES[config.risk];
  const landNet = landed == null ? null : landed.outcome.payout - landed.bet;
  const landWon = landNet != null && landNet >= 0n;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Board card ------------------------------------------------------ */}
        <section className="flex w-full min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border-low bg-card/70 p-3 sm:p-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.45)]">
                Plinko
              </h1>
              <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted sm:inline">
                {config.rows} rows · {riskName} risk
              </span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-border-low bg-cream/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_6px_#00ffa3]" />
              Provably fair
            </span>
          </header>

          <div className="relative w-full">
            <PlinkoBoard ref={boardRef} config={config} />

            {/* Landing result chip */}
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
                        +{diamondString(lamportsToDiamonds(landNet))}
                        💎
                      </span>
                      <span className="text-[11px] font-bold text-[#9dffd9]">
                        {(Number(landed.outcome.multiplierBp) / 10000).toFixed(
                          2
                        )}
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

          <PlinkoHistory records={wins} />
        </section>

        {/* Control panel --------------------------------------------------- */}
        <aside className="w-full lg:w-[350px] lg:shrink-0">
          <PlinkoControls
            config={config}
            onConfigChange={handleConfigChange}
            spin={spin}
          />
        </aside>
      </div>

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
