"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useVaultSpin } from "../lib/hooks/use-vault-spin";
import {
  GAME_PLINKO,
  PLINKO_RISK,
  type PlinkoConfig,
  type PlinkoOutcome,
  plinkoEval,
} from "../lib/solana/games/plinko";
import { PlinkoControls } from "../components/plinko/plinko-controls";

const PlinkoBoard = dynamic(
  () => import("../components/plinko/plinko-board").then((m) => m.PlinkoBoard),
  { ssr: false }
);

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

  const boardRef = useRef<{
    dropBall: (outcome: PlinkoOutcome) => void;
    bounceBucket: (bucketIndex: number) => void;
    clearBalls: () => void;
  } | null>(null);

  // The spinner held outcome is resolved after the minimum spin duration; we
  // immediately hand it to the board to animate the deterministic path.
  const spin = useVaultSpin<PlinkoOutcome>({
    gameId: GAME_PLINKO,
    evaluate: (randomness, bet) => {
      const outcome = plinkoEval(randomness, bet, configRef.current);
      // Trigger the board animation before the hook releases the outcome to
      // the controls, so the reveal and the drop start together.
      queueMicrotask(() => boardRef.current?.dropBall(outcome));
      return outcome;
    },
    minSpinMs: 6000,
  });

  // Changing the row count rebuilds the board; drop any in-flight balls.
  useEffect(() => {
    boardRef.current?.clearBalls();
  }, [config.rows]);

  const handleConfigChange = useCallback((next: PlinkoConfig) => {
    setConfig(next);
  }, []);

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col gap-3 p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-6">
        <PlinkoBoard ref={boardRef} config={config} />
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="flex h-full flex-col justify-between gap-4">
            <PlinkoControls
              config={config}
              onConfigChange={handleConfigChange}
              lastOutcome={spin.outcome}
              lastBet={spin.bet}
              spin={spin}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
