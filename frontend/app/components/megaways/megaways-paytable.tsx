"use client";

import { Modal } from "../ui/modal";
import { symbolDataUrl } from "./symbol-art";
import {
  FS_BASE,
  FS_PER_EXTRA,
  FS_RETRIGGER_SCATTERS,
  FS_RETRIGGER_SPINS,
  FS_TRIGGER_SCATTERS,
  MAX_WIN_BP,
  PAYTABLE,
  SYM,
  SYMBOL_NAMES,
} from "../../lib/solana/games/megaways";

const PAYING = [
  SYM.H4,
  SYM.H3,
  SYM.H2,
  SYM.H1,
  SYM.L6,
  SYM.L5,
  SYM.L4,
  SYM.L3,
  SYM.L2,
  SYM.L1,
] as const;

function x(bp: number): string {
  const v = bp / 10_000;
  return v >= 1 ? `${v.toFixed(v % 1 === 0 ? 0 : 1)}×` : `${v.toFixed(2)}×`;
}

export function MegawaysPaytable({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Paytable">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Six reels, each showing 2 to 7 symbols — up to 117,649 ways to win.
        Matching symbols on adjacent reels from the left pay once for every way
        they connect. Pays below are per way, as a multiple of your total bet.
      </p>

      <div className="overflow-hidden rounded-xl border border-border-low">
        <table className="w-full text-xs">
          <thead className="bg-cream/40 text-[10px] uppercase tracking-widest text-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">Symbol</th>
              <th className="px-2 py-1.5 text-right">3</th>
              <th className="px-2 py-1.5 text-right">4</th>
              <th className="px-2 py-1.5 text-right">5</th>
              <th className="px-2 py-1.5 text-right">6</th>
            </tr>
          </thead>
          <tbody>
            {PAYING.map((s) => (
              <tr key={s} className="border-t border-border-low">
                <td className="flex items-center gap-2 px-2 py-1.5 font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={symbolDataUrl(s)}
                    alt=""
                    width={26}
                    height={26}
                    className="shrink-0"
                  />
                  {SYMBOL_NAMES[s]}
                </td>
                {[1, 2, 3, 4].map((k) => (
                  <td
                    key={k}
                    className="px-2 py-1.5 text-right font-mono tabular-nums text-foreground"
                  >
                    {x(PAYTABLE[s][k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
        <li className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={symbolDataUrl(SYM.WILD)} alt="" width={26} height={26} />
          <span>
            <b className="text-foreground">Wild</b> substitutes for every paying
            symbol. Lands on reels 2–5.
          </span>
        </li>
        <li className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={symbolDataUrl(SYM.SCATTER)} alt="" width={26} height={26} />
          <span>
            <b className="text-foreground">Bonus</b> — {FS_TRIGGER_SCATTERS}{" "}
            anywhere award {FS_BASE} free spins, +{FS_PER_EXTRA} for each extra
            scatter. During free spins, {FS_RETRIGGER_SCATTERS} scatters add{" "}
            {FS_RETRIGGER_SPINS} more.
          </span>
        </li>
        <li>
          <b className="text-foreground">Cascades</b> — winning symbols vanish
          and new ones tumble in. Tumbling continues until no new win lands.
        </li>
        <li>
          <b className="text-foreground">Free-spin multiplier</b> — starts at x1
          and rises by 1 after every winning tumble. It never resets during the
          bonus.
        </li>
        <li>
          <b className="text-foreground">Max win</b> —{" "}
          {(Number(MAX_WIN_BP) / 10_000).toLocaleString("en-US")}× your bet.
        </li>
      </ul>
    </Modal>
  );
}
