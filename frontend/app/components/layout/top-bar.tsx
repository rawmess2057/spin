"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClusterSelect } from "../wallet/cluster-select";
import { WalletButton } from "../wallet/wallet-button";
import { SoundToggle } from "../sound-toggle";
import { BalancePill } from "../vault/balance-pill";
import { GAMES } from "../../lib/games/registry";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  ...GAMES.map((g) => ({ href: g.href, label: g.label })),
  { href: "/cashier", label: "Cashier" },
];

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border-low bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-[0.15em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.5)]"
          >
            SPIN
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-sm px-3 py-1.5 text-xs font-semibold tracking-widest uppercase transition ${
                    active
                      ? "bg-gold/10 text-gold"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <SoundToggle />
          <ClusterSelect />
          <BalancePill />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
