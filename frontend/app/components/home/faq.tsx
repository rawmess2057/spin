"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "How do I start playing without registering?",
    a: "Connect your Solana wallet (Phantom, Solflare, or any wallet-standard wallet) and buy diamonds with SOL. No account, no email. One wallet approval covers the whole session.",
  },
  {
    q: "What are diamonds?",
    a: "Chips. 1 diamond is 0.0001 SOL, so a 0.1 SOL buy-in gives you 1,000 diamonds. Your balance lives in a vault account on Solana that only you can withdraw from — cash out to your wallet at any time.",
  },
  {
    q: "Why doesn't my wallet pop up on every spin?",
    a: "When you buy in, you also authorize a session key held in your browser to place bets for you. It is bounded on-chain by an expiry (about a day) and a spend limit equal to your buy-in, and it can never withdraw — cashing out always requires your wallet. You can revoke it at any time.",
  },
  {
    q: "Are the games provably fair?",
    a: "Yes. Every spin and roll is settled on-chain from the house's commitment chain — each outcome derives from a revealed seed hashed by the program, so it's fully reproducible client-side. Bets signed by your session key go through the exact same settle path. Verify any outcome yourself in the Provably Fair panel on each game screen.",
  },
  {
    q: "I need help — how do I reach support?",
    a: "Our support team is available 24/7. Reach out through the Support Center in the footer and we'll get back to you promptly.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h2 className="font-display text-center text-3xl font-bold uppercase tracking-[0.2em]">
        FAQ — frequently asked questions
      </h2>
      <div className="mt-10 divide-y divide-border-low rounded-sm border border-border-low bg-card">
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={faq.q}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                  {faq.q}
                </span>
                <span
                  className={`font-contrail text-gold transition-transform duration-200 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              {isOpen && (
                <p className="px-6 pb-5 text-sm leading-relaxed text-muted">
                  {faq.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
