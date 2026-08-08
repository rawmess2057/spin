import Link from "next/link";
import { GAMES } from "../../lib/games";

const SOON_TILES = [
  { glyph: "🐟", name: "Fish Hunter", tone: "from-[#0e7490] to-[#181818]" },
  { glyph: "🃏", name: "Blackjack", tone: "from-[#7c3aed] to-[#181818]" },
  { glyph: "🎰", name: "Classic Reels", tone: "from-[#be123c] to-[#181818]" },
];

export function GamesShowcase() {
  return (
    <section className="relative overflow-hidden border-y border-border-low bg-cream">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(255,192,87,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-4xl font-bold uppercase tracking-wide">
            Games
          </h2>
          <Link
            href="/slots"
            className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold transition hover:brightness-110"
          >
            See all games →
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {GAMES.map((game) => (
            <Link
              key={game.slug}
              href={game.href}
              className="group relative block overflow-hidden rounded-sm border border-border-low bg-card transition hover:-translate-y-1 hover:border-gold/50 hover:shadow-[0_0_30px_rgba(255,192,87,0.2)]"
            >
              <div className="flex aspect-square items-center justify-center bg-gradient-to-b from-card to-black">
                <span className="text-6xl transition-transform duration-300 group-hover:scale-110">
                  {game.glyph}
                </span>
              </div>
              <div className="p-3">
                <p className="font-display truncate text-sm font-semibold uppercase tracking-wide">
                  {game.name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  {game.rtp} RTP
                </p>
              </div>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gold py-1.5 text-center font-contrail text-xs uppercase tracking-wide text-gold-foreground opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                Play now
              </span>
            </Link>
          ))}
          {SOON_TILES.map((tile) => (
            <div
              key={tile.name}
              className="group relative block cursor-not-allowed overflow-hidden rounded-sm border border-border-low bg-card transition hover:border-foreground/25"
            >
              <div
                className={`flex aspect-square items-center justify-center bg-gradient-to-b ${tile.tone}`}
              >
                <span className="text-6xl opacity-40 grayscale transition duration-300 group-hover:opacity-60">
                  {tile.glyph}
                </span>
              </div>
              <div className="p-3">
                <p className="font-display truncate text-sm font-semibold uppercase tracking-wide text-muted">
                  {tile.name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  Coming soon
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
