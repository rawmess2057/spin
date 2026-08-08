"use client";

import { useEffect, useMemo, useState } from "react";
import {
  diamondChips,
  diamondString,
  diamondsToLamports,
  lamportsToDiamonds,
  parseDiamonds,
} from "../../../lib/diamonds";
import { useVaultSpin } from "../../../lib/hooks/use-vault-spin";
import { useCluster } from "../../../lib/hooks/use-cluster";
import { GRID_MAX_MULTIPLIER_BP } from "../../../lib/solana/config";
import * as sound from "../../../lib/sound/events";
import { winTier } from "../../../lib/win-tiers";
import { BigWinOverlay } from "../slots/big-win-overlay";
import { ProvablyFairModal } from "../provably-fair-modal";
import { Cashier } from "../../vault/cashier";
import { Button } from "../../ui/button";
import { GridBoard } from "./grid-board";
import { GridPaytableModal } from "./grid-paytable";
import { PharaohSprite } from "../pharaoh/symbols/pharaoh-sprite";
import { DragonSprite } from "../dragon/symbols/dragon-sprite";
import { MinesSprite } from "../mines/symbols/mines-sprite";

export type GridOutcomeBase = {
  raw: bigint;
  cells: number[];
  multiplierBp: bigint;
  win: boolean;
  counts: number[];
  bestSymbol: number;
  bestCount: number;
  boards?: number[][];
  freeSpins?: boolean;
  pearlTier?: 0 | 2 | 3;
  cascadeLevels?: number;
};

export type GridGameDef = {
  gameId: number;
  title: string;
  kicker: string;
  subtitle: string;
  prefix: "pharaoh" | "dragon" | "mines";
  reels: number;
  rows: number;
  cellPx: number;
  minCount: number;
  rtp: number;
  evalFn: (randomness: Uint8Array) => GridOutcomeBase;
  /** Symbol names, index = on-chain digit (for results and paytable). */
  symbolNames: readonly string[];
  /** Base multiplier in bp per symbol at the minimum winning count. */
  paytableMinBp: readonly bigint[];
  /** Extra result lines under the outcome, e.g. free-spins or pearl tier. */
  outcomeLines: (o: GridOutcomeBase) => string[];
};

