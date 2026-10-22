"use client";

import { compactMultiplier } from "../../lib/format";

export type WheelRecord = {
  segment: number;
  multiplierBp: bigint;
};

const TONES = {
  zero: { bg: "#2a2e44", shadow: "#171a2b", text: "#9aa0b8" },
  small: { bg: "#00c98a", shadow: "#00855b", text: "#06110d" },
  mid: { bg: "#9945ff", shadow: "#5f21b0", text: "#ffffff" },
  gold: { bg: "#ffc057", shadow: "#b87d1a", text: "#1a1200" },
  top: { bg: "#ff4d5e", shadow: "#b01f2e", text: "#ffffff" },
};

function toneFor(bp: bigint) {
  const x = Number(bp) / 10_000;
  if (x === 0) return TONES.zero;
  if (x >= 5) return TONES.top;
  if (x >= 3) return TONES.gold;
  if (x >= 2) return TONES.mid;
  return TONES.small;
}

export function WheelHistory({
  records,
  count = 24,
}: {
  records: WheelRecord[];
  count?: number;
}) {
  const chips = records.slice(-count);
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted">
        Recent spins
      </span>
      {chips.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Spin the wheel to see your results here.
        </span>
      ) : (
        <div className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pr-1">
          {chips.map(({ multiplierBp }, i) => {
            const t = toneFor(multiplierBp);
            return (
              <div
                key={i}
                className="win-pop shrink-0 rounded-md px-1.5 py-1 text-[10px] font-bold leading-none tabular-nums"
                style={{
                  background: `linear-gradient(180deg, ${t.bg} 0%, ${t.shadow} 100%)`,
                  boxShadow: `inset 0 -2px 0 ${t.shadow}, 0 0 8px ${t.shadow}55`,
                  color: t.text,
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
