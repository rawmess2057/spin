import Link from "next/link";
import { Badge } from "../ui/badge";

export type GameCardData = {
  slug: string;
  href: string;
  name: string;
  tagline: string;
  glyph: string;
  badge?: { label: string; tone: "primary" | "orange" | "gold" };
  rtp: string;
  maxMultiplier: string;
};

export function GameCard({ game }: { game: GameCardData }) {
  return (
    <Link
      href={game.href}
      className="group relative block overflow-hidden rounded-2xl border border-border-low bg-card p-6 transition hover:border-primary/50 hover:shadow-[0_0_30px_rgba(0,255,163,0.15)]"
    >
      {game.badge && (
        <Badge tone={game.badge.tone} className="absolute right-4 top-4">
          {game.badge.label}
        </Badge>
      )}
      <div className="text-5xl transition-transform duration-300 group-hover:scale-110">
        {game.glyph}
      </div>
      <h3 className="font-display mt-4 text-base font-bold tracking-wide">
        {game.name}
      </h3>
      <p className="mt-1 text-xs text-muted">{game.tagline}</p>
      <div className="mt-4 flex items-center gap-4 border-t border-border-low pt-3 font-mono text-[11px] text-muted">
        <span>
          RTP <span className="text-foreground">{game.rtp}</span>
        </span>
        <span>
          Max <span className="text-foreground">{game.maxMultiplier}</span>
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 justify-center pb-4 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        <span className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-[0_0_16px_rgba(0,255,163,0.5)]">
          PLAY NOW
        </span>
      </div>
    </Link>
  );
}
