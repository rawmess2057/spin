const FEATURES = [
  {
    icon: "🏦",
    title: "Deposits",
    body: "Experience a smooth and secure deposit process.",
  },
  {
    icon: "💸",
    title: "Withdrawals",
    body: "Our withdrawal service is designed to ensure a seamless and effortless process.",
  },
  {
    icon: "🎧",
    title: "Support",
    body: "Our customer support team is available 24/7 to help you every step of the way.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold uppercase tracking-[0.15em] text-gold">
          Pioneering play
        </h2>
        <p className="mt-3 text-lg font-semibold text-foreground">
          Join 3 million players for rewarding fun
        </p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex flex-col items-center gap-4 rounded-sm border border-border-low bg-card px-6 py-10 text-center transition hover:border-gold/40 hover:shadow-[0_0_30px_rgba(255,192,87,0.12)]"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border-low bg-cream">
              <span className="text-4xl">{feature.icon}</span>
            </div>
            <h3 className="font-display text-xl font-bold uppercase tracking-wide">
              {feature.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
