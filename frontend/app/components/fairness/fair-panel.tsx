"use client";

import { useState } from "react";
import type { BetState, ChainState } from "../../lib/solana/client";
import { BetStatus } from "../../lib/solana/client";
import {
  bytesToHex,
  deriveRandomness,
  verifyChainLink,
} from "../../lib/solana/fairness";
import { diamondString, lamportsToDiamonds } from "../../lib/diamonds";
import { useCluster } from "../../lib/hooks/use-cluster";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  chain: ChainState | null;
  bet: BetState | null;
  /** The client seed of the last bet this session placed, if we still have it. */
  clientSeed?: Uint8Array | null;
  /** The game's evaluator; returns the payout the program should have paid. */
  evaluatePayout: (
    randomness: Uint8Array,
    bet: bigint,
    target: bigint
  ) => bigint;
  demo?: boolean;
};

function Hex({ value }: { value: ArrayLike<number> | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>;
  const hex = bytesToHex(value);
  return (
    <span className="break-all font-mono text-[10px] text-foreground">
      {hex}
    </span>
  );
}

/**
 * Shows the player exactly what decided their last bet and lets them check it
 * in the browser: the chain commitment they bet against, the reveal the house
 * published, the hash-chain link between the two, and a replay of the game
 * evaluator against the derived randomness.
 */
export function FairPanel({
  open,
  onClose,
  chain,
  bet,
  clientSeed,
  evaluatePayout,
  demo,
}: Props) {
  const { getExplorerUrl } = useCluster();
  const [result, setResult] = useState<string | null>(null);

  const settled = bet != null && bet.status === BetStatus.Settled;
  const steps = settled ? Number(bet.revealIndex - bet.indexAtPlace) : 0;

  const recompute = () => {
    if (!settled || !bet) return;
    const linked = verifyChainLink(bet.reveal, bet.commitment, steps);
    const randomness = deriveRandomness(
      bet.reveal,
      bet.clientSeed,
      bet.player,
      bet.nonce
    );
    let payout: bigint | null = null;
    try {
      payout = evaluatePayout(randomness, bet.amount, bet.target);
    } catch {
      payout = null;
    }
    const matches = payout != null && payout === bet.payout;
    setResult(
      `${linked ? "✓" : "✗"} reveal hashes ${steps}× to the commitment · ${
        matches ? "✓" : "✗"
      } replayed payout ${
        payout == null ? "—" : diamondString(lamportsToDiamonds(payout))
      } 💎 vs on-chain ${diamondString(lamportsToDiamonds(bet.payout))} 💎`
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Provably fair">
      <div className="space-y-4 text-xs">
        <p className="leading-relaxed text-muted">
          Before you bet, the house has already committed to a chain of secret
          values by publishing its hash. Your bet records that commitment plus a
          random seed from your browser. To settle, the house reveals the next
          value — it must hash to the commitment — and the result is derived
          from{" "}
          <span className="font-mono">
            sha256(reveal ‖ your seed ‖ you ‖ nonce)
          </span>
          . Neither side can pick the outcome.
        </p>

        {demo ? (
          <p className="rounded-lg border border-border-low bg-cream/30 p-3 text-muted">
            Demo mode uses your browser&apos;s random numbers; connect a wallet
            and buy chips to play against the house chain.
          </p>
        ) : (
          <>
            <section className="rounded-lg border border-border-low bg-cream/30 p-3">
              <h3 className="mb-2 font-semibold uppercase tracking-widest text-muted">
                House chain
              </h3>
              {chain == null ? (
                <p className="text-muted">Not available on this cluster.</p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted">Epoch</dt>
                  <dd className="font-mono">{chain.epoch.toString()}</dd>
                  <dt className="text-muted">Reveals used</dt>
                  <dd className="font-mono">
                    {chain.index.toString()} / {chain.length.toString()}
                  </dd>
                  <dt className="text-muted">Open bets</dt>
                  <dd className="font-mono">
                    {(chain.nextSeq - chain.cursor).toString()}
                  </dd>
                  <dt className="text-muted">House stalls</dt>
                  <dd className="font-mono">{chain.stalls.toString()}</dd>
                  <dt className="text-muted">Current commitment</dt>
                  <dd>
                    <Hex value={chain.commitment} />
                  </dd>
                </dl>
              )}
            </section>

            <section className="rounded-lg border border-border-low bg-cream/30 p-3">
              <h3 className="mb-2 font-semibold uppercase tracking-widest text-muted">
                Your last bet
              </h3>
              {bet == null ? (
                <p className="text-muted">No bet yet.</p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted">Status</dt>
                  <dd className="font-mono">{BetStatus[bet.status]}</dd>
                  <dt className="text-muted">Nonce</dt>
                  <dd className="font-mono">{bet.nonce.toString()}</dd>
                  <dt className="text-muted">Stake</dt>
                  <dd className="font-mono">
                    {diamondString(lamportsToDiamonds(bet.amount))} 💎
                  </dd>
                  <dt className="text-muted">Commitment at bet</dt>
                  <dd>
                    <Hex value={bet.commitment} />
                  </dd>
                  <dt className="text-muted">Your seed</dt>
                  <dd>
                    <Hex value={clientSeed ?? bet.clientSeed} />
                  </dd>
                  <dt className="text-muted">House reveal</dt>
                  <dd>
                    <Hex value={settled ? bet.reveal : null} />
                  </dd>
                  <dt className="text-muted">Chain steps</dt>
                  <dd className="font-mono">{settled ? steps : "—"}</dd>
                  <dt className="text-muted">Payout</dt>
                  <dd className="font-mono">
                    {settled
                      ? `${diamondString(lamportsToDiamonds(bet.payout))} 💎`
                      : "—"}
                  </dd>
                  <dt className="text-muted">Bet account</dt>
                  <dd>
                    <a
                      className="underline"
                      href={getExplorerUrl(`/address/${bet.player}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      player on explorer
                    </a>
                  </dd>
                </dl>
              )}
              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  onClick={recompute}
                  disabled={!settled}
                >
                  Recompute in browser
                </Button>
                {result && <span className="text-muted">{result}</span>}
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
