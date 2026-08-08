"use client";

import { Modal } from "../../ui/modal";
import { GRID_MAX_MULTIPLIER_BP } from "../../../lib/solana/config";
import type { GridGameDef } from "./grid-screen";

/**
 * Paytable for the grid games: base multiplier per symbol × the count
 * curve (2^(count - min_count), capped at 4x), with the 100x hard cap
 * noted. Data comes straight from the on-chain constants.
 */
export function GridPaytableModal({
  open,
  onClose,
  def,
}: {
  open: boolean;
  onClose: () => void;
  def: GridGameDef;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Paytable">
      <div className="space-y-4 text-sm">
        <p className="text-xs leading-relaxed text-muted">
          Scatter pays: match {def.minCount}+ of a symbol anywhere on the{" "}
          {def.reels}×{def.rows} board. Payout per symbol below (× count curve)
          at min-count; every extra symbol doubles it, up to 4x. Max payout is
          capped at {Number(GRID_MAX_MULTIPLIER_BP) / 10_000}x.
        </p>
        <div className="overflow-hidden rounded-lg border border-border-low">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-cream/50 text-muted">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 text-right font-medium">
                  {def.minCount}+ match
                </th>
                <th className="px-3 py-2 text-right font-medium">×4 max</th>
              </tr>
            </thead>
            <tbody>
              {def.symbolNames.map((name, i) => (
                <tr
                  key={i}
                  className="border-t border-border-low transition hover:bg-cream/40"
                >
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <svg
                        viewBox="0 0 64 64"
                        className="size-6"
                        aria-hidden="true"
                      >
                        <use href={`#${def.prefix}-sym-${i}`} />
                      </svg>
                      <span className="capitalize">{name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {def.paytableMinBp[i] !== undefined
                      ? `${(Number(def.paytableMinBp[i]) / 100).toFixed(2)}x`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {def.paytableMinBp[i] !== undefined
                      ? `${((Number(def.paytableMinBp[i]) * 4) / 100).toFixed(2)}x`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          RTP {`${(def.rtp * 100).toFixed(1)}%`} (2M-sample Monte-Carlo on the
          devnet paytables). Wilds, free spins and cascades are settled in the
          same single VRF callback as the base board.
        </p>
      </div>
    </Modal>
  );
}
