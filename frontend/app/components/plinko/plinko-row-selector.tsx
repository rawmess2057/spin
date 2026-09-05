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
    <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
      {ROW_OPTIONS.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`min-w-9 shrink-0 cursor-pointer rounded-lg border px-1 py-1.5 text-sm font-bold transition ${
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-border-low bg-card text-muted hover:bg-cream"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
