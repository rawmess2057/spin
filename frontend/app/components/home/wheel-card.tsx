import Link from "next/link";
import { WHEEL_RISK, WHEEL_TABLES } from "../../lib/solana/games/wheel";

/** Home-page card for the Spin Wheel: a CSS conic wheel from the High table. */
export function WheelCard() {
  const accent = "#ff4d5e";
  const table = WHEEL_TABLES[WHEEL_RISK.HIGH];
  const step = 100 / table.length;
  const stops = table
    .map((m, i) => {
      const c = m === 0 ? "#171a2b" : m >= 500 ? accent : "#ffc057";
      return `${c} ${i * step}% ${(i + 1) * step}%`;
    })
    .join(", ");
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-col items-center gap-8 rounded-2xl border border-border-low bg-card p-6 sm:p-10 lg:flex-row-reverse lg:gap-12">
        <div className="w-48 shrink-0 sm:w-56">
          <div
            className="relative aspect-square w-full rounded-full border-4 border-[#2b2f45]"
            style={{
              background: `conic-gradient(${stops})`,
              filter: `drop-shadow(0 0 30px ${accent}55)`,
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-gold bg-black" />
            <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 -translate-y-1 border-x-[10px] border-t-[18px] border-x-transparent border-t-white" />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <p className="font-display text-xs font-light uppercase tracking-[0.4em] text-muted">
            Quick play · Spin wheel
          </p>
          <h2
            className="font-display mt-2 text-4xl font-bold uppercase tracking-wide sm:text-5xl"
            style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
          >
            Spin Wheel
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Twenty-four segments, three risk levels. Low pays often, High saves
            it up for a 20× segment. One spin, one reveal, settled on-chain.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/wheel"
              className="font-contrail rounded-sm bg-gold px-8 py-3 text-sm uppercase tracking-wide text-gold-foreground shadow-[0_0_24px_rgba(255,215,0,0.4)] transition hover:brightness-110 hover:shadow-[0_0_36px_rgba(255,215,0,0.6)]"
            >
              Spin now
            </Link>
            <span className="font-display text-xs uppercase tracking-[0.25em] text-muted">
              97% RTP · up to 20.28×
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
