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
import Link from "next/link";
import { haptic } from "../../lib/sound/events";
import type { SpinSurface } from "../../lib/hooks/use-demo-spin";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export type BetPanelSpin = SpinSurface & {
  isDemo?: boolean;
  refill?: () => void;
};

type Props = {
  spin: BetPanelSpin;
  /** The game's packed options, sent with every bet. */
  target: bigint;
  /** Game-specific selectors, rendered between the bet box and the button. */
  children?: ReactNode;
  /** Big-button label while a bet is in flight. */
  busyLabel: string;
  /** Big-button verb, e.g. "Spin" → "Spin 50 💎". */
  verb?: string;
  /** Noun for the auto-play copy, e.g. "spins". */
  roundNoun?: string;
  footnote?: { idle: string; busy: string; demo: string };
  /** Replaces the big button while a result is animating (e.g. a Skip button). */
  skipSlot?: ReactNode;
};

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

/**
 * The bet controls every game shares: balance row (with demo badge / buy
 * chips), bet box with ½ / 2× and chip ladder, validation errors, the big bet
 * button and auto-play. Game-specific selectors go in `children`.
 */
export function BetPanel({
  spin,
  target,
  children,
  busyLabel,
  verb = "Bet",
  roundNoun = "rounds",
  footnote,
  skipSlot,
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

  const errors = spin.betErrors(betLamports, target);
  const busy = spin.rolling || spin.isSending;
  const canBet = betLamports != null && errors.length === 0 && !busy;

  const bet = async () => {
    if (betLamports == null) return;
    haptic("medium");
    spin.reset();
    await spin.placeBet(betLamports, target);
  };

  // --- auto play -----------------------------------------------------------
  const [auto, setAuto] = useState(false);
  const [rounds, setRounds] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const leftRef = useRef<number | null>(null);
  const autoBet = useMemo(() => {
    if (betLamports != null) return betLamports;
    return defaultBetD == null ? null : diamondsToLamports(defaultBetD);
  }, [betLamports, defaultBetD]);

  const stopAuto = (reason?: string) => {
    setAuto(false);
    if (reason) toast.error(reason);
  };
  const toggleAuto = () => {
    if (auto) return stopAuto();
    haptic("light");
    leftRef.current = rounds;
    setLeft(rounds);
    setAuto(true);
  };

  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => {
      if (spin.isSending || spin.rolling) return;
      if (!spin.sessionReady) return;
      if (autoBet == null) return stopAuto("Enter a valid bet for auto-play.");
      if (spin.balance != null && autoBet > spin.balance) {
        return stopAuto("Auto-play stopped — not enough chips.");
      }
      if (autoBet > spin.spendLeft) {
        return stopAuto("Auto-play stopped — session allowance reached.");
      }
      if (spin.betErrors(autoBet, target).length > 0) {
        return stopAuto("Auto-play stopped — bet is invalid.");
      }
      if (leftRef.current != null) {
        if (leftRef.current <= 0) return stopAuto();
        leftRef.current -= 1;
        setLeft(leftRef.current);
      }
      spin.reset();
      haptic("light");
      void spin.placeBet(autoBet, target);
    }, 650);
    return () => clearInterval(iv);
  }, [auto, spin, autoBet, target]);

  const balanceLabel =
    spin.balance == null
      ? "—"
      : diamondString(lamportsToDiamonds(spin.balance));
  const bigLabel = busy
    ? busyLabel
    : currentD != null
      ? `${verb} ${diamondString(currentD)} 💎`
      : verb;

  return (
    <Card className="mx-auto w-full max-w-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <FieldLabel>Bet amount</FieldLabel>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-muted">
          {spin.isDemo && (
            <span className="flex items-center gap-1.5">
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
            </span>
          )}
          <span className="flex items-baseline gap-1">
            Balance
            <span className="font-mono text-xs font-bold text-foreground">
              {balanceLabel}
            </span>
            <span className="text-[11px]">💎</span>
          </span>
          {!spin.isDemo && (
            <Link
              href="/cashier"
              className="rounded-md border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/20"
            >
              Cashier
            </Link>
          )}
        </div>
      </div>

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
          aria-label="Bet amount in chips"
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

      {children}

      {busy && skipSlot ? (
        skipSlot
      ) : (
        <Button
          className="mt-4 h-12 w-full text-base"
          onClick={bet}
          disabled={!canBet}
        >
          {bigLabel}
        </Button>
      )}
      {footnote && (
        <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground">
          {spin.isDemo ? footnote.demo : busy ? footnote.busy : footnote.idle}
        </p>
      )}

      {/* Auto play */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border-low bg-cream/25">
        <button
          type="button"
          onClick={toggleAuto}
          disabled={busy && !auto}
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-cream/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-bold text-foreground">
              Auto play
            </span>
            <span className="block text-[11px] leading-snug text-muted">
              {auto
                ? left == null
                  ? "Playing until stopped…"
                  : `${roundNoun} left: ${Math.max(0, left)}`
                : `One ${roundNoun.replace(/s$/, "")} after another.`}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
              auto
                ? "border-primary bg-primary"
                : "border-border-low bg-background"
            }`}
          >
            <span
              className={`absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-foreground shadow transition-all ${
                auto ? "left-[calc(100%-1.3rem)]" : "left-0.5"
              }`}
            />
          </span>
        </button>
        <div className="flex items-center justify-between gap-2 border-t border-border-low bg-background/30 px-3 py-2">
          {auto ? (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {left == null ? "∞ unlimited" : `${Math.max(0, left)} left`}
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
                {[null, 5, 10, 25].map((n) => (
                  <button
                    key={n == null ? "unlimited" : n}
                    type="button"
                    onClick={() => setRounds(n)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition ${
                      rounds === n
                        ? "bg-primary/20 text-primary"
                        : "text-muted hover:bg-cream hover:text-foreground"
                    }`}
                  >
                    {n == null ? "∞" : n}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {roundNoun}
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
