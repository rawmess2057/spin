"use client";

import {
  address,
  formatDecimalFixedPoint,
  lamportsToSol,
  type Lamports,
} from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/client-provider";
import {
  useHouse,
  useNetworkState,
  usePlayerSession,
} from "../../lib/hooks/use-spin";
import { GAME_SLOTS } from "../../lib/spin/config";
import { useGameConfig } from "../../lib/hooks/use-spin";

const solFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function solString(lamports: bigint): string {
  return formatDecimalFixedPoint(
    solFormatter,
    lamportsToSol(lamports as Lamports)
  );
}

export function StatsPanel() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const house = useHouse();
  const networkState = useNetworkState();
  const config = useGameConfig(GAME_SLOTS);
  const session = usePlayerSession(
    connected ? address(connected.account.address) : null
  );

  const stats: { label: string; value: string | null; unit: string }[] = [
    {
      label: "Wagered",
      value: session.isLoading
        ? null
        : session.data
          ? solString(session.data.wagered)
          : "—",
      unit: "SOL",
    },
    {
      label: "Won",
      value: session.isLoading
        ? null
        : session.data
          ? solString(session.data.won)
          : "—",
      unit: "SOL",
    },
    {
      label: "Bets",
      value: session.isLoading
        ? null
        : session.data
          ? session.data.bets.toString()
          : "—",
      unit: "",
    },
  ];

  const houseStats: { label: string; value: string | null; unit: string }[] = [
    {
      label: "Treasury",
      value: house.isLoading
        ? null
        : house.lamports != null
          ? solString(house.lamports)
          : "—",
      unit: "SOL",
    },
    {
      label: "Max bet",
      value: config.isLoading
        ? null
        : config.data
          ? solString(config.data.maxBet)
          : "—",
      unit: "SOL",
    },
    {
      label: "VRF fee",
      value: networkState.isLoading
        ? null
        : networkState.data
          ? solString(networkState.data.requestFee)
          : "—",
      unit: "SOL",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-border-low bg-card p-6">
        <h3 className="text-sm font-semibold">Your stats</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border-low bg-cream/50 px-2 py-3"
            >
              <p className="text-xs text-muted">{s.label}</p>
              <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums">
                {s.value ?? (
                  <span className="inline-block animate-pulse">…</span>
                )}
                {s.value != null && (
                  <span className="text-xs font-normal text-muted">
                    {" "}
                    {s.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {connected
            ? "Stats are recorded on-chain in your player session."
            : "Connect a wallet to see your session stats."}
        </p>
      </div>

      <div className="rounded-2xl border border-border-low bg-card p-6">
        <h3 className="text-sm font-semibold">House</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {houseStats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border-low bg-cream/50 px-2 py-3"
            >
              <p className="text-xs text-muted">{s.label}</p>
              <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums">
                {s.value ?? (
                  <span className="inline-block animate-pulse">…</span>
                )}
                {s.value != null && (
                  <span className="text-xs font-normal text-muted">
                    {" "}
                    {s.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Provably fair: outcomes come from ORAO VRF randomness, verifiable
          on-chain.
        </p>
      </div>
    </section>
  );
}
