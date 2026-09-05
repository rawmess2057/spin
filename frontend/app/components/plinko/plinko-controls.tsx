"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  diamondChips,
  diamondString,
  diamondsToLamports,
  lamportsToDiamonds,
  parseDiamonds,
} from "../../lib/diamonds";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { RiskSelector } from "./plinko-risk-selector";
import { RowSelector } from "./plinko-row-selector";
import { PlinkoLastWins, type WinRecord } from "./plinko-last-wins";
import {
  PLINKO_RISK,
  type PlinkoConfig,
  type PlinkoOutcome,
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
  lastOutcome: PlinkoOutcome | null;
  lastBet: bigint | null;
  spin: SpinSurface;
};

export function PlinkoControls({
  config,
  onConfigChange,
  lastOutcome,
  lastBet,
  spin,
}: Props) {
  const [input, setInput] = useState("");
  const [wins, setWins] = useState<WinRecord[]>([]);
  const lastSeenOutcomeRef = useRef<PlinkoOutcome | null>(null);

  // Record each newly resolved spin into the recent-wins history. We compare
  // by object identity because the hook creates a fresh outcome per spin.
  useEffect(() => {
    if (lastOutcome == null || lastOutcome === lastSeenOutcomeRef.current) {
      return;
    }
    lastSeenOutcomeRef.current = lastOutcome;
    setWins((prev) => [
      ...prev,
      {
        bucket: lastOutcome.bucket,
        rowCount: config.rows,
        multiplierBp: lastOutcome.multiplierBp,
      },
    ]);
  }, [lastOutcome, config.rows]);

  // Default bet from the config's limits whenever they're first available.
  const chips = useMemo(
    () => diamondChips(spin.minBet, spin.maxBet),
    [spin.minBet, spin.maxBet]
  );
  const defaultBetD =
    spin.minBet != null ? chips[Math.min(1, chips.length - 1)] : null;

  const betLamports = useMemo(() => {
    if (!input) return null;
    const d = parseDiamonds(input);
    return d == null ? null : diamondsToLamports(d);
  }, [input]);

  const errors = spin.betErrors(betLamports);
  const canDrop =
    betLamports != null &&
    errors.length === 0 &&
    !spin.rolling &&
    !spin.isSending;

  const drop = async () => {
    if (betLamports == null) return;
    spin.reset();
    const ok = await spin.placeBet(betLamports, plinkoEncodeTarget(config));
    if (!ok) return;
    // outcome is surfaced via useVaultSpin -> lastOutcome (parent wiring);
    // this panel just triggers the bet.
    setInput("");
  };

  // --- Auto-play -------------------------------------------------------------
  // Auto-play places one on-chain bet after another (the bet box value, falling
  // back to the default chip when the box is empty), gated so it never overlaps
  // a transaction and stops before it can prompt the wallet or spend past its
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

  const startAuto = () => {
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
      void spin.placeBet(autoBetLamports, plinkoEncodeTarget(config));
    }, 600);
    return () => clearInterval(iv);
  }, [auto, spin, autoBetLamports, config]);

  return (
    <Card className="mx-auto w-full max-w-2xl p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">
            Risk
          </label>
          <RiskSelector
            value={config.risk}
            onChange={(risk) => onConfigChange({ ...config, risk })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">
            Rows
          </label>
          <RowSelector
            value={config.rows}
            onChange={(rows) => onConfigChange({ ...config, rows })}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted">
            Bet
          </label>
          <span className="text-xs text-muted">
            Balance:{" "}
            <span className="font-mono text-foreground">
              {spin.balance == null
                ? "—"
                : `${diamondString(lamportsToDiamonds(spin.balance))} 💎`}
            </span>
          </span>
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          placeholder={
            defaultBetD == null
              ? "Bet (💎)"
              : `Bet (e.g. ${diamondString(defaultBetD)} 💎)`
          }
          className="w-full rounded-lg border border-border-low bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary disabled:opacity-50"
          disabled={spin.rolling || spin.isSending}
        />
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.toString()}
                type="button"
                onClick={() => setInput(diamondString(c))}
                className="cursor-pointer rounded-md border border-border-low bg-cream/40 px-2.5 py-1 text-xs font-medium transition hover:bg-cream"
              >
                {diamondString(c)}
              </button>
            ))}
          </div>
        )}
        {errors.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <Button
        className="mt-4 w-full py-3 text-base"
        onClick={drop}
        disabled={!canDrop}
      >
        {spin.rolling || spin.isSending
          ? "Dropping…"
          : lastOutcome != null
            ? "Drop again"
            : "Drop ball"}
      </Button>

      <div className="mt-4 rounded-lg border border-border-low bg-cream/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">
              Auto play
            </div>
            <div className="text-xs text-muted">
              {auto
                ? autoPlaysLeft == null
                  ? "Playing until stopped…"
                  : `Drops left: ${Math.max(0, autoPlaysLeft)}`
                : "Drops one ball after another."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!auto && (
              <div className="flex overflow-hidden rounded-md border border-border-low">
                {[null, 5, 10, 25].map((n) => (
                  <button
                    key={n == null ? "unlimited" : n}
                    type="button"
                    onClick={() => setDrops(n)}
                    className={`px-2 py-1 text-xs font-medium transition ${
                      drops === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-cream/40 hover:bg-cream"
                    }`}
                  >
                    {n == null ? "∞" : n}
                  </button>
                ))}
              </div>
            )}
            <Button
              className="px-3 py-1.5 text-xs"
              variant={auto ? "destructive" : "primary"}
              onClick={auto ? () => stopAuto() : startAuto}
              disabled={auto ? false : spin.isSending || spin.rolling}
            >
              {auto ? "Stop" : "Auto"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Each drop is a real on-chain bet at your set amount. Auto-play needs
          an active session (avoiding wallet prompts), takes care to never
          overlap a transaction, and stops automatically when your session spend
          limit or balance runs out.
        </p>
      </div>

      {lastOutcome != null && lastBet != null && (
        <div className="mt-4 rounded-lg border border-border-low bg-cream/30 p-3 text-center">
          <p className="text-xs uppercase tracking-widest text-muted">
            Last result · {config.rows}-row{" "}
            {config.risk === PLINKO_RISK.LOW
              ? "low"
              : config.risk === PLINKO_RISK.MED
                ? "med"
                : "high"}
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
            {diamondString(lamportsToDiamonds(lastBet))} 💎 →{" "}
            {lastOutcome.payout >= lastBet ? "+" : ""}
            {diamondString(lamportsToDiamonds(lastOutcome.payout))} 💎
          </p>
          <p className="text-xs text-muted">
            Bucket {lastOutcome.bucket} ·{" "}
            {(Number(lastOutcome.multiplierBp) / 10000).toFixed(2)}×
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <PlinkoLastWins records={wins} />
        <div className="text-xs uppercase tracking-widest text-muted">
          Recent drops
        </div>
      </div>
    </Card>
  );
}
