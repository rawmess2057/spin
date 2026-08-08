"use client";

import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border-low bg-[#141414]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div>
            <p className="font-display text-2xl font-bold tracking-[0.15em] text-gold [text-shadow:0_0_20px_rgba(255,192,87,0.4)]">
              SPIN
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A provably fair Solana casino. Every outcome is settled on-chain
              by ORAO VRF randomness — verify any spin yourself.
            </p>
          </div>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em]">
              Spin support center
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li>
                <Link href="/slots" className="transition hover:text-gold">
                  Slots
                </Link>
              </li>
              <li>
                <Link href="/dice" className="transition hover:text-gold">
                  Dice
                </Link>
              </li>
              <li>
                <a
                  href="https://opencode.ai"
                  className="transition hover:text-gold"
                >
                  Docs
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em]">
              Subscribe to our newsletter
            </h3>
            <form
              className="mt-4 flex"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                required
                placeholder="Your email address"
                className="w-full rounded-sm border border-border-low bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold"
              />
              <button
                type="submit"
                className="font-contrail ml-2 shrink-0 rounded-sm bg-gold px-5 py-2.5 text-sm uppercase tracking-wide text-gold-foreground transition hover:brightness-110"
              >
                Join
              </button>
            </form>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Made to play safely. All gameplay is virtual and for
              entertainment purposes only. Play responsibly — 21+ where
              applicable.
            </p>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border-low pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} SPIN. All rights reserved.</p>
          <p className="font-display uppercase tracking-[0.3em]">
            Made to play safely
          </p>
        </div>
      </div>
    </footer>
  );
}
