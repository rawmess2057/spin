const OFFERS = [
  {
    kicker: "1st Deposit Offer",
    title: "200% welcome bonus",
    detail: "Up to $500 credits",
    accent: "#FFC057",
  },
  {
    kicker: "Keep the excitement alive with",
    title: "50% reload bonus",
    detail: "on every reload",
    accent: "#6668FF",
  },
  {
    kicker: "Play together and enjoy",
    title: "$5 referral bonus",
    detail: "for every $20 deposit",
    accent: "#F00001",
  },
];

export function BonusOffers() {
  return (
    <section className="relative border-y border-border-low bg-cream">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px px-6 py-12 sm:grid-cols-3">
        {OFFERS.map((offer) => (
          <div
            key={offer.title}
            className="flex flex-col items-center gap-2 px-6 py-8 text-center"
          >
            <p className="text-sm italic text-muted">{offer.kicker}</p>
            <p
              className="font-display text-3xl font-bold uppercase tracking-wide"
              style={{
                color: offer.accent,
                textShadow: `0 0 24px ${offer.accent}55`,
              }}
            >
              {offer.title}
            </p>
            <p className="font-display text-sm font-light uppercase tracking-[0.2em] text-muted">
              {offer.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
