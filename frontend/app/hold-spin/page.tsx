"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useVaultSpin } from "../lib/hooks/use-vault-spin";
import { useDemoSpin } from "../lib/hooks/use-demo-spin";
import { usePersistedFlag } from "../lib/hooks/use-persisted-flag";
import {
  bigWinFanfare,
  freeSpinsTrigger,
  lose,
  multiplierUp,
  reelStop,
  scatterLand,
  spinEnd,
  spinStart,
  symbolLand,
  win,
} from "../lib/sound/events";
import {
  GAME_HOLD_SPIN,
  MAX_WIN_BP,
  holdSpinEval,
  holdSpinPayout,
  type HoldSpinOutcome,
} from "../lib/solana/games/hold-spin";
import { diamondString, lamportsToDiamonds } from "../lib/diamonds";
import {
  HOLD_SPIN_SCALE,
  WIN_TIER_LABEL,
  winTier,
  type WinTier,
} from "../lib/win-tiers";
import { HoldSpinControls } from "../components/hold-spin/hold-spin-controls";
import {
  HoldSpinHistory,
  type HoldSpinRecord,
} from "../components/hold-spin/hold-spin-history";
import { HoldSpinPaytable } from "../components/hold-spin/hold-spin-paytable";
import type { HoldSpinBoardHandle } from "../components/hold-spin/hold-spin-board";
import type { StageCallbacks } from "../components/hold-spin/hold-spin-stage";
import { ConfettiCanvas } from "../components/animations/confetti-canvas";
import { CountUp } from "../components/animations/count-up";
import { FairPanel } from "../components/fairness/fair-panel";
import { Modal } from "../components/ui/modal";

const HoldSpinBoard = dynamic(
  () =>
    import("../components/hold-spin/hold-spin-board").then(
      (m) => m.HoldSpinBoard
    ),
  { ssr: false }
);

const TURBO_KEY = "spin.holdspin.turbo";

type Overlay =
  | { kind: "bonus-intro"; coins: number }
  | { kind: "bonus-outro"; totalBp: bigint; payout: bigint; grand: boolean }
  | { kind: "bigwin"; tier: WinTier; totalBp: bigint; payout: bigint };

const OVERLAY_AUTO_MS: Record<Overlay["kind"], number> = {
  "bonus-intro": 2200,
  "bonus-outro": 3200,
  bigwin: 4200,
};

