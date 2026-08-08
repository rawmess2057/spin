import { MinesScreen } from "../components/game/mines/mines-screen";

export default function MinesPage() {
  return (
    <main className="vegas mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.2em] text-gold [text-shadow:0_0_24px_rgba(255,192,87,0.45)]">
          Dynamite Mines
        </h1>
        <span className="rounded-sm border border-red-700/50 bg-red-950/40 px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
          Cascades
        </span>
      </div>
      <MinesScreen />
    </main>
  );
}
