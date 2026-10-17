"use client";

import {
  PLINKO_MAX_ROWS,
  PLINKO_MIN_ROWS,
} from "../../lib/solana/games/plinko";

type Props = {
  value: number;
  onChange: (rows: number) => void;
  /** Locked while a ball is in flight: the board can't change under it. */
  disabled?: boolean;
};

const ROW_OPTIONS: number[] = [];
for (let r = PLINKO_MIN_ROWS; r <= PLINKO_MAX_ROWS; r++) ROW_OPTIONS.push(r);

export function RowSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="grid w-full grid-cols-9 gap-1">
      {ROW_OPTIONS.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            aria-pressed={active}
            className={`aspect-square w-full cursor-pointer rounded-lg border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-primary/70 bg-primary/15 text-primary shadow-[0_0_12px_rgba(0,255,163,0.25)]"
                : "border-border-low bg-card text-muted hover:bg-cream hover:text-foreground"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
