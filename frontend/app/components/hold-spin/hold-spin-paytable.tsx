"use client";

import {
  COIN_VALUE_BP,
  COIN_VALUE_WEIGHTS,
  GRAND_BP,
  HS,
  LINE_PAYS,
  SYMBOL_NAMES,
  BONUS_TRIGGER_COINS,
  RESPINS,
} from "../../lib/solana/games/hold-spin";
import { symbolDataUrl } from "./hold-spin-art";

const x = (bp: number) => `${(bp / 10_000).toFixed(2).replace(/\.?0+$/, "")}×`;

export function HoldSpinPaytable() {
  const paying = [
    HS.DRAGON,
    HS.TIGER,
    HS.LANTERN,
    HS.ACE,
    HS.KING,
    HS.QUEEN,
    HS.JACK,
    HS.TEN,
  ];
  return (
    <div className="space-y-4 text-xs">
      <p className="text-muted">
        Pays are multiples of your total bet. 20 fixed lines, left to right,
        three or more of a kind. Wilds land on reels 2–4 and substitute for
        every paying symbol.
      </p>
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-widest text-muted">
          <tr>
            <th className="py-1 text-left">Symbol</th>
            <th className="py-1 text-right">×3</th>
            <th className="py-1 text-right">×4</th>
            <th className="py-1 text-right">×5</th>
          </tr>
        </thead>
        <tbody>
          {paying.map((s) => (
            <tr key={s} className="border-t border-border-low">
              <td className="flex items-center gap-2 py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={symbolDataUrl(s, 40)} alt="" className="h-7 w-7" />
                {SYMBOL_NAMES[s]}
              </td>
              {LINE_PAYS[s].map((p, i) => (
                <td key={i} className="py-1.5 text-right font-mono">
                  {x(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded-lg border border-gold/40 bg-gold/5 p-3">
        <p className="font-semibold text-gold">Hold &amp; Spin</p>
        <p className="mt-1 text-muted">
          {BONUS_TRIGGER_COINS}+ coins lock in place and award {RESPINS}{" "}
          respins. Every new coin resets the counter. Fill all 15 cells for the
          GRAND ({x(GRAND_BP)}) on top of every coin value.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COIN_VALUE_BP.map((v, i) => (
            <span
              key={i}
              className="rounded-md border border-border-low bg-cream/40 px-2 py-0.5 font-mono"
              title={`${(COIN_VALUE_WEIGHTS[i] / 10).toFixed(1)}% of coins`}
            >
              {i === COIN_VALUE_BP.length - 1
                ? `MAJOR ${x(v)}`
                : i === COIN_VALUE_BP.length - 2
                  ? `MINOR ${x(v)}`
                  : x(v)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
