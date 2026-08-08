"use client";

import { useEffect, useRef, useState } from "react";
import { DICE_MAX_TARGET, DICE_MIN_TARGET } from "../../../lib/solana/config";

const RANGE = 10_000;

type DiceTrackProps = {
  target: bigint;
  spinning: boolean;
  roll: bigint | null;
  win: boolean | null;
};

/**
 * A 0–10,000 "roll under" probability bar. The zone left of `target` is the
 * win zone; a marker animates to the landed `roll` value once resolved.
 */
export function DiceTrack({ target, spinning, roll, win }: DiceTrackProps) {
  // While spinning, this holds rapidly-shuffling display values; once the
  // spin stops, the landed `roll` (or null, if reset) is used directly
  // instead of syncing it into state.
  const [tumbleValue, setTumbleValue] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!spinning) return;
    let last = performance.now();
    const loop = (t: number) => {
      if (t - last > 45) {
        setTumbleValue(Math.floor(Math.random() * RANGE));
        last = t;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spinning]);

  const displayRoll = spinning
    ? tumbleValue
    : roll != null
      ? Number(roll)
      : null;

  const targetPct = (Number(target) / RANGE) * 100;
  const markerPct =
    displayRoll != null ? (displayRoll / RANGE) * 100 : targetPct / 2;

  return (
    <div className="space-y-2">
      <div className="relative h-10 overflow-hidden rounded-sm border border-border-low bg-background/60">
        <div
          className="absolute inset-y-0 left-0 bg-gold/15"
          style={{ width: `${targetPct}%` }}
        />
        <div
          className="absolute inset-y-0 border-l-2 border-dashed border-gold/60"
          style={{ left: `${targetPct}%` }}
        />
        <div
          className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full transition-[left] duration-150"
          style={{
            left: `calc(${markerPct}% - 3px)`,
            background:
              win == null
                ? "var(--foreground)"
                : win
                  ? "var(--gold)"
                  : "var(--orange)",
            boxShadow:
              win == null
                ? undefined
                : win
                  ? "0 0 12px rgba(255,192,87,0.8)"
                  : "0 0 12px rgba(240,0,1,0.8)",
          }}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[11px] text-muted">
        <span>0</span>
        <span className="text-gold">win: roll &lt; {target.toString()}</span>
        <span>{RANGE}</span>
      </div>
      <p className="text-center font-mono text-2xl font-bold tabular-nums">
        {displayRoll != null
          ? displayRoll.toString().padStart(5, "0")
          : "–––––"}
      </p>
      <p className="text-center text-[10px] text-muted">
        Target range {DICE_MIN_TARGET.toString()}–{DICE_MAX_TARGET.toString()}
      </p>
    </div>
  );
}
