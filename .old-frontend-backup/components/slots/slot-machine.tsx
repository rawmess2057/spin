"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  address,
  formatDecimalFixedPoint,
  lamportsToSol,
  sol,
  solToLamports,
  type Lamports,
} from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/client-provider";
import { useBalance } from "../../lib/hooks/use-balance";
import { useSend } from "../../lib/hooks/use-send";
import {
  useGameConfig,
  useHouse,
  useSpinStatus,
} from "../../lib/hooks/use-spin";
import { GAME_SLOTS, SLOT_SYMBOLS, SLOTS_REELS } from "../../lib/spin/config";
import { slotsEval } from "../../lib/spin/slots";
import * as sound from "../../lib/spin/sound";
import { useCluster } from "../cluster-context";
import { Reel } from "./reels";
import { Paytable } from "./paytable";

const solFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function solString(lamports: bigint): string {
  return formatDecimalFixedPoint(
    solFormatter,
    lamportsToSol(lamports as Lamports)
  );
}

const CHIPS = [0.001, 0.002, 0.005, 0.01];
const LAND_STAGGER = 180;

export function SlotMachine() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { getExplorerUrl } = useCluster();
  const { run, isSending } = useSend();

  const config = useGameConfig(GAME_SLOTS);
  const house = useHouse();
  const balance = useBalance(
    connected ? address(connected.account.address) : undefined
  );

  const [amount, setAmount] = useState("0.01");
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [placing, setPlacing] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const spin = useSpinStatus(seed, placing);

  const randomness = spin.request.data?.randomness ?? null;
  const outcome = useMemo(
    () => (randomness ? slotsEval(randomness) : null),
    [randomness]
  );

  const networkProblem =
    config.error != null ||
    house.error != null ||
    (connected != null && balance.error != null);
  const connecting =
    connected != null &&
    (config.isLoading || house.isLoading || balance.isLoading);

  const amountLamports = useMemo(() => {
    try {
      return solToLamports(sol(amount));
    } catch {
      return null;
    }
  }, [amount]);

  const minBet = config.data?.minBet ?? null;
  const maxBet = config.data?.maxBet ?? null;

  const errors = useMemo(() => {
    const out: string[] = [];
    if (!config.data && !config.isLoading)
      out.push("Slots config not found on this cluster.");
    if (connected && amountLamports == null) out.push("Invalid bet amount.");
    if (
      connected &&
      minBet != null &&
      amountLamports != null &&
      amountLamports < minBet
    ) {
      out.push(`Bet below minimum (${solString(minBet)} SOL).`);
    }
    if (
      connected &&
      maxBet != null &&
      amountLamports != null &&
      amountLamports > maxBet
    ) {
      out.push(`Bet above maximum (${solString(maxBet)} SOL).`);
    }
    if (
      connected &&
      balance.lamports != null &&
      amountLamports != null &&
      amountLamports > balance.lamports
    ) {
      out.push("Insufficient SOL balance.");
    }
    return out;
  }, [
    config.data,
    config.isLoading,
    connected,
    amountLamports,
    minBet,
    maxBet,
    balance.lamports,
  ]);

  const reelsSpinning =
    seed != null &&
    !outcome &&
    (spin.status === "placing" || spin.status === "awaitingOracle");

  const canBet =
    connected != null &&
    config.data != null &&
    !config.isLoading &&
    !house.isLoading &&
    !house.data?.paused &&
    errors.length === 0 &&
    !isSending &&
    spin.status === "idle" &&
    balance.lamports != null;

  const handleSpin = async () => {
    const signer = connected?.signer;
    if (!signer || amountLamports == null) return;
    const newSeed = new Uint8Array(crypto.getRandomValues(new Uint8Array(32)));
    setSeed(newSeed);
    setPlacing(true);
    sound.spinStart();
    const sig = await run(
      () =>
        client.spin.instructions
          .placeBet({
            player: signer,
            gameId: GAME_SLOTS,
            amount: amountLamports,
            target: 0n,
            seed: newSeed,
          })
          .sendTransaction(),
      "Bet placed"
    );
    setPlacing(false);
    if (sig) {
      setLastSig(sig);
    } else {
      setSeed(null);
    }
  };

  const handleRefund = async () => {
    const signer = connected?.signer;
    if (!signer || !seed) return;
    await run(
      () =>
        client.spin.instructions
          .refundSpin({ player: signer, seed })
          .sendTransaction(),
      "Spin refunded"
    );
    setSeed(null);
    setLastSig(null);
  };

  const playAgain = () => {
    setSeed(null);
    setLastSig(null);
  };

  const onLanded = useCallback((i: number) => {
    sound.reelStop(i);
  }, []);

  // Play the outcome jingle once every reel has landed.
  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(
      () => {
        if (outcome.win) {
          sound.win(outcome.multiplierBp);
        } else {
          sound.lose();
        }
      },
      LAND_STAGGER * (SLOTS_REELS - 1) + 1_450
    );
    return () => clearTimeout(t);
  }, [outcome]);

  const payoutLamports =
    outcome && outcome.win && amountLamports != null
      ? (amountLamports * outcome.multiplierBp) / 10_000n
      : null;

  const winningSymbols = outcome?.win
    ? new Set(
        outcome.symbols
          .map((s, i) => (s === outcome.bestSymbol ? i : -1))
          .filter((i) => i >= 0)
      )
    : null;

  return (
    <div className="rounded-2xl border border-border-low bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-bold tracking-[0.2em] text-primary [text-shadow:0_0_12px_rgba(0,255,163,0.4)]">
            NEON SLOTS
          </h2>
          <p className="mt-1 text-xs text-muted">
            5 reels · scatter pays · provably fair via ORAO VRF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_6px_rgba(0,255,163,0.8)]"
                style={{ animationDelay: `${i * 250}ms` }}
              />
            ))}
          </span>
          {house.data?.paused && (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              House paused
            </span>
          )}
        </div>
      </div>

      {!connected ? (
        <p className="mt-6 text-sm text-muted">Connect a wallet to play.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {connecting && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Connecting to Solana network…
            </div>
          )}
          {networkProblem && !connecting && (
            <div className="rounded-lg border border-orange/30 bg-orange/5 px-3 py-2 text-xs text-orange">
              Having trouble reaching the Solana network. Data may be stale —
              this usually resolves automatically.
            </div>
          )}

          <div className="relative">
            <div className="flex gap-2">
              {Array.from({ length: SLOTS_REELS }, (_, i) => (
                <Reel
                  key={i}
                  reelIndex={i}
                  spinning={reelsSpinning}
                  landSymbol={outcome ? outcome.symbols[i] : null}
                  delayMs={i * LAND_STAGGER}
                  winning={winningSymbols?.has(i) ?? false}
                  onLanded={onLanded}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-42 -translate-y-1/2 rounded-lg border-y-2 border-primary/40 shadow-[0_0_20px_rgba(0,255,163,0.15)]" />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">
                Bet amount (SOL)
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.001"
                placeholder="0.01"
                disabled={isSending}
                className="w-full rounded-lg border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring disabled:opacity-50"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={isSending}
                    onClick={() => setAmount(c.toFixed(3))}
                    className="cursor-pointer rounded-md border border-border-low bg-cream/50 px-2.5 py-1 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                  >
                    {c.toFixed(3)}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isSending || maxBet == null}
                  onClick={() => setAmount(solString(maxBet!))}
                  className="cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            </div>
            <button
              onClick={handleSpin}
              disabled={!canBet}
              className="font-display w-40 cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-bold tracking-wide text-primary-foreground shadow-[0_0_20px_rgba(0,255,163,0.45)] transition hover:brightness-110 hover:shadow-[0_0_30px_rgba(0,255,163,0.65)] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
            >
              {isSending ? "Sending…" : "SPIN"}
            </button>
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {spin.status === "awaitingOracle" && (
            <div className="rounded-lg border border-border-low bg-cream/50 px-4 py-3 text-sm">
              <p className="font-medium">Waiting for the VRF oracle…</p>
              <p className="mt-0.5 text-xs text-muted">
                Your randomness request is being fulfilled (~5s). Your stake is
                escrowed in the house treasury.
              </p>
              {lastSig && (
                <a
                  href={getExplorerUrl(`/tx/${lastSig}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs underline"
                >
                  View transaction
                </a>
              )}
            </div>
          )}

          {spin.status === "refundable" && (
            <div className="rounded-lg border border-orange/30 bg-orange/5 px-4 py-3 text-sm">
              <p className="font-medium text-orange">
                The oracle responded but your spin was not resolved
                automatically.
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Claim your stake back below. This is safe: the house refunds the
                escrowed amount.
              </p>
              <button
                onClick={handleRefund}
                disabled={isSending}
                className="mt-2 cursor-pointer rounded-lg border border-border-low bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
              >
                {isSending ? "Refunding…" : "Refund stake"}
              </button>
            </div>
          )}

          {spin.status === "resolved" && outcome && (
            <div
              className={`rounded-lg border px-4 py-4 text-center ${
                outcome.win
                  ? "border-primary/30 bg-primary/5 shadow-[0_0_24px_rgba(0,255,163,0.12)]"
                  : "border-border-low bg-cream/50"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-muted">
                {outcome.win ? "You won" : "You lost"}
              </p>
              <p className="mt-2 flex items-center justify-center gap-1 text-3xl">
                {outcome.symbols.map((s, i) => (
                  <span
                    key={i}
                    className={
                      s === outcome.bestSymbol && outcome.win
                        ? "animate-pulse rounded-lg bg-primary/20 px-1"
                        : "px-1 opacity-60"
                    }
                  >
                    {SLOT_SYMBOLS[s].glyph}
                  </span>
                ))}
              </p>
              <p className="mt-2 text-xs text-muted">
                {outcome.win
                  ? `${outcome.bestCount}× ${SLOT_SYMBOLS[outcome.bestSymbol].name} · ${(Number(outcome.multiplierBp) / 100).toFixed(1)}x payout · ${solString(payoutLamports!)} SOL`
                  : "No matching symbols this spin."}
              </p>
              <button
                onClick={playAgain}
                className="mt-3 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Play again
              </button>
            </div>
          )}

          {spin.status === "idle" && (
            <p className="text-xs text-muted">
              Balance:{" "}
              <span className="font-mono tabular-nums">
                {balance.lamports != null ? solString(balance.lamports) : "—"}
              </span>{" "}
              SOL
            </p>
          )}

          <Paytable />
        </div>
      )}
    </div>
  );
}
