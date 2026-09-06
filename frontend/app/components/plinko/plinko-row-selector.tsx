"use client";

import {
  PLINKO_MAX_ROWS,
  PLINKO_MIN_ROWS,
} from "../../lib/solana/games/plinko";

type Props = {
  value: number;
  onChange: (rows: number) => void;
};

const ROW_OPTIONS: number[] = [];
for (let r = PLINKO_MIN_ROWS; r <= PLINKO_MAX_ROWS; r++) ROW_OPTIONS.push(r);

export function RowSelector({ value, onChange }: Props) {
  return (
    <div className="grid w-full grid-cols-9 gap-1">
      {ROW_OPTIONS.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={active}
            className={`aspect-square w-full cursor-pointer rounded-lg border text-sm font-bold transition ${
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
