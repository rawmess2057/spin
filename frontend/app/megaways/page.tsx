"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
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
  tumble,
  win,
} from "../lib/sound/events";
import {
  megawaysEval,
  megawaysPayout,
  type MegawaysOutcome,
} from "../lib/solana/games/megaways";
import { diamondString, lamportsToDiamonds } from "../lib/diamonds";
import { WIN_TIER_LABEL, type WinTier } from "../lib/win-tiers";
import { hexToBytes } from "../lib/solana/fairness";
import { MegawaysControls } from "../components/megaways/megaways-controls";
import {
  MegawaysHistory,
  type SpinRecord,
} from "../components/megaways/megaways-history";
import { MegawaysPaytable } from "../components/megaways/megaways-paytable";
import type { MegawaysBoardHandle } from "../components/megaways/megaways-board";
import type { StageCallbacks } from "../components/megaways/megaways-stage";
import { ConfettiCanvas } from "../components/animations/confetti-canvas";
import { CountUp } from "../components/animations/count-up";

const MegawaysBoard = dynamic(
  () =>
    import("../components/megaways/megaways-board").then(
      (m) => m.MegawaysBoard
    ),
  { ssr: false }
);

const TURBO_KEY = "spin.megaways.turbo";

type Overlay =
  | { kind: "fs-intro"; spins: number }
  | { kind: "fs-outro"; totalBp: bigint; payout: bigint }
  | { kind: "bigwin"; tier: WinTier; totalBp: bigint; payout: bigint };

const OVERLAY_AUTO_MS: Record<Overlay["kind"], number> = {
  "fs-intro": 2600,
  "fs-outro": 3200,
  bigwin: 4200,
};

/**
 * Dev-only: `?debugSeed=<hex>` replays a fixed seed, `?debugSeed=fs` hunts
 * for a seed that triggers free spins, `?debugSeed=big` for a 15×+ win.
 */
function readDebugSeed(): ((r: Uint8Array, bet: bigint) => Uint8Array) | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return null;
  }
  const v = new URLSearchParams(window.location.search).get("debugSeed");
  if (!v) return null;
  if (v === "fs" || v === "big") {
    return (r, bet) => {
      const buf = new Uint8Array(64);
      for (let i = 0; i < 20000; i++) {
        crypto.getRandomValues(buf);
        const o = megawaysEval(buf, bet, 0n);
        if (v === "fs" ? o.totalFreeSpins > 0 : o.totalWinBp >= 150_000n) {
          return buf.slice();
        }
      }
      return r;
    };
  }
  if (/^[0-9a-f]+$/i.test(v)) {
    const bytes = new Uint8Array(64);
    bytes.set(hexToBytes(v.slice(0, 128)));
    return () => bytes;
  }
  return null;
}

