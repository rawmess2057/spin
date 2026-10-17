"use client";

import { compactMultiplier } from "../../lib/format";
import { MEGAWAYS_SCALE, winTier, type WinTier } from "../../lib/win-tiers";

export type SpinRecord = {
  totalWinBp: bigint;
  freeSpins: number;
  capped: boolean;
};

const TIER_STYLE: Record<WinTier, string> = {
  none: "border-white/10 bg-white/5 text-muted",
  nice: "border-primary/40 bg-primary/15 text-primary",
  big: "border-gold/60 bg-gold/20 text-gold",
  huge: "border-accent/60 bg-accent/25 text-[#d9b8ff]",
  jackpot:
    "border-gold bg-[linear-gradient(135deg,#ffd700,#ff6b35,#ffd700)] text-gray-950 shadow-[0_0_12px_rgba(255,215,0,0.6)]",
};

type Props = {
  records: SpinRecord[];
  count?: number;
};

/** Recent-spins strip under the reels, newest on the right. */
export function MegawaysHistory({ records, count = 24 }: Props) {
  const chips = records.slice(-count);
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted">
        Recent spins
      </span>
      {chips.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Spin to see your results here.
        </span>
      ) : (
        <div className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pr-1">
          {chips.map((rec, i) => {
            const tier = winTier(rec.totalWinBp, MEGAWAYS_SCALE);
            return (
              <div
                key={`${i}-${rec.totalWinBp.toString()}`}
                className={`win-pop flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold leading-none tabular-nums ${TIER_STYLE[tier]}`}
                title={
                  rec.freeSpins > 0 ? `${rec.freeSpins} free spins` : undefined
                }
              >
                {rec.capped ? "MAX" : compactMultiplier(rec.totalWinBp)}
                {rec.freeSpins > 0 && (
                  <span className="rounded bg-black/30 px-1 py-0.5 text-[8px] tracking-wider">
                    FS
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
