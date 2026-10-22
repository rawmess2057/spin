import Link from "next/link";
import { symbolDataUrl } from "../hold-spin/hold-spin-art";
import { HS } from "../../lib/solana/games/hold-spin";

/** Home-page card for Dragon's Vault: a 5×3 mini grid with locked coins. */
const MINI: number[][] = [
  [HS.COIN, HS.TEN, HS.COIN],
  [HS.DRAGON, HS.COIN, HS.ACE],
  [HS.COIN, HS.WILD, HS.COIN],
  [HS.TIGER, HS.COIN, HS.KING],
  [HS.COIN, HS.LANTERN, HS.COIN],
];

export function HoldSpinCard() {
  const accent = "#ff9f1c";
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-col items-center gap-8 rounded-2xl border border-border-low bg-card p-6 sm:p-10 lg:flex-row lg:gap-12">
        <div className="w-56 shrink-0 sm:w-64">
          <div
            className="grid grid-cols-5 gap-1 rounded-sm border border-border-low bg-gradient-to-b from-card to-black p-3"
            style={{ filter: `drop-shadow(0 0 30px ${accent}55)` }}
          >
            {MINI.map((col, r) =>
              col.map((s, row) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${r}-${row}`}
                  src={symbolDataUrl(s)}
                  alt=""
                  className={`aspect-square w-full rounded-sm ${s === HS.COIN ? "bg-gold/15" : "bg-black/40"}`}
                  style={{ gridColumn: r + 1, gridRow: row + 1 }}
                />
              ))
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <p className="font-display text-xs font-light uppercase tracking-[0.4em] text-muted">
            New · Hold &amp; Spin slot
          </p>
          <h2
            className="font-display mt-2 text-4xl font-bold uppercase tracking-wide sm:text-5xl"
            style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
          >
            Dragon&apos;s Vault
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Six coins lock the vault and start the respins. Every new coin
            resets the counter — fill all fifteen cells for the GRAND on top of
            MINOR and MAJOR jackpot coins.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/hold-spin"
              className="font-contrail rounded-sm bg-gold px-8 py-3 text-sm uppercase tracking-wide text-gold-foreground shadow-[0_0_24px_rgba(255,215,0,0.4)] transition hover:brightness-110 hover:shadow-[0_0_36px_rgba(255,215,0,0.6)]"
            >
              Play now
            </Link>
            <span className="font-display text-xs uppercase tracking-[0.25em] text-muted">
              20 lines · Respins · 1,000× GRAND
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
