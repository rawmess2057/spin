import Link from "next/link";

/**
 * Home-page game card linking into the Plinko game. Matches the site's visual
 * language (gold glow, font-display headings, rounded-sm border card) while
 * giving the board a playful foretaste via a mini peg-grid motif.
 */

const PEG_ROW_COUNTS = [1, 2, 3, 4];

function MiniBoard({ accent }: { accent: string }) {
  return (
    <div
      className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm border border-border-low bg-gradient-to-b from-card to-black"
      style={{ filter: `drop-shadow(0 0 30px ${accent}55)` }}
    >
      <div className="relative">
        <svg width="150" height="150" viewBox="0 0 150 150">
          {/* mini peg grid */}
          {PEG_ROW_COUNTS.map((count, row) => {
            const y = 16 + row * 26;
            const offsetX = ((count - 1) * 22) / 2;
            return (
              <g key={row}>
                {Array.from({ length: count }, (_, col) => {
                  const x = 75 - offsetX + col * 22;
                  return (
                    <circle key={col} cx={x} cy={y} r="3.5" fill="#5a5a6e" />
                  );
                })}
              </g>
            );
          })}
          {/* a ball mid-drop */}
          <circle cx="64" cy="58" r="6" fill="#FFD84A" />
          <circle cx="86" cy="120" r="6" fill="#FFD84A" fillOpacity="0.4" />
          {/* collector band */}
          <rect
            x="20"
            y="136"
            width="110"
            height="8"
            rx="2"
            fill={accent}
            opacity="0.55"
          />
        </svg>
      </div>
    </div>
  );
}

export function PlinkoCard() {
  const accent = "#FFC057";
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-col items-center gap-8 rounded-2xl border border-border-low bg-card p-6 sm:p-10 lg:flex-row lg:gap-12">
        <div className="w-48 shrink-0 sm:w-56">
          <MiniBoard accent={accent} />
        </div>
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <p className="font-display text-xs font-light uppercase tracking-[0.4em] text-muted">
            Our flagship game
          </p>
          <h2
            className="font-display mt-2 text-4xl font-bold uppercase tracking-wide sm:text-5xl"
            style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
          >
            Plinko
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Drop a ball and watch it bounce down a peg board into a multiplier.
            Pick your risk and row count — every outcome is settled on-chain and
            provably fair.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/plinko"
              className="font-contrail rounded-sm bg-gold px-8 py-3 text-sm uppercase tracking-wide text-gold-foreground shadow-[0_0_24px_rgba(255,192,87,0.4)] transition hover:brightness-110 hover:shadow-[0_0_36px_rgba(255,192,87,0.6)]"
            >
              Drop a ball
            </Link>
            <span className="font-display text-xs uppercase tracking-[0.25em] text-muted">
              9 layouts · 3 risks
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
