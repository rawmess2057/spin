import Link from "next/link";
import { symbolDataUrl } from "../megaways/symbol-art";
import { SYM } from "../../lib/solana/games/megaways";

/**
 * Home-page card for the Megaways slot. A mini six-reel motif with uneven
 * reel heights gives the "ways" idea at a glance, using the same procedural
 * symbol art the game renders.
 */

const MINI_REELS: number[][] = [
  [SYM.H4, SYM.L1],
  [SYM.L3, SYM.WILD, SYM.L5],
  [SYM.H3, SYM.L2, SYM.L4, SYM.L6],
  [SYM.L5, SYM.H2, SYM.SCATTER],
  [SYM.L1, SYM.H1, SYM.L3, SYM.L2],
  [SYM.H4, SYM.L6],
];

function MiniReels({ accent }: { accent: string }) {
  return (
    <div
      className="relative flex aspect-square w-full items-end justify-center gap-1 overflow-hidden rounded-sm border border-border-low bg-gradient-to-b from-card to-black p-3"
      style={{ filter: `drop-shadow(0 0 30px ${accent}55)` }}
    >
      {MINI_REELS.map((reel, r) => (
        <div
          key={r}
          className="flex h-full flex-1 flex-col justify-center gap-1 rounded-sm bg-black/40"
        >
          {reel.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={symbolDataUrl(s)}
              alt=""
              className="w-full"
              style={{ height: `${100 / reel.length}%`, objectFit: "contain" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MegawaysCard() {
  const accent = "#FFD700";
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-col items-center gap-8 rounded-2xl border border-border-low bg-card p-6 sm:p-10 lg:flex-row lg:gap-12">
        <div className="w-48 shrink-0 sm:w-56">
          <MiniReels accent={accent} />
        </div>
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <p className="font-display text-xs font-light uppercase tracking-[0.4em] text-muted">
            New · Megaways slot
          </p>
          <h2
            className="font-display mt-2 text-4xl font-bold uppercase tracking-wide sm:text-5xl"
            style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
          >
            Gem Rush
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Six reels that change height every spin — up to 117,649 ways to win.
            Winning gems shatter and new ones tumble in, and the free-spins
            multiplier never resets.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/megaways"
              className="font-contrail rounded-sm bg-gold px-8 py-3 text-sm uppercase tracking-wide text-gold-foreground shadow-[0_0_24px_rgba(255,215,0,0.4)] transition hover:brightness-110 hover:shadow-[0_0_36px_rgba(255,215,0,0.6)]"
            >
              Play demo
            </Link>
            <span className="font-display text-xs uppercase tracking-[0.25em] text-muted">
              Cascades · Free spins · 10,000× max
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
