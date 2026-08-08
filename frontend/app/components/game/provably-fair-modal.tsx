"use client";

import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/hooks/use-app-client";
import { useCluster } from "../../lib/hooks/use-cluster";
import { useRecentSpins } from "../../lib/hooks/use-recent-spins";
import { SPIN_PROGRAM_ADDRESS } from "../../lib/solana/client";
import { VRF_PROGRAM_ADDRESS } from "../../lib/solana/vrf";
import { ellipsify } from "../../lib/solana/explorer";
import { Modal } from "../ui/modal";

function AddressRow({ label, addr }: { label: string; addr: string }) {
  const { getExplorerUrl } = useCluster();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-low bg-cream/40 px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <a
        href={getExplorerUrl(`/address/${addr}`)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs underline underline-offset-2"
      >
        {ellipsify(addr, 5)}
      </a>
    </div>
  );
}

export function ProvablyFairModal({
  open,
  onClose,
  rtpLabel,
  houseEdgeLabel,
  weights,
}: {
  open: boolean;
  onClose: () => void;
  rtpLabel: string;
  houseEdgeLabel: string;
  weights: unknown;
}) {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { getExplorerUrl } = useCluster();
  const { spins, isLoading } = useRecentSpins(
    connected ? address(connected.account.address) : null
  );

  const downloadWeights = () => {
    const blob = new Blob([JSON.stringify(weights, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spin-paytable.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="Provably Fair">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <div className="rounded-lg border border-border-low bg-cream/40 px-3 py-2">
            <p className="text-muted">RTP</p>
            <p className="mt-0.5 text-sm font-semibold">{rtpLabel}</p>
          </div>
          <div className="rounded-lg border border-border-low bg-cream/40 px-3 py-2">
            <p className="text-muted">House edge</p>
            <p className="mt-0.5 text-sm font-semibold">{houseEdgeLabel}</p>
          </div>
        </div>

        <div className="space-y-2">
          <AddressRow label="Program" addr={SPIN_PROGRAM_ADDRESS} />
          <AddressRow label="VRF oracle" addr={VRF_PROGRAM_ADDRESS} />
        </div>

        <button
          onClick={downloadWeights}
          className="w-full cursor-pointer rounded-lg border border-border-low px-3 py-2 text-xs font-medium transition hover:bg-cream"
        >
          Download paytable JSON
        </button>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">
            Your recent spins
          </p>
          {!connected ? (
            <p className="text-xs text-muted">
              Connect a wallet to see your spin history.
            </p>
          ) : isLoading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : spins.length === 0 ? (
            <p className="text-xs text-muted">No spins yet.</p>
          ) : (
            <ul className="space-y-1">
              {spins.map((s) => (
                <li key={s.signature}>
                  <a
                    href={getExplorerUrl(`/tx/${s.signature}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border-low bg-cream/40 px-3 py-1.5 text-xs transition hover:bg-cream"
                  >
                    <span className="font-mono">
                      {ellipsify(s.signature, 6)}
                    </span>
                    <span
                      className={s.err ? "text-destructive" : "text-primary"}
                    >
                      {s.err ? "failed" : "ok"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Every outcome is derived from ORAO VRF randomness requested on-chain
          in your <code className="font-mono">place_bet</code> transaction and
          settled by the program&apos;s{" "}
          <code className="font-mono">resolve_spin</code> callback — click any
          transaction above to inspect the full mapping from randomness to
          outcome on Solana Explorer. Bets signed by your session key are
          settled by exactly the same callback.
        </p>
      </div>
    </Modal>
  );
}
