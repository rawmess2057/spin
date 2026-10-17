"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BalancePill } from "../vault/balance-pill";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/plinko", label: "Plinko", icon: "📌" },
  { href: "/megaways", label: "Megaways", icon: "🎰" },
  { href: "/wheel", label: "Wheel", icon: "🎡" },
  { href: "/hold-spin", label: "Vault", icon: "🪙" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border-low bg-background/95 backdrop-blur-md sm:hidden">
      <div className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold tracking-wide uppercase transition ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
        <div className="flex flex-1 items-stretch justify-center text-muted">
          <BalancePill compact />
        </div>
      </div>
    </nav>
  );
}
