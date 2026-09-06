"use client";

import { compactMultiplier, plinkoPalette } from "./bins";

/**
 * A horizontal strip of the most recent drops, rendered under the board like
 * Stake's result history: each drop is a small chip coloured by the bucket
 * palette of the rows it was played on, showing its multiplier. Newest on the
 * right, popping in as it lands.
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
  /** Number of most recent drops to display. */
  count?: number;
};

export function PlinkoHistory({ records, count = 24 }: Props) {
  const chips = records.slice(-count);

  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted">
        Recent drops
      </span>
      {chips.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Drop a ball to see your results here.
        </span>
      ) : (
        <div className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pr-1">
          {chips.map(({ bucket, rowCount, multiplierBp }, i) => {
            const palette = plinkoPalette(rowCount);
            const bg = palette.background[bucket];
            const shadow = palette.shadow[bucket];
            const isNewest = i === chips.length - 1;
            return (
              <div
                key={`${rowCount}-${bucket}-${i}`}
                className="win-pop shrink-0 rounded-md px-1.5 py-1 text-[10px] font-bold leading-none text-gray-950 tabular-nums"
                style={{
                  background: `linear-gradient(180deg, ${bg} 0%, ${shadow} 100%)`,
                  boxShadow: `inset 0 -2px 0 ${shadow}, 0 0 8px ${shadow}55`,
                  animationDelay: isNewest ? "0ms" : undefined,
                }}
              >
                {compactMultiplier(multiplierBp)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
