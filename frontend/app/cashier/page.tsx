"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCashier } from "../lib/hooks/use-cashier";
import { useVaultActivity } from "../lib/hooks/use-vault-activity";
import { BalanceCard } from "../components/cashier/balance-card";
import { BuyPanel } from "../components/cashier/buy-panel";
import { CashOutPanel } from "../components/cashier/cash-out-panel";
import { SessionPanel } from "../components/cashier/session-panel";
import { PendingBetCard } from "../components/cashier/pending-bet-card";
import { ActivityList } from "../components/cashier/activity-list";
import { WalletButton } from "../components/wallet/wallet-button";

type Tab = "buy" | "cash" | "session";
const TABS: { id: Tab; label: string }[] = [
  { id: "buy", label: "Buy chips" },
  { id: "cash", label: "Cash out" },
  { id: "session", label: "Session" },
];

function isTab(v: string | null): v is Tab {
  return v === "buy" || v === "cash" || v === "session";
}

function CashierInner() {
  const params = useSearchParams();
  const requested = params.get("tab");
  const cashier = useCashier();
  // The URL picks the tab; a click overrides it until the URL changes again
  // (derived-state reset during render, no effect needed).
  const [override, setOverride] = useState<Tab | null>(null);
  const [seen, setSeen] = useState(requested);
  if (requested !== seen) {
    setSeen(requested);
    setOverride(null);
  }
  const setTab = (t: Tab) => setOverride(t);
  // Default: buying when there's nothing to cash out, cashing out otherwise.
  const active: Tab =
    override ??
    (isTab(requested)
      ? requested
      : cashier.hasVault && cashier.balance > 0n
        ? "cash"
        : "buy");

  const activity = useVaultActivity(cashier.player, cashier.vault.data);

  if (!cashier.hydrated) return null;

  if (!cashier.player) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border-low bg-card/70 p-8 text-center">
        <p className="font-display text-2xl font-bold uppercase tracking-[0.2em] text-gold">
          Cashier
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Chips (💎) are SOL in your own on-chain vault, 1 💎 = 0.0001 SOL. Buy
          them here, play any game without wallet prompts, and cash out back to
          your wallet whenever you like. Until you connect, every game runs in
          demo mode with practice chips.
        </p>
        <div className="mt-6 flex justify-center">
          <WalletButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <BalanceCard cashier={cashier} />
        <div className="rounded-2xl border border-border-low bg-card/70 p-4 sm:p-5">
          <div className="mb-4 flex overflow-hidden rounded-lg border border-border-low">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 cursor-pointer px-3 py-2 text-xs font-bold transition ${
                  active === t.id
                    ? "bg-gold/20 text-gold"
                    : "text-muted hover:bg-cream/50 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {active === "buy" && <BuyPanel cashier={cashier} />}
          {active === "cash" && <CashOutPanel cashier={cashier} />}
          {active === "session" && <SessionPanel cashier={cashier} />}
        </div>
      </section>
      <aside className="flex w-full flex-col gap-4 lg:w-[380px] lg:shrink-0">
        <PendingBetCard cashier={cashier} />
        <ActivityList rows={activity.rows} isLoading={activity.isLoading} />
      </aside>
    </div>
  );
}

export default function CashierPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-gold [text-shadow:0_0_18px_rgba(255,192,87,0.45)]">
          Cashier
        </h1>
        <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted sm:inline">
          Buy chips · Cash out · Session
        </span>
      </header>
      <Suspense fallback={null}>
        <CashierInner />
      </Suspense>
    </main>
  );
}
