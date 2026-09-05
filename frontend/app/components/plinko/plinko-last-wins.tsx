"use client";

import { compactMultiplier, plinkoPalette } from "./bins";

/**
 * A compact strip of the most recent winning buckets, mirroring the Svelte
 * reference's `LastWins.svelte`: each win is a square chip colored by the
 * row-count palette of the bucket it landed in, showing the multiplier.
 * Newest win sits at the top.
 */

export type WinRecord = {
  /** Which bucket (0..rows) the ball landed in. */
  bucket: number;
  /** Row count of the spin that produced the win (colors the chip). */
  rowCount: number;
  /** Multiplier in basis points. */
  multiplierBp: bigint;
};

type Props = {
  records: WinRecord[];
  /** Number of most recent wins to display. */
  winCount?: number;
};

export function PlinkoLastWins({ records, winCount = 4 }: Props) {
  const chips = records.slice(-winCount).toReversed();

  if (chips.length === 0) {
    return (
      <div className="text-xs uppercase tracking-widest text-muted">
        No drops yet
      </div>
    );
  }

  return (
    <div className="flex w-9 flex-col overflow-hidden rounded-md border border-border-low sm:w-10">
      {chips.map(({ bucket, rowCount, multiplierBp }, i) => {
        const palette = plinkoPalette(rowCount);
        const bg = palette.background[bucket];
        const shadow = palette.shadow[bucket];
        return (
          <div
            key={`${rowCount}-${bucket}-${i}`}
            className="flex aspect-square items-center justify-center text-[9px] font-bold text-gray-950 sm:text-[11px]"
            style={{
              background: `linear-gradient(180deg, ${bg} 0%, ${shadow} 100%)`,
              boxShadow: `inset 0 -2px 0 ${shadow}`,
            }}
          >
            {compactMultiplier(multiplierBp)}
          </div>
        );
      })}
    </div>
  );
}