export default function HoldSpinPage() {
  const boardRef = useRef<HoldSpinBoardHandle | null>(null);
  const [turbo, setTurbo] = usePersistedFlag(TURBO_KEY);
  const [fairOpen, setFairOpen] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [heldPayout, setHeldPayout] = useState<bigint | null>(null);
  const [records, setRecords] = useState<HoldSpinRecord[]>([]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [celebration, setCelebration] = useState<{
    mode: "confetti" | "coins";
    id: number;
  } | null>(null);
  const betRef = useRef<bigint>(0n);
  const overlayResolve = useRef<(() => void) | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOverlay = useCallback((o: Overlay): Promise<void> => {
    return new Promise<void>((resolve) => {
      overlayResolve.current?.();
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      setOverlay(o);
      const done = () => {
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        overlayTimer.current = null;
        overlayResolve.current = null;
        setOverlay(null);
        resolve();
      };
      overlayResolve.current = done;
      overlayTimer.current = setTimeout(done, OVERLAY_AUTO_MS[o.kind]);
    });
  }, []);
  const dismissOverlay = useCallback(() => overlayResolve.current?.(), []);
  useEffect(
    () => () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    },
    []
  );

  const payoutFor = useCallback(
    (bp: bigint) => holdSpinPayout(betRef.current, bp),
    []
  );
  const formatWin = useCallback(
    (bp: bigint) => `+${diamondString(lamportsToDiamonds(payoutFor(bp)))} 💎`,
    [payoutFor]
  );

  const callbacks = useMemo<StageCallbacks>(
    () => ({
      onReelStop: (reel) => {
        reelStop(reel);
        if (reel === 4) spinEnd();
      },
      onCoinLand: (n) => scatterLand(Math.min(n, 6)),
      onLineWin: (w) => win(w.payBp),
      onBonusStart: (coins) => {
        freeSpinsTrigger();
        return showOverlay({ kind: "bonus-intro", coins });
      },
      onRespin: (r, coins) => {
        symbolLand();
        if (r.revealed.some((c) => c.coinValue >= 0)) multiplierUp(coins);
      },
      onBonusEnd: (b) =>
        showOverlay({
          kind: "bonus-outro",
          totalBp: b.bonusWinBp,
          payout: payoutFor(b.bonusWinBp),
          grand: b.grand,
        }),
      onComplete: (o) => {
        spinEnd();
        const tier = winTier(o.totalWinBp, HOLD_SPIN_SCALE);
        if (o.payout === 0n) lose();
        if (tier === "big" || tier === "huge" || tier === "jackpot") {
          bigWinFanfare(
            tier === "jackpot" ? "jackpot" : tier === "huge" ? "huge" : "big"
          );
          setCelebration((p) => ({
            mode: tier === "big" ? "confetti" : "coins",
            id: (p?.id ?? 0) + 1,
          }));
          void showOverlay({
            kind: "bigwin",
            tier,
            totalBp: o.totalWinBp,
            payout: payoutFor(o.totalWinBp),
          });
        }
        setRecords((prev) =>
          [
            ...prev,
            {
              totalWinBp: o.totalWinBp,
              bonus: o.bonus != null,
              grand: o.bonus?.grand ?? false,
            },
          ].slice(-60)
        );
        setHeldPayout(null);
        setAnimating(false);
      },
      formatWin,
    }),
    [formatWin, payoutFor, showOverlay]
  );
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const evaluate = useCallback(
    (randomness: Uint8Array, bet: bigint, target: bigint) => {
      const outcome = holdSpinEval(randomness, bet, target);
      betRef.current = bet;
      setHeldPayout(outcome.payout);
      queueMicrotask(() =>
        boardRef.current?.playOutcome(outcome, callbacksRef.current)
      );
      return outcome;
    },
    []
  );

  const vaultSpin = useVaultSpin<HoldSpinOutcome>({
    gameId: GAME_HOLD_SPIN,
    evaluate,
    maxMultiplierBp: () => MAX_WIN_BP,
    minSpinMs: 700,
  });
  const demoSpin = useDemoSpin<HoldSpinOutcome>({ evaluate, minSpinMs: 700 });
  const spin = vaultSpin.connected ? vaultSpin : demoSpin;

  const surface = useMemo(
    () => ({
      ...spin,
      rolling: spin.rolling || animating,
      balance: spin.balance == null ? null : spin.balance - (heldPayout ?? 0n),
      placeBet: async (lamports: bigint, target: bigint) => {
        setAnimating(true);
        setHeldPayout(null);
        spinStart();
        boardRef.current?.spinUp();
        const ok = await spin.placeBet(lamports, target);
        if (!ok) {
          setAnimating(false);
          spinEnd();
          boardRef.current?.reset();
        }
        return ok;
      },
    }),
    [spin, animating, heldPayout]
  );

  const skip = useCallback(() => {
    boardRef.current?.skip();
    dismissOverlay();
  }, [dismissOverlay]);

  const won = (payout: bigint) => diamondString(lamportsToDiamonds(payout));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="flex w-full min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border-low bg-card/70 p-3 sm:p-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.45)]">
                Dragon&apos;s Vault
              </h1>
              <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted sm:inline">
                Hold &amp; Spin · 20 lines
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

          <div
            className="relative w-full"
            onClick={overlay ? dismissOverlay : undefined}
          >
            <HoldSpinBoard ref={boardRef} turbo={turbo} />
            <AnimatePresence>
              {overlay && (
                <motion.div
                  key={overlay.kind}
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                >
                  <div className="rounded-2xl border border-gold/60 bg-black/80 px-8 py-6 text-center shadow-[0_0_60px_rgba(255,192,87,0.35)] backdrop-blur-md">
                    {overlay.kind === "bonus-intro" && (
                      <>
                        <p className="font-display text-xs uppercase tracking-[0.4em] text-muted">
                          {overlay.coins} coins locked
                        </p>
                        <p className="font-display mt-1 text-4xl font-bold uppercase text-gold">
                          Hold &amp; Spin
                        </p>
                      </>
                    )}
                    {overlay.kind === "bonus-outro" && (
                      <>
                        <p className="font-display text-xs uppercase tracking-[0.4em] text-muted">
                          {overlay.grand ? "Grand jackpot!" : "Bonus total"}
                        </p>
                        <p className="font-mono mt-1 text-4xl font-black text-[#00ffa3]">
                          +
                          <CountUp
                            value={Number(lamportsToDiamonds(overlay.payout))}
                          />
                          💎
                        </p>
                      </>
                    )}
                    {overlay.kind === "bigwin" && (
                      <>
                        <p className="font-display text-xs uppercase tracking-[0.4em] text-gold">
                          {WIN_TIER_LABEL[overlay.tier]}
                        </p>
                        <p className="font-mono mt-1 text-4xl font-black text-[#00ffa3]">
                          +
                          <CountUp
                            value={Number(lamportsToDiamonds(overlay.payout))}
                          />
                          💎
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {(Number(overlay.totalBp) / 10_000).toFixed(2)}× your
                          bet
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <HoldSpinHistory records={records} />
        </section>

        <aside className="w-full lg:w-[350px] lg:shrink-0">
          <HoldSpinControls
            spin={surface}
            turbo={turbo}
            onTurboChange={setTurbo}
            onOpenPaytable={() => setPaytableOpen(true)}
            canSkip={animating}
            onSkip={skip}
          />
        </aside>
      </div>

      <Modal
        open={paytableOpen}
        onClose={() => setPaytableOpen(false)}
        title="Paytable"
      >
        <HoldSpinPaytable />
      </Modal>

      <FairPanel
        open={fairOpen}
        onClose={() => setFairOpen(false)}
        chain={vaultSpin.chain.data}
        bet={vaultSpin.lastBet}
        demo={!vaultSpin.connected}
        evaluatePayout={(r, bet, target) => holdSpinEval(r, bet, target).payout}
      />

      {celebration != null && (
        <ConfettiCanvas
          key={celebration.id}
          mode={celebration.mode}
          durationMs={celebration.mode === "coins" ? 2400 : 1800}
          spawnEveryMs={celebration.mode === "coins" ? 150 : 0}
        />
      )}
      <span className="sr-only">{won(0n)}</span>
    </main>
  );
}
