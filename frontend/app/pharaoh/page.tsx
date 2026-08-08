import { PharaohScreen } from "../components/game/pharaoh/pharaoh-screen";

export default function PharaohPage() {
  return (
    <main className="vegas mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.2em] text-gold [text-shadow:0_0_24px_rgba(255,192,87,0.45)]">
          Pharaoh&apos;s Fortune
        </h1>
        <span className="rounded-sm border border-gold/40 bg-gold/10 px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">
          Expanding Wild
        </span>
      </div>
      <PharaohScreen />
    </main>
  );
}
