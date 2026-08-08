"use client";

import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/hooks/use-app-client";
import { useHouse } from "../../lib/hooks/use-house";
import { useNetworkState } from "../../lib/hooks/use-network-state";
import { usePlayerSession } from "../../lib/hooks/use-player-session";
import { solString } from "../../lib/solana/format";
import { Card } from "../ui/card";

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-border-low bg-cream/50 px-2 py-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums">
        {value ?? <span className="inline-block animate-pulse">…</span>}
      </p>
    </div>
  );
}

export function StatsPanel() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const house = useHouse();
  const networkState = useNetworkState();
  const session = usePlayerSession(
    connected ? address(connected.account.address) : null
  );

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Card className="p-6">
        <h3 className="text-sm font-semibold">Your stats</h3>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label="Wagered"
            value={
              connected && session.data
                ? `${solString(session.data.wagered)} SOL`
                : connected
                  ? null
                  : "—"
            }
          />
          <Stat
            label="Won"
            value={
              connected && session.data
                ? `${solString(session.data.won)} SOL`
                : connected
                  ? null
                  : "—"
            }
          />
          <Stat
            label="Bets"
            value={
              connected && session.data
                ? session.data.bets.toString()
                : connected
                  ? null
                  : "—"
            }
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          {connected
            ? "Stats are recorded on-chain in your player session, shared across every game."
            : "Connect a wallet to see your session stats."}
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold">House</h3>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label="Treasury"
            value={
              house.lamports != null ? `${solString(house.lamports)} SOL` : null
            }
          />
          <Stat
            label="Status"
            value={house.data ? (house.data.paused ? "Paused" : "Live") : null}
          />
          <Stat
            label="VRF fee"
            value={
              networkState.data
                ? `${solString(networkState.data.requestFee)} SOL`
                : null
            }
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Provably fair: outcomes come from ORAO VRF randomness, verifiable
          on-chain.
        </p>
      </Card>
    </section>
  );
}