export function GridScreen({ def }: { def: GridGameDef }) {
  const { getExplorerUrl } = useCluster();
  const game = useVaultSpin<GridOutcomeBase>({
    gameId: def.gameId,
    evaluate: (randomness) => def.evalFn(randomness),
  });
  const outcome = game.outcome;

  const [amount, setAmount] = useState("");
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [fairModalOpen, setFairModalOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [cascadeStep, setCascadeStep] = useState(0);
  const [cascadeDone, setCascadeDone] = useState(false);
  const [boardLanded, setBoardLanded] = useState(true);

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
  const errors = game.betErrors(betLamports);

  const rolling = game.rolling;

  // Reset the reveal choreography when a new outcome arrives (render-phase
  // state adjustment); the effect below only schedules the reveal itself.
  const [prevOutcome, setPrevOutcome] = useState<GridOutcomeBase | null>(null);
  if (outcome !== prevOutcome) {
    setPrevOutcome(outcome);
    setCascadeStep(0);
    setCascadeDone(false);
    setRevealed(false);
    setBoardLanded(outcome == null);
  }

  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => {
      setRevealed(true);
      if (outcome.boards && outcome.boards.length > 1 && outcome.win) {
        sound.anticipation();
      }
    }, 750);
    return () => clearTimeout(t);
  }, [outcome]);

  const cascadeActive =
    revealed && outcome?.boards != null && outcome.boards.length > 1;

  useEffect(() => {
    if (!cascadeActive) return;
    sound.reelStop(cascadeStep);
  }, [cascadeActive, cascadeStep]);

  // The motor whir started by spinStart() loops until it is explicitly cut.
  // The board's onLandDone handles the normal path; this covers every way a
  // spin can end without landing — a rejected bet, an unresolved spin waiting
  // on a refund, or navigating away mid-spin.
  useEffect(() => {
    if (game.status === "idle" || game.status === "refundable") sound.spinEnd();
  }, [game.status]);

  useEffect(() => () => sound.spinEnd(), []);

  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => {
      if (outcome.win) {
        if (outcome.multiplierBp >= GRID_MAX_MULTIPLIER_BP) sound.jackpot();
        else sound.win(outcome.multiplierBp);
      } else {
        sound.lose();
      }
    }, 2300);
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

  const handleSpin = async () => {
    if (betLamports == null) return;
    setOverlayDismissed(false);
    setCascadeDone(false);
    sound.spinStart();
    const sent = await game.placeBet(betLamports, 0n);
    if (!sent) sound.spinEnd();
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

  const boards =
    cascadeActive && outcome!.boards ? outcome!.boards : [outcome?.cells ?? []];
  const resolvedBoard = !revealed
    ? []
    : cascadeDone && outcome
      ? outcome.cells
      : (boards[cascadeStep] ?? []);

  // Resting board so the play surface is never empty before the first spin.
  // Deterministic and evenly spread (step 3 is coprime with the 10 symbols),
  // so no symbol ever reaches `minCount` and it can't read as a real result.
  const idleBoard = useMemo(() => {
    const n = def.reels * def.rows;
    const symbols = def.symbolNames.length;
    return Array.from({ length: n }, (_, i) => (i * 3 + 1) % symbols);
  }, [def.reels, def.rows, def.symbolNames.length]);

  const boardIdle = resolvedBoard.length === 0;
  const displayBoard = boardIdle ? idleBoard : resolvedBoard;
  const boardSpinning = rolling || (outcome != null && !revealed);

  const resultShown =
    game.status === "resolved" &&
    outcome != null &&
    revealed &&
    boardLanded &&
    (!cascadeActive || cascadeDone);

  const needsBuyIn = game.balance == null || game.balance === 0n;

  return (
    <div className="relative">
      {def.prefix === "pharaoh" && <PharaohSprite />}
      {def.prefix === "dragon" && <DragonSprite />}
      {def.prefix === "mines" && <MinesSprite />}
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
          {/* Red/gold corner markers */}
          <div className="pointer-events-none absolute left-3 top-3 h-10 w-10 rounded-full border-2 border-gold/25" />
          <div className="pointer-events-none absolute right-3 top-3 h-10 w-10 rounded-full border-2 border-gold/25" />
          <div className="pointer-events-none absolute bottom-3 left-3 h-10 w-10 rounded-full border-2 border-red-900/40" />
          <div className="pointer-events-none absolute bottom-3 right-3 h-10 w-10 rounded-full border-2 border-red-900/40" />

          <div className="relative flex flex-col items-center gap-6">
            <div className="flex w-full items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-sm font-bold tracking-[0.2em] text-gold [text-shadow:0_0_12px_rgba(255,192,87,0.4)]">
                  {def.kicker}
                </h2>
                <p className="mt-1 text-xs text-muted">{def.subtitle}</p>
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

                {/* The board window */}
                <div
                  className={`relative flex flex-col items-center gap-3 overflow-hidden rounded-md border px-4 py-5 transition-colors duration-300 ${
                    outcome == null
                      ? "border-border-low bg-black/25"
                      : outcome.win
                        ? "border-gold/50 bg-gold/5"
                        : "border-red-900/50 bg-red-950/20"
                  }`}
                >
                  <div className="mb-1 flex w-full items-center justify-between px-1">
                    <span className="text-[9px] font-semibold tracking-[0.3em] text-gold/50">
                      {def.title.toUpperCase()}
                    </span>
                    {outcome && revealed && (
                      <span className="font-mono text-[10px] tabular-nums text-gold/70">
                        {outcome.win
                          ? `${(Number(outcome.multiplierBp) / 100).toFixed(2)}x`
                          : "—"}
                      </span>
                    )}
                  </div>
                  <div className="min-h-[156px]">
                    <div
                      className={
                        boardIdle && !boardSpinning
                          ? "opacity-40 saturate-50 transition-opacity duration-300"
                          : "transition-opacity duration-300"
                      }
                    >
                      <GridBoard
                        prefix={def.prefix}
                        cells={displayBoard}
                        reels={def.reels}
                        symbolCount={def.symbolNames.length}
                        cellPx={def.cellPx}
                        spinning={boardSpinning}
                        winningSymbol={
                          resultShown && outcome?.win ? outcome.bestSymbol : null
                        }
                        boards={cascadeActive ? boards : undefined}
                        cascadeActive={cascadeActive}
                        onColumnLand={(c) => sound.reelStop(c)}
                        onLandDone={() => {
                          setBoardLanded(true);
                          sound.spinEnd();
                        }}
                        onCascadeStep={(s) => setCascadeStep(s)}
                        onCascadeDone={() => setCascadeDone(true)}
                      />
                    </div>
                  </div>
                  {boardSpinning ? (
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                      Digging up your luck…
                    </p>
                  ) : (
                    boardIdle &&
                    game.status === "idle" && (
                      <p className="text-xs text-muted">Place a bet to spin.</p>
                    )
                  )}
                </div>

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
                    onClick={handleSpin}
                    disabled={!canBet}
                    className="font-display w-40 rounded-sm border-2 border-gold/60 bg-gradient-to-b from-[#3a2b12] to-[#241a0a] text-sm font-bold uppercase tracking-[0.2em] text-gold shadow-[0_0_20px_rgba(255,192,87,0.35)] transition hover:shadow-[0_0_30px_rgba(255,192,87,0.55)]"
                  >
                    {game.isSending ? "Sending…" : "Spin"}
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
                      The oracle responded but your spin was not resolved
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

                {resultShown && (
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
                      {outcome.win
                        ? `${(Number(outcome.multiplierBp) / 100).toFixed(2)}x`
                        : "No match"}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {outcome.win
                        ? `Matched ${outcome.bestCount} ${def.symbolNames[outcome.bestSymbol]?.toLowerCase() ?? "symbols"} · ${diamondString(lamportsToDiamonds(payoutLamports!))} 💎`
                        : `Need ${def.minCount}+ matching symbols anywhere on the board.`}
                      {def.outcomeLines(outcome).map((l) => (
                        <span key={l} className="block text-gold/80">
                          {l}
                        </span>
                      ))}
                    </p>
                    <button
                      onClick={game.reset}
                      className="mt-3 cursor-pointer rounded-sm bg-gold px-4 py-2 text-sm font-medium text-gold-foreground transition hover:brightness-110"
                    >
                      Spin again
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

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPaytableOpen(true)}
                    className="cursor-pointer text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground"
                  >
                    Paytable
                  </button>
                  <button
                    type="button"
                    onClick={() => setFairModalOpen(true)}
                    className="cursor-pointer text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground"
                  >
                    Provably fair ✓
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gold base trim */}
        <div
          className="h-3 w-full"
          style={{
            background:
              "linear-gradient(180deg,#ffc057 0%,#8a5f00 40%,#3a2a10 100%)",
          }}
        />
      </div>

      <GridPaytableModal
        open={paytableOpen}
        onClose={() => setPaytableOpen(false)}
        def={def}
      />

      <ProvablyFairModal
        open={fairModalOpen}
        onClose={() => setFairModalOpen(false)}
        rtpLabel={`${(def.rtp * 100).toFixed(1)}%`}
        houseEdgeLabel={`${((1 - def.rtp) * 100).toFixed(1)}%`}
        weights={{
          gameId: def.gameId,
          reels: def.reels,
          rows: def.rows,
          minCount: def.minCount,
          rtp: def.rtp,
          maxMultiplierBp: GRID_MAX_MULTIPLIER_BP.toString(),
          source:
            "programs/spin/src/constants.rs — settled by resolve_spin from ORAO VRF randomness in a single callback",
        }}
      />
    </div>
  );
}
