"use client";

import { useSyncExternalStore } from "react";
import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/hooks/use-app-client";
import { useVault } from "../../lib/hooks/use-vault";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { useBuyChips } from "./buy-chips-context";

/**
 * The player's chip balance, tappable to open the Buy chips modal. Renders
 * nothing while disconnected: the wallet button owns that state.
 */
export function BalancePill({ compact = false }: { compact?: boolean }) {
  const client = useAppClient();
  const connectedRaw = useConnectedWallet(client);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const connected = mounted ? connectedRaw : null;
  const player = connected ? address(connected.account.address) : undefined;
  const vault = useVault(player);
  const { open } = useBuyChips();

  if (!player) return null;
  const balance = vault.data?.balance ?? 0n;
  const empty = vault.data == null || balance === 0n;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => open("buy")}
        className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gold transition"
        aria-label="Chips — buy, session, cash out"
      >
        <span className="text-lg leading-none">💎</span>
        {empty ? "Buy chips" : diamondString(lamportsToDiamonds(balance))}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open("buy")}
      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
        empty
          ? "border-gold/60 bg-gold/15 text-gold hover:bg-gold/25"
          : "border-border-low bg-card text-foreground hover:bg-cream"
      }`}
      aria-label="Chips — buy, session, cash out"
    >
      <span>💎</span>
      <span className="font-mono tabular-nums">
        {empty ? "Buy chips" : diamondString(lamportsToDiamonds(balance))}
      </span>
    </button>
  );
}
