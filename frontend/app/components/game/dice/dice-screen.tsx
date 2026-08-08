"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  diamondChips,
  diamondString,
  diamondsToLamports,
  lamportsToDiamonds,
  parseDiamonds,
} from "../../../lib/diamonds";
import { useVaultSpin } from "../../../lib/hooks/use-vault-spin";
import { useCluster } from "../../../lib/hooks/use-cluster";
import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  GAME_DICE,
} from "../../../lib/solana/config";
import { diceEval, type DiceOutcome } from "../../../lib/solana/games/dice";
import * as sound from "../../../lib/sound/events";
import { winTier } from "../../../lib/win-tiers";
import { DiceCube } from "./dice-cube";
import { DiceTrack } from "./dice-track";
import { TargetSlider } from "./target-slider";
import { BigWinOverlay } from "../slots/big-win-overlay";
import { ProvablyFairModal } from "../provably-fair-modal";
import { Cashier } from "../../vault/cashier";
import { Button } from "../../ui/button";

/** Map the on-chain roll to a decorative die face (1–6). */
function rollFace(roll: bigint, salt: number): number {
  return Number((roll + BigInt(salt)) % 6n) + 1;
}

export function DiceScreen() {
  const { getExplorerUrl } = useCluster();
  const [target, setTarget] = useState<bigint>(5000n);
  const [betTarget, setBetTarget] = useState<bigint>(5000n);
  // The target the in-flight roll was placed at. A ref as well as state so the
  // eval can never pick up a slider move made mid-roll.
  const betTargetRef = useRef<bigint>(5000n);

  const game = useVaultSpin<DiceOutcome>({
    gameId: GAME_DICE,
    evaluate: (randomness) => diceEval(randomness, betTargetRef.current),
  });
  const outcome = game.outcome;

  const [amount, setAmount] = useState("");
  const [fairModalOpen, setFairModalOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const minDiamonds = game.minBet != null ? lamportsToDiamonds(game.minBet) : null;
  const maxDiamonds = game.maxBet != null ? lamportsToDiamonds(game.maxBet) : null;
  const balanceDiamonds =
    game.balance != null ? lamportsToDiamonds(game.balance) : null;
  const chips = useMemo(
    () => diamondChips(minDiamonds, maxDiamonds),
    [minDiamonds, maxDiamonds]
  );

  // Seed the field from the game's own limits once they load, rather than a
  // hardcoded default some games would reject. Render-phase state adjustment
  // (per react.dev) — an effect here would cascade an extra render.
  if (amount === "" && chips.length > 0) {
    setAmount(chips[Math.min(1, chips.length - 1)].toString());
  }

  const betDiamonds = useMemo(() => parseDiamonds(amount), [amount]);
  const betLamports =
    betDiamonds != null ? diamondsToLamports(betDiamonds) : null;

  const errors = useMemo(() => {
    const out = game.betErrors(betLamports);
    if (target < DICE_MIN_TARGET || target > DICE_MAX_TARGET) {
      out.push(
        `Target must be between ${DICE_MIN_TARGET} and ${DICE_MAX_TARGET}.`
      );
    }
    return out;
  }, [game, betLamports, target]);

  const rolling = game.rolling;

  // Dice clatter while tumbling — a few soft knocks.
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => {
      if (Math.random() < 0.6) sound.diceClatter();
    }, 420);
    return () => clearInterval(id);
  }, [rolling]);

  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => {
      if (outcome.win) sound.win(outcome.multiplierBp);
      else sound.lose();
    }, 900);
    return () => clearTimeout(t);
  }, [outcome]);

  const canBet =
    game.connected != null &&
    game.config.data != null &&
    !game.house.data?.paused &&
    errors.length === 0 &&
    !game.isSending &&
    game.status === "idle" &&
    game.balance != null;

  const handleRoll = async () => {
    if (betLamports == null) return;
    betTargetRef.current = target;
    setBetTarget(target);
    setOverlayDismissed(false);
    const sent = await game.placeBet(betLamports, target);
    if (sent) sound.diceRoll();
  };

  const payoutLamports =
    outcome && outcome.win && game.bet != null
      ? (game.bet * outcome.multiplierBp) / 10_000n
      : null;

  const tier = outcome ? winTier(outcome.multiplierBp) : "none";
  const showOverlay =
    (tier === "big" || tier === "huge" || tier === "jackpot") &&
    payoutLamports != null &&
    !overlayDismissed &&
    game.status === "resolved";

  const dieOne = outcome ? rollFace(outcome.roll, 0) : 1;
  const dieTwo = outcome ? rollFace(outcome.roll, 3) : 2;
  const displayRoll = outcome ? outcome.roll.toString().padStart(5, "0") : null;
  const needsBuyIn = game.balance == null || game.balance === 0n;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-8 -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 30%, rgba(255,192,87,0.14) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      {showOverlay && payoutLamports != null && (
        <BigWinOverlay
          tier={tier as "big" | "huge" | "jackpot"}
          payout={lamportsToDiamonds(payoutLamports)}
          onDismiss={() => setOverlayDismissed(true)}
        />
      )}

      <div className="overflow-hidden rounded-2xl border-2 border-gold/30 bg-gradient-to-b from-[#262016] to-[#0d0a06] shadow-[0_18px_50px_rgba(0,0,0,0.65)]">
        <div
          className="relative p-5 sm:p-8"
          style={{
            background:
              "radial-gradient(ellipse 80% 100% at 50% 0%, #1d2418 0%, #12170f 55%, #0a0d07 100%)",
          }}
        >
          <div className="pointer-events-none absolute left-3 top-3 h-10 w-10 rounded-full border-2 border-gold/25" />
          <div className="pointer-events-none absolute right-3 top-3 h-10 w-10 rounded-full border-2 border-gold/25" />
          <div className="pointer-events-none absolute bottom-3 left-3 h-10 w-10 rounded-full border-2 border-red-900/40" />
          <div className="pointer-events-none absolute bottom-3 right-3 h-10 w-10 rounded-full border-2 border-red-900/40" />

          <div className="relative flex flex-col items-center gap-6">
            <div className="flex w-full items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-sm font-bold tracking-[0.2em] text-gold [text-shadow:0_0_12px_rgba(255,192,87,0.4)]">
                  VEGAS DICE
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Roll under your target — pick your own odds, provably fair via
                  ORAO VRF.
                </p>
              </div>
              {game.house.data?.paused && (
                <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                  House paused
                </span>
              )}
            </div>

            {!game.connected ? (
              <p className="text-sm text-muted">Connect a wallet to play.</p>
            ) : (
              <div className="w-full space-y-6">
                {game.connecting && (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                    Connecting to Solana network…
                  </div>
                )}
                {game.networkProblem && !game.connecting && (
                  <div className="rounded-sm border border-orange/30 bg-orange/5 px-3 py-2 text-xs text-orange">
                    Having trouble reaching the Solana network. Data may be
                    stale — this usually resolves automatically.
                  </div>
                )}

                {(needsBuyIn || cashierOpen) && game.player && (
                  <Cashier
                    player={game.player}
                    balance={game.balance}
                    sessionAddress={game.session.signer?.address ?? null}
                    sessionReady={game.sessionReady}
                    sessionExpired={game.sessionExpired}
                    spendLeft={game.spendLeft}
                    onDone={() => setCashierOpen(false)}
                  />
                )}

                {/* LED readout */}
                <div
                  className="rounded-md px-4 py-3 text-center"
                  style={{
                    background: "#0a0203",
                    boxShadow:
                      "inset 0 3px 12px rgba(0,0,0,0.95), inset 0 -2px 6px rgba(120,60,0,0.25)",
                  }}
                >
                  <p className="text-[9px] font-semibold tracking-[0.35em] text-gold/50">
                    ROLL
                  </p>
                  <p
                    className="font-mono text-4xl font-bold tabular-nums tracking-[0.18em] sm:text-5xl"
                    style={{
                      color: rolling
                        ? "#ffb23e"
                        : outcome?.win
                          ? "#ffc057"
                          : "#ff3b1f",
                      textShadow: rolling
                        ? "0 0 16px rgba(255,178,62,0.55)"
                        : outcome?.win
                          ? "0 0 20px rgba(255,192,87,0.85)"
                          : "0 0 14px rgba(255,59,31,0.7)",
                      transition: "color 0.3s, text-shadow 0.3s",
                    }}
                  >
                    {rolling ? "?????" : (displayRoll ?? "00000")}
                  </p>
                </div>

                {/* Dice pair */}
                <div
                  className={`flex items-center justify-center gap-10 rounded-md border px-6 py-6 transition-colors duration-300 ${
                    outcome == null
                      ? "border-border-low bg-black/25"
                      : outcome.win
                        ? "border-gold/50 bg-gold/5"
                        : "border-red-900/50 bg-red-950/20"
                  }`}
                >
                  <DiceCube value={dieOne} rolling={rolling} delayMs={0} />
                  <DiceCube value={dieTwo} rolling={rolling} delayMs={220} />
                </div>

                <DiceTrack
                  target={game.status === "idle" ? target : betTarget}
                  spinning={rolling}
                  roll={outcome?.roll ?? null}
                  win={outcome ? outcome.win : null}
                />

                <TargetSlider
                  target={target}
                  onChange={setTarget}
                  disabled={game.isSending || game.status !== "idle"}
                />

                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-muted">
                      Bet amount (💎)
                    </label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      type="number"
                      min={minDiamonds != null ? Number(minDiamonds) : 0}
                      max={maxDiamonds != null ? Number(maxDiamonds) : undefined}
                      step="1"
                      disabled={game.isSending || game.status !== "idle"}
                      className="w-full rounded-sm border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-gold disabled:opacity-50"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((c) => (
                        <button
                          key={c.toString()}
                          type="button"
                          disabled={game.isSending || game.status !== "idle"}
                          onClick={() => setAmount(c.toString())}
                          className="cursor-pointer rounded-sm border border-border-low bg-cream/50 px-2.5 py-1 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                        >
                          {diamondString(c)}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={
                          game.isSending ||
                          game.status !== "idle" ||
                          maxDiamonds == null ||
                          balanceDiamonds == null
                        }
                        onClick={() =>
                          setAmount(
                            (balanceDiamonds! < maxDiamonds!
                              ? balanceDiamonds!
                              : maxDiamonds!
                            ).toString()
                          )
                        }
                        className="cursor-pointer rounded-sm border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold transition hover:bg-gold/20 disabled:opacity-50"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <Button
                    onClick={handleRoll}
                    disabled={!canBet}
                    className="font-display w-40 rounded-sm border-2 border-gold/60 bg-gradient-to-b from-[#3a2b12] to-[#241a0a] text-sm font-bold uppercase tracking-[0.2em] text-gold shadow-[0_0_20px_rgba(255,192,87,0.35)] transition hover:shadow-[0_0_30px_rgba(255,192,87,0.55)]"
                  >
                    {game.isSending ? "Sending…" : "Roll"}
                  </Button>
                </div>

                {errors.length > 0 && !needsBuyIn && (
                  <ul className="space-y-1 text-xs text-destructive">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}

                {game.status === "awaitingOracle" && (
                  <div className="rounded-sm border border-border-low bg-cream/50 px-4 py-3 text-sm">
                    <p className="font-medium">Waiting for the VRF oracle…</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Your randomness request is being fulfilled (~5s). Your
                      stake is escrowed in the house treasury.
                    </p>
                    {game.lastSig && (
                      <a
                        href={getExplorerUrl(`/tx/${game.lastSig}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs underline"
                      >
                        View transaction
                      </a>
                    )}
                  </div>
                )}

                {game.status === "refundable" && (
                  <div className="rounded-sm border border-orange/30 bg-orange/5 px-4 py-3 text-sm">
                    <p className="font-medium text-orange">
                      The oracle responded but your roll was not resolved
                      automatically.
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Claim your stake back below — it returns to your diamond
                      balance.
                    </p>
                    <button
                      onClick={game.refund}
                      disabled={game.isSending}
                      className="mt-2 cursor-pointer rounded-sm border border-border-low bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                    >
                      {game.isSending ? "Refunding…" : "Refund stake"}
                    </button>
                  </div>
                )}

                {game.status === "resolved" && outcome && (
                  <div
                    className={`rounded-sm border px-4 py-4 text-center ${
                      outcome.win
                        ? "border-gold/30 bg-gold/5 shadow-[0_0_24px_rgba(255,192,87,0.12)]"
                        : "border-border-low bg-cream/50"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wide text-muted">
                      {outcome.win ? "You won" : "You lost"}
                    </p>
                    <p className="mt-2 font-mono text-2xl font-bold">
                      {outcome.roll.toString().padStart(5, "0")}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {outcome.win
                        ? `Rolled under ${outcome.target} · ${(Number(outcome.multiplierBp) / 100).toFixed(2)}x payout · ${diamondString(lamportsToDiamonds(payoutLamports!))} 💎`
                        : `Needed to roll under ${outcome.target}.`}
                    </p>
                    <button
                      onClick={game.reset}
                      className="mt-3 cursor-pointer rounded-sm bg-gold px-4 py-2 text-sm font-medium text-gold-foreground transition hover:brightness-110"
                    >
                      Roll again
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-muted">
                    Balance:{" "}
                    <span className="font-mono tabular-nums text-gold">
                      {balanceDiamonds != null
                        ? `${diamondString(balanceDiamonds)} 💎`
                        : "—"}
                    </span>
                  </p>
                  {!needsBuyIn && (
                    <button
                      type="button"
                      onClick={() => setCashierOpen((o) => !o)}
                      className="cursor-pointer rounded-sm border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/20"
                    >
                      {cashierOpen ? "Hide cashier" : "Buy in / cash out"}
                    </button>
                  )}
                  {game.sessionReady && (
                    <span className="text-[10px] text-muted">
                      Session active — no wallet prompt
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setFairModalOpen(true)}
                  className="cursor-pointer text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground"
                >
                  Provably fair ✓
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="h-3 w-full"
          style={{
            background:
              "linear-gradient(180deg,#ffc057 0%,#8a5f00 40%,#3a2a10 100%)",
          }}
        />
      </div>

      <ProvablyFairModal
        open={fairModalOpen}
        onClose={() => setFairModalOpen(false)}
        rtpLabel="98.0%"
        houseEdgeLabel="2.0%"
        weights={{
          rollRange: 10_000,
          minTarget: DICE_MIN_TARGET.toString(),
          maxTarget: DICE_MAX_TARGET.toString(),
          rtpNumerator: "98000000",
        }}
      />
    </div>
  );
}
