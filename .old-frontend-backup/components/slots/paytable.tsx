"use client";

import { useState } from "react";
import {
  SLOTS_BASE_BP,
  SLOTS_HIT_RATE,
  SLOTS_MAX_MULTIPLIER_BP,
  SLOTS_RTP,
  SLOT_SYMBOLS,
  SLOTS_X4,
  SLOTS_X5,
} from "../../lib/spin/config";

function multX(bp: bigint): string {
  return `${(Number(bp) / 100).toFixed(0)}x`;
}

export function Paytable() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground"
      >
        {open ? "Hide paytable" : "View paytable"}
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border-low bg-cream/40">
          <table className="w-full min-w-105 text-sm">
            <thead>
              <tr className="border-b border-border-low text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">3 of a kind</th>
                <th className="px-3 py-2 font-medium">4 of a kind</th>
                <th className="px-3 py-2 font-medium">5 of a kind</th>
              </tr>
            </thead>
            <tbody>
              {SLOT_SYMBOLS.map((s, i) => {
                const x5 = SLOTS_BASE_BP[i] * SLOTS_X5;
                return (
                  <tr
                    key={s.name}
                    className="border-b border-border-low/60 last:border-0"
                  >
                    <td className="px-3 py-2">
                      <span className="mr-2 text-xl align-middle">
                        {s.glyph}
                      </span>
                      <span className="align-middle">{s.name}</span>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {multX(SLOTS_BASE_BP[i])}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {multX(SLOTS_BASE_BP[i] * SLOTS_X4)}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {x5 > SLOTS_MAX_MULTIPLIER_BP ? "100x (cap)" : multX(x5)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border-low px-3 py-2 text-xs text-muted">
            Win chance ≈ {(SLOTS_HIT_RATE * 100).toFixed(1)}% · Return to player{" "}
            {(SLOTS_RTP * 100).toFixed(1)}% · Max win 100x. Any 3 matching
            symbols anywhere on the reels wins — the highest count wins, ties
            favor the higher symbol. Outcomes come from ORAO VRF randomness and
            are verifiable on-chain.
          </p>
        </div>
      )}
    </div>
  );
}
