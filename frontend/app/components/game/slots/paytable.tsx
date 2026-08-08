"use client";

import {
  SLOTS_BASE_BP,
  SLOTS_HIT_RATE,
  SLOTS_MAX_MULTIPLIER_BP,
  SLOTS_RTP,
  SLOT_SYMBOLS,
  SLOTS_X4,
  SLOTS_X5,
} from "../../../lib/solana/config";
import { Modal } from "../../ui/modal";
import { SlotSymbol } from "./symbols/slot-symbol";

function multX(bp: bigint): string {
  return `${(Number(bp) / 100).toFixed(0)}x`;
}

export function Paytable({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Paytable">
      <div className="overflow-x-auto rounded-sm border border-border-low bg-cream/40">
        <table className="w-full min-w-105 text-sm">
          <thead>
            <tr className="border-b border-gold/20 text-left text-xs text-gold">
              <th className="px-3 py-2 font-semibold uppercase tracking-widest">
                Symbol
              </th>
              <th className="px-3 py-2 font-semibold uppercase tracking-widest">
                3 of a kind
              </th>
              <th className="px-3 py-2 font-semibold uppercase tracking-widest">
                4 of a kind
              </th>
              <th className="px-3 py-2 font-semibold uppercase tracking-widest">
                5 of a kind
              </th>
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
                    <span className="flex items-center gap-2">
                      <SlotSymbol index={i} className="size-7 shrink-0" />
                      <span>{s.name}</span>
                    </span>
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
          <span className="font-semibold text-foreground">
            Single payline, pay anywhere.
          </span>{" "}
          This machine has one live line — the centre row, marked by the lit
          gold arrows on both rails. The dimmed symbols above and below it are
          the neighbouring positions on each reel strip and never pay. Any 3
          matching symbols anywhere along the live line wins; the highest count
          wins and ties favour the higher symbol.
          <br />
          Win chance ≈ {(SLOTS_HIT_RATE * 100).toFixed(1)}% · Return to player{" "}
          {(SLOTS_RTP * 100).toFixed(1)}% · Max win 100x. Outcomes come from
          ORAO VRF randomness and are verifiable on-chain.
        </p>
      </div>
    </Modal>
  );
}
