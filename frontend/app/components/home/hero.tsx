import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #181818 0%, #181818 55%, #222222 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 20% 0%, rgba(240,0,1,0.28) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 80% 10%, rgba(102,104,255,0.22) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, transparent 0 38px, rgba(255,255,255,0.025) 38px 40px)",
        }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <p className="font-display text-xs font-light uppercase tracking-[0.4em] text-muted sm:text-sm">
          Experience unmatched quality in gameplay and customer service
        </p>
        <h1 className="font-display mt-6 text-5xl font-bold uppercase leading-[0.95] tracking-wide text-foreground [text-shadow:0_0_40px_rgba(255,192,87,0.35)] sm:text-7xl lg:text-8xl">
          Be a big winner with
          <span className="block text-gold">our hot jackpot</span>
        </h1>
        <Link
          href="/plinko"
          className="font-contrail mt-10 rounded-sm bg-gold px-12 py-4 text-lg uppercase tracking-wide text-gold-foreground shadow-[0_0_30px_rgba(255,192,87,0.45)] transition hover:brightness-110 hover:shadow-[0_0_44px_rgba(255,192,87,0.65)]"
        >
          Play now
        </Link>
        <p className="font-display mt-8 text-sm font-light uppercase tracking-[0.3em] text-muted">
          @ Spin
        </p>
      </div>
    </section>
  );
}
