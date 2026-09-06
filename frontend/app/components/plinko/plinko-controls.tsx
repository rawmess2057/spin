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
import { RiskSelector } from "./plinko-risk-selector";
import { RowSelector } from "./plinko-row-selector";
import {
  type PlinkoConfig,
  plinkoEncodeTarget,
} from "../../lib/solana/games/plinko";

type SpinSurface = {
  balance: bigint | null;
  minBet: bigint | null;
  maxBet: bigint | null;
  isSending: boolean;
  rolling: boolean;
  sessionReady: boolean;
  spendLeft: bigint;
  betErrors: (lamports: bigint | null) => string[];
  placeBet: (lamports: bigint, target: bigint) => Promise<boolean>;
  reset: () => void;
};

type Props = {
  config: PlinkoConfig;
  onConfigChange: (config: PlinkoConfig) => void;
  spin: SpinSurface;
};

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

export function PlinkoControls({ config, onConfigChange, spin }: Props) {
  const [input, setInput] = useState("");
  const seededDefault = useRef(false);

  // Bet limits arrive in lamports; the bet box and chips work in diamonds.
  const minD = spin.minBet == null ? null : lamportsToDiamonds(spin.minBet);
  const maxD = spin.maxBet == null ? null : lamportsToDiamonds(spin.maxBet);
  const chips = useMemo(() => diamondChips(minD, maxD), [minD, maxD]);
  const defaultBetD = useMemo(() => defaultBet(minD, maxD), [minD, maxD]);

  // Pre-fill the box with a sensible bet as soon as the chain limits arrive,
  // so the big button is immediately playable (Stake-style).
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

  /** Halves or doubles the bet box, clamped to the chain's [min, max]. */
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
  const canDrop =
    betLamports != null &&
    errors.length === 0 &&
    !spin.rolling &&
    !spin.isSending;

  const drop = async () => {
    if (betLamports == null) return;
    haptic("medium");
    spin.reset();
    const ok = await spin.placeBet(betLamports, plinkoEncodeTarget(config));
    if (!ok) return;
    // Outcome surfaces via useVaultSpin -> board drop + landing overlay.
  };

  // --- Auto-play -------------------------------------------------------------
  // Places one on-chain bet after another (the bet box value, falling back to
  // the default chip when the box is empty), gated so it never overlaps a
  // transaction and stops before it can prompt the wallet or spend past its
  // budget.
  const [auto, setAuto] = useState(false);
  const [drops, setDrops] = useState<number | null>(null); // null = unlimited
  const [autoPlaysLeft, setAutoPlaysLeft] = useState<number | null>(null);
  const autoPlaysLeftRef = useRef<number | null>(null);

  // Effective stake per auto drop: the bet-box value, or the default chip.
  const autoBetLamports = useMemo(() => {
    if (betLamports != null) return betLamports;
    return defaultBetD == null ? null : diamondsToLamports(defaultBetD);
  }, [betLamports, defaultBetD]);

  const toggleAuto = () => {
    if (auto) {
      stopAuto();
      return;
    }
    haptic("light");
    autoPlaysLeftRef.current = drops;
    setAutoPlaysLeft(drops);
    setAuto(true);
  };

  const stopAuto = (reason?: string) => {
    setAuto(false);
    if (reason) toast.error(reason);
  };

  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => {
      if (spin.isSending || spin.rolling) return; // let the current spin settle
      if (!spin.sessionReady) return;
      if (autoBetLamports == null) {
        stopAuto("Enter a valid bet amount for auto-play.");
        return;
      }
      if (spin.balance != null && autoBetLamports > spin.balance) {
        stopAuto("Auto-play stopped — not enough balance.");
        return;
      }
      if (autoBetLamports > spin.spendLeft) {
        stopAuto("Auto-play stopped — session spend limit reached.");
        return;
      }
      if (spin.betErrors(autoBetLamports).length > 0) {
        stopAuto("Auto-play stopped — bet is invalid.");
        return;
      }
      if (autoPlaysLeftRef.current != null) {
        if (autoPlaysLeftRef.current <= 0) {
          stopAuto();
          return;
        }
        autoPlaysLeftRef.current -= 1;
        setAutoPlaysLeft(autoPlaysLeftRef.current);
      }
      spin.reset();
      haptic("light");
      void spin.placeBet(autoBetLamports, plinkoEncodeTarget(config));
    }, 650);
    return () => clearInterval(iv);
  }, [auto, spin, autoBetLamports, config]);

  const balanceLabel =
    spin.balance == null
      ? "—"
      : diamondString(lamportsToDiamonds(spin.balance));

  const busy = spin.rolling || spin.isSending;
  const betButtonLabel = busy
    ? "Dropping ball…"
    : currentD != null
      ? `Bet ${diamondString(currentD)} 💎`
      : "Bet";

  return (
    <Card className="mx-auto w-full max-w-2xl p-4 sm:p-5">
      {/* Bet amount ------------------------------------------------------- */}
      <div className="flex items-baseline justify-between">
        <FieldLabel>Bet amount</FieldLabel>
        <div className="mb-1.5 flex items-baseline gap-1 text-[11px] font-semibold text-muted">
          Balance
          <span className="font-mono text-xs font-bold text-foreground">
            {balanceLabel}
          </span>
          <span className="text-[11px]">💎</span>
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
            {minD != null ? `min ${diamondString(minD)}` : ""}
          </span>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {/* Risk + rows ------------------------------------------------------ */}
      <div className="mt-4">
        <FieldLabel>Risk</FieldLabel>
        <RiskSelector
          value={config.risk}
          onChange={(risk) => onConfigChange({ ...config, risk })}
        />
      </div>

      <div className="mt-3">
        <FieldLabel>Rows</FieldLabel>
        <RowSelector
          value={config.rows}
          onChange={(rows) => onConfigChange({ ...config, rows })}
        />
      </div>

      {/* Big drop button -------------------------------------------------- */}
      <Button
        className="mt-4 h-12 w-full text-base"
        onClick={drop}
        disabled={!canDrop}
      >
        {betButtonLabel}
      </Button>
      <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground">
        {busy
          ? "Settling your drop on-chain — hang tight."
          : "Every drop is settled on-chain from a provably fair reveal."}
      </p>

      {/* Auto play -------------------------------------------------------- */}
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
                ? autoPlaysLeft == null
                  ? "Playing until stopped…"
                  : `Drops left: ${Math.max(0, autoPlaysLeft)}`
                : "Drop one ball after another."}
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
                {autoPlaysLeft == null
                  ? "∞ unlimited"
                  : `${Math.max(0, autoPlaysLeft)} left`}
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
                    onClick={() => setDrops(n)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition ${
                      drops === n
                        ? "bg-primary/20 text-primary"
                        : "text-muted hover:bg-cream hover:text-foreground"
                    }`}
                  >
                    {n == null ? "∞" : n}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                drops
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
