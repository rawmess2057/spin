import Link from "next/link";

type Promo = {
  name: string;
  headline: string;
  body: string;
  accent: string;
  href: string;
  glyph: string;
  flip?: boolean;
};

const PROMOS: Promo[] = [
  {
    name: "SPIN'S ULTIMATE QUEST",
    headline: "Play spin with 20% bonus on all spin reload",
    body: "Your quest wouldn't be complete without exploring the games on Spin!",
    accent: "#FFC057",
    href: "/slots",
    glyph: "🎰",
  },
  {
    name: "SPIN LOOT",
    headline: "Loot offers 200% bonus!",
    body: "We want you to experience the best loot game experience with our unbeatable bonus offer!",
    accent: "#6668FF",
    href: "/dice",
    glyph: "💎",
    flip: true,
  },
  {
    name: "SPIN JACKPOT",
    headline: "Play spin with 50% cashback",
    body: "We provide a fantastic experience to all our players with unlimited bonus in our happy hour!",
    accent: "#F00001",
    href: "/slots",
    glyph: "💰",
  },
];

function PhoneMockup({ glyph, accent }: { glyph: string; accent: string }) {
  return (
    <div
      className="relative mx-auto w-64 rounded-[2.2rem] border-4 border-foreground/15 bg-black p-2 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      style={{ filter: `drop-shadow(0 0 34px ${accent}44)` }}
    >
      <div className="absolute left-1/2 top-1 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-foreground/15" />
      <div className="flex aspect-[9/16] flex-col items-center justify-center gap-4 overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-card to-black">
        <span className="text-7xl" style={{ filter: "saturate(1.1)" }}>
          {glyph}
        </span>
        <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-muted">
          Play on Spin
        </span>
      </div>
    </div>
  );
}

export function PromoBlocks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="font-display text-center text-2xl font-bold uppercase tracking-[0.2em] text-foreground">
        Official promo pages
      </h2>
      <div className="mt-10 space-y-16">
        {PROMOS.map((promo) => (
          <div
            key={promo.name}
            className={`flex flex-col items-center gap-10 lg:flex-row ${
              promo.flip ? "lg:flex-row-reverse" : ""
            }`}
          >
            <div className="flex flex-1 justify-center lg:justify-end">
              <PhoneMockup glyph={promo.glyph} accent={promo.accent} />
            </div>
            <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
              <h3
                className="font-display text-3xl font-bold uppercase tracking-wide"
                style={{
                  color: promo.accent,
                  textShadow: `0 0 26px ${promo.accent}66`,
                }}
              >
                {promo.name}
              </h3>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {promo.headline}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                {promo.body}
              </p>
              <Link
                href={promo.href}
                className="font-contrail mt-7 rounded-sm border-2 px-8 py-3 text-sm uppercase tracking-wide text-foreground transition hover:bg-foreground hover:text-background"
                style={{ borderColor: promo.accent }}
              >
                Go play now
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
