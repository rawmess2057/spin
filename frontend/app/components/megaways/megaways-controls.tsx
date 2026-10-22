"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  diamondChips,
  diamondString,
  diamondsToLamports,
  lamportsToDiamonds,
  parseDiamonds,
  defaultBet,
} from "../../lib/diamonds";
import { haptic } from "../../lib/sound/events";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { SpinSurface } from "../../lib/hooks/use-demo-spin";
import { megawaysEncodeTarget } from "../../lib/solana/games/megaways";

export type MegawaysSpinSurface = SpinSurface & {
  isDemo?: boolean;
  refill?: () => void;
};

type Props = {
  spin: MegawaysSpinSurface;
  turbo: boolean;
  onTurboChange: (on: boolean) => void;
  onOpenPaytable: () => void;
  /** True while the reels are still animating and a skip is possible. */
  canSkip: boolean;
  onSkip: () => void;
};

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  title,
  subtitle,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-cream/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block text-[11px] leading-snug text-muted">
          {subtitle}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          on ? "border-primary bg-primary" : "border-border-low bg-background"
        }`}
      >
        <span
          className={`absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-foreground shadow transition-all ${
            on ? "left-[calc(100%-1.3rem)]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function MegawaysControls({
  spin,
  turbo,
  onTurboChange,
  onOpenPaytable,
  canSkip,
  onSkip,
}: Props) {
  const [input, setInput] = useState("");
  const seededDefault = useRef(false);

  const minD = spin.minBet == null ? null : lamportsToDiamonds(spin.minBet);
  const maxD = spin.maxBet == null ? null : lamportsToDiamonds(spin.maxBet);
  const chips = useMemo(() => diamondChips(minD, maxD), [minD, maxD]);
  const defaultBetD = useMemo(() => defaultBet(minD, maxD), [minD, maxD]);

  useEffect(() => {
    if (!seededDefault.current && defaultBetD != null) {
      seededDefault.current = true;
      setInput(diamondString(defaultBetD));
    }
  }, [defaultBetD]);

  const betLamports = useMemo(() => {
    if (!input) return null;
    const d = parseDiamonds(input);
    return d == null ? null : diamondsToLamports(d);
  }, [input]);
  const currentD = betLamports == null ? null : lamportsToDiamonds(betLamports);

  const scaleBet = (dir: -1 | 1) => {
    const base = currentD ?? defaultBetD;
    if (base == null) return;
    let next = dir === -1 ? (base / 2n > 0n ? base / 2n : 1n) : base * 2n;
    if (minD != null && next < minD) next = minD;
    if (maxD != null && next > maxD) next = maxD;
    setInput(diamondString(next));
    haptic("light");
  };

  const errors = spin.betErrors(betLamports);
  const busy = spin.rolling || spin.isSending;
  const canSpin = betLamports != null && errors.length === 0 && !busy;

  const doSpin = async () => {
    if (betLamports == null) return;
    haptic("medium");
    spin.reset();
    await spin.placeBet(betLamports, megawaysEncodeTarget());
  };

  // --- Auto spin --------------------------------------------------------------
  const [auto, setAuto] = useState(false);
  const [spins, setSpins] = useState<number | null>(10);
  const [autoLeft, setAutoLeft] = useState<number | null>(null);
  const autoLeftRef = useRef<number | null>(null);

  const autoBetLamports = useMemo(() => {
    if (betLamports != null) return betLamports;
    return defaultBetD == null ? null : diamondsToLamports(defaultBetD);
  }, [betLamports, defaultBetD]);

  const stopAuto = (reason?: string) => {
    setAuto(false);
    if (reason) toast.error(reason);
  };

  const toggleAuto = () => {
    if (auto) {
      stopAuto();
      return;
    }
    haptic("light");
    autoLeftRef.current = spins;
    setAutoLeft(spins);
    setAuto(true);
  };

  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => {
      if (spin.isSending || spin.rolling) return;
      if (autoBetLamports == null) {
        stopAuto("Enter a valid bet amount for auto spin.");
        return;
      }
      if (spin.balance != null && autoBetLamports > spin.balance) {
        stopAuto("Auto spin stopped — not enough balance.");
        return;
      }
      if (spin.betErrors(autoBetLamports).length > 0) {
        stopAuto("Auto spin stopped — bet is invalid.");
        return;
      }
      if (autoLeftRef.current != null) {
        if (autoLeftRef.current <= 0) {
          stopAuto();
          return;
        }
        autoLeftRef.current -= 1;
        setAutoLeft(autoLeftRef.current);
      }
      spin.reset();
      haptic("light");
      void spin.placeBet(autoBetLamports, megawaysEncodeTarget());
    }, 500);
    return () => clearInterval(iv);
  }, [auto, spin, autoBetLamports]);

  const balanceLabel =
    spin.balance == null
      ? "—"
      : diamondString(lamportsToDiamonds(spin.balance));

  const bigLabel = busy
    ? "Spinning…"
    : currentD != null
      ? `Spin ${diamondString(currentD)} 💎`
      : "Spin";

  return (
    <Card className="mx-auto w-full max-w-2xl p-4 sm:p-5">
      {/* Balance row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1 text-[11px] font-semibold text-muted">
          Balance
          <span className="font-mono text-base font-bold text-foreground">
            {balanceLabel}
          </span>
          <span className="text-[11px]">💎</span>
        </div>
        {spin.isDemo && (
          <div className="flex items-center gap-1.5">
            <Badge tone="gold">Demo</Badge>
            {spin.refill && (
              <button
                type="button"
                onClick={() => {
                  spin.refill?.();
                  haptic("light");
                  toast.success("Demo balance refilled");
                }}
                disabled={busy}
                className="cursor-pointer rounded-md border border-border-low px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted transition hover:bg-cream hover:text-foreground disabled:opacity-40"
              >
                Refill
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bet amount */}
      <FieldLabel>Bet amount</FieldLabel>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-border-low bg-background/60 transition focus-within:border-primary/60">
        <button
          type="button"
          onClick={() => scaleBet(-1)}
          disabled={busy}
          aria-label="Halve bet"
          className="cursor-pointer border-r border-border-low px-3 text-base font-bold text-muted transition hover:bg-cream hover:text-foreground disabled:opacity-40"
        >
          ½
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-label="Bet amount in diamonds"
          className="w-full min-w-0 flex-1 bg-transparent px-2 py-2.5 text-center font-mono text-base font-bold tabular-nums outline-none placeholder:text-muted-foreground disabled:opacity-50"
          placeholder="Bet (💎)"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => scaleBet(1)}
          disabled={busy}
          aria-label="Double bet"
          className="cursor-pointer border-l border-border-low px-3 text-base font-bold text-muted transition hover:bg-cream hover:text-foreground disabled:opacity-40"
        >
          2×
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.toString()}
              type="button"
              onClick={() => {
                setInput(diamondString(c));
                haptic("light");
              }}
              disabled={busy}
              className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                currentD === c
                  ? "border-primary/70 bg-primary/15 text-primary"
                  : "border-border-low bg-card text-muted hover:bg-cream hover:text-foreground"
              }`}
            >
              {diamondString(c)}
            </button>
          ))}
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {minD != null && maxD != null
              ? `${diamondString(minD)} – ${diamondString(maxD)}`
              : ""}
          </span>
        </div>
      )}

      {errors.length > 0 && !busy && (
        <ul className="mt-2 space-y-0.5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {/* Spin / Skip */}
      {busy && canSkip ? (
        <Button
          className="mt-4 h-14 w-full text-base"
          variant="secondary"
          onClick={() => {
            haptic("light");
            onSkip();
          }}
        >
          Skip ⏭
        </Button>
      ) : (
        <Button
          className="mt-4 h-14 w-full text-lg tracking-wide"
          onClick={doSpin}
          disabled={!canSpin}
        >
          {bigLabel}
        </Button>
      )}
      <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground">
        {spin.isDemo
          ? "Demo mode — play with practice diamonds while the on-chain version is built."
          : "Every spin is settled on-chain from a provably fair reveal."}
      </p>

      {/* Turbo + paytable */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border-low bg-cream/25">
        <Toggle
          on={turbo}
          onChange={(on) => {
            haptic("light");
            onTurboChange(on);
          }}
          title="Turbo"
          subtitle="Faster reels and tumbles."
        />
        <div className="flex items-center justify-between border-t border-border-low bg-background/30 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Rules &amp; pays
          </span>
          <Button
            className="px-3 py-1 text-[11px]"
            variant="outline"
            onClick={onOpenPaytable}
          >
            Paytable
          </Button>
        </div>
      </div>

      {/* Auto spin */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border-low bg-cream/25">
        <Toggle
          on={auto}
          onChange={toggleAuto}
          disabled={busy && !auto}
          title="Auto spin"
          subtitle={
            auto
              ? autoLeft == null
                ? "Spinning until stopped…"
                : `Spins left: ${Math.max(0, autoLeft)}`
              : "Spin again automatically."
          }
        />
        <div className="flex items-center justify-between gap-2 border-t border-border-low bg-background/30 px-3 py-2">
          {auto ? (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {autoLeft == null
                  ? "∞ unlimited"
                  : `${Math.max(0, autoLeft)} left`}
              </span>
              <Button
                className="px-3 py-1 text-[11px]"
                variant="destructive"
                onClick={() => stopAuto()}
              >
                Stop auto
              </Button>
            </>
          ) : (
            <>
              <div className="flex overflow-hidden rounded-md border border-border-low">
                {[null, 10, 25, 50].map((n) => (
                  <button
                    key={n == null ? "unlimited" : n}
                    type="button"
                    onClick={() => setSpins(n)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition ${
                      spins === n
                        ? "bg-primary/20 text-primary"
                        : "text-muted hover:bg-cream hover:text-foreground"
                    }`}
                  >
                    {n == null ? "∞" : n}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                spins
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