export default function MegawaysPage() {
  const boardRef = useRef<MegawaysBoardHandle | null>(null);
  const [turbo, setTurbo] = usePersistedFlag(TURBO_KEY);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [heldPayout, setHeldPayout] = useState<bigint | null>(null);
  const [records, setRecords] = useState<SpinRecord[]>([]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [celebration, setCelebration] = useState<{
    mode: "confetti" | "coins";
    id: number;
  } | null>(null);

  const betRef = useRef<bigint>(0n);
  const overlayResolve = useRef<(() => void) | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugSeed = useRef<ReturnType<typeof readDebugSeed>>(null);

  useEffect(() => {
    debugSeed.current = readDebugSeed();
  }, []);

  /** Shows a DOM overlay and resolves when tapped or after its auto delay. */
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

  const dismissOverlay = useCallback(() => {
    overlayResolve.current?.();
  }, []);

  useEffect(
    () => () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    },
    []
  );

  const formatWin = useCallback(
    (bp: bigint) =>
      `+${diamondString(lamportsToDiamonds(megawaysPayout(betRef.current, bp)))} 💎`,
    []
  );
  const payoutFor = useCallback(
    (bp: bigint) => megawaysPayout(betRef.current, bp),
    []
  );

  const callbacks = useMemo<StageCallbacks>(
    () => ({
      onReelStop: (reel) => {
        reelStop(reel);
        if (reel === 5) spinEnd();
      },
      onScatterLand: (n) => scatterLand(n),
      onRoundStart: (round) => {
        if (round.kind === "free") spinStart();
      },
      onStepWin: (_round, step) => win(step.stepWinBp),
      onTumble: () => tumble(),
      onMultiplierUp: (m) => multiplierUp(m),
      onFreeSpinsTriggered: (spins) => {
        freeSpinsTrigger();
        return showOverlay({ kind: "fs-intro", spins });
      },
      // The stage flashes the "+N FREE SPINS" banner itself; the page only
      // layers the sound cue on top.
      onFreeSpinsRetrigger: () => freeSpinsTrigger(),
      onFreeSpinsEnd: (totalBp) =>
        showOverlay({ kind: "fs-outro", totalBp, payout: payoutFor(totalBp) }),
      onBigWin: (tier, totalBp) => {
        bigWinFanfare(
          tier === "jackpot" ? "jackpot" : tier === "huge" ? "huge" : "big"
        );
        setCelebration((p) => ({
          mode: tier === "big" ? "confetti" : "coins",
          id: (p?.id ?? 0) + 1,
        }));
        return showOverlay({
          kind: "bigwin",
          tier,
          totalBp,
          payout: payoutFor(totalBp),
        });
      },
      onComplete: (o) => {
        spinEnd();
        if (o.payout === 0n) lose();
        setRecords((prev) =>
          [
            ...prev,
            {
              totalWinBp: o.totalWinBp,
              freeSpins: o.totalFreeSpins,
              capped: o.capped,
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

  const spin = useDemoSpin<MegawaysOutcome>({
    evaluate: (randomness, bet) => {
      const seed = debugSeed.current?.(randomness, bet) ?? randomness;
      const outcome = megawaysEval(seed, bet, 0n);
      betRef.current = bet;
      // The hook credits the payout right away; hide it until the reels have
      // shown it, so the balance jumps when the win lands on screen.
      setHeldPayout(outcome.payout);
      queueMicrotask(() =>
        boardRef.current?.playOutcome(outcome, callbacksRef.current)
      );
      return outcome;
    },
    minSpinMs: 700,
  });

  // Wrap the surface so the controls see "rolling" for the whole animation
  // (auto-spin must not fire mid-cascade) and a balance without the held win.
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

  const wonDiamonds = (payout: bigint) => Number(lamportsToDiamonds(payout));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="flex w-full min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border-low bg-card/70 p-3 sm:p-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.45)]">
                Gem Rush
              </h1>
              <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted sm:inline">
                Megaways · up to 117,649 ways
              </span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-border-low bg-cream/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold shadow-[0_0_6px_#ffd700]" />
              Demo
            </span>
          </header>

          <div
            className="relative w-full"
            onClick={() => {
              if (overlay) dismissOverlay();
            }}
          >
            <MegawaysBoard ref={boardRef} turbo={turbo} />

            <AnimatePresence>
              {overlay && (
                <motion.div
                  key={overlay.kind}
                  className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center rounded-2xl bg-black/55 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <motion.div
                    className="flex flex-col items-center gap-2 px-6 text-center"
                    initial={{ scale: 0.6, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  >
                    {overlay.kind === "fs-intro" && (
                      <>
                        <span className="font-display text-sm font-bold uppercase tracking-[0.4em] text-primary">
                          Bonus
                        </span>
                        <span className="font-display text-5xl font-black uppercase tracking-[0.12em] text-gold [text-shadow:0_0_30px_rgba(255,215,0,0.7)] sm:text-6xl">
                          {overlay.spins} Free Spins
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                          Multiplier grows with every tumble
                        </span>
                      </>
                    )}
                    {overlay.kind === "fs-outro" && (
                      <>
                        <span className="font-display text-sm font-bold uppercase tracking-[0.4em] text-primary">
                          Free spins complete
                        </span>
                        <span className="font-mono text-5xl font-black tabular-nums text-gold [text-shadow:0_0_30px_rgba(255,215,0,0.7)]">
                          <CountUp
                            value={wonDiamonds(overlay.payout)}
                            durationMs={1600}
                            format={(n) =>
                              `${Math.round(n).toLocaleString("en-US")} 💎`
                            }
                          />
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                          Total bonus win
                        </span>
                      </>
                    )}
                    {overlay.kind === "bigwin" && (
                      <>
                        <span
                          className={`font-display text-5xl font-black uppercase tracking-[0.12em] sm:text-7xl ${
                            overlay.tier === "jackpot"
                              ? "text-[#ff6b35] [text-shadow:0_0_40px_rgba(255,107,53,0.9)]"
                              : "text-gold [text-shadow:0_0_30px_rgba(255,215,0,0.7)]"
                          }`}
                        >
                          {WIN_TIER_LABEL[overlay.tier]}
                        </span>
                        <span className="font-mono text-4xl font-black tabular-nums text-foreground sm:text-5xl">
                          <CountUp
                            value={wonDiamonds(overlay.payout)}
                            durationMs={2200}
                            format={(n) =>
                              `${Math.round(n).toLocaleString("en-US")} 💎`
                            }
                          />
                        </span>
                        <span className="text-sm font-bold text-primary">
                          {(Number(overlay.totalBp) / 10_000).toLocaleString(
                            "en-US",
                            {
                              maximumFractionDigits: 1,
                            }
                          )}
                          × your bet
                        </span>
                      </>
                    )}
                    <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Tap to continue
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <MegawaysHistory records={records} />
        </section>

        <aside className="w-full lg:w-[350px] lg:shrink-0">
          <MegawaysControls
            spin={surface}
            turbo={turbo}
            onTurboChange={setTurbo}
            onOpenPaytable={() => setPaytableOpen(true)}
            canSkip={animating}
            onSkip={skip}
          />
        </aside>
      </div>

      <MegawaysPaytable
        open={paytableOpen}
        onClose={() => setPaytableOpen(false)}
      />

      {celebration != null && (
        <ConfettiCanvas
          key={celebration.id}
          mode={celebration.mode}
          durationMs={celebration.mode === "coins" ? 3000 : 2000}
          spawnEveryMs={celebration.mode === "coins" ? 120 : 0}
        />
      )}
    </main>
  );
}
