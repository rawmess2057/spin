"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  GAME_SLOTS,
  SLOT_SYMBOLS,
  SLOTS_MAX_MULTIPLIER_BP,
  SLOTS_REELS,
  SLOTS_RTP,
} from "../../../lib/solana/config";
import { slotsEval, type SlotsOutcome } from "../../../lib/solana/games/slots";
import * as sound from "../../../lib/sound/events";
import { winTier } from "../../../lib/win-tiers";
import { Reel } from "./reel";
import { Cabinet, CreditMeter } from "./cabinet";
import { SymbolSprite } from "./symbols/symbol-sprite";
import { SlotSymbol } from "./symbols/slot-symbol";
import { ControlRail } from "./control-rail";
import { Paytable } from "./paytable";
import { BigWinOverlay } from "./big-win-overlay";
import { ProvablyFairModal } from "../provably-fair-modal";
import { Cashier } from "../../vault/cashier";
import { Card } from "../../ui/card";

const LAND_STAGGER = 180;
const TURBO_LAND_STAGGER = 60;

export function SlotScreen() {
  const { getExplorerUrl } = useCluster();
  const game = useVaultSpin<SlotsOutcome>({
    gameId: GAME_SLOTS,
    evaluate: (randomness) => slotsEval(randomness),
  });
  const outcome = game.outcome;

  const [amount, setAmount] = useState("");
  const [fairModalOpen, setFairModalOpen] = useState(false);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [lastWin, setLastWin] = useState<bigint | null>(null);
  const [anticipating, setAnticipating] = useState(false);
  const landStagger = turbo ? TURBO_LAND_STAGGER : LAND_STAGGER;

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

  const reelsSpinning = game.rolling;

  const canBet =
    game.connected != null &&
    game.config.data != null &&
    !game.house.data?.paused &&
    errors.length === 0 &&
    !game.isSending &&
    game.status === "idle" &&
    game.balance != null;

  // The outcome sound is driven by the reels reporting in, not by a timeout —
  // anticipation makes the total reveal length variable, so counting landings
  // is the only thing that stays correct.
  const landedCountRef = useRef(0);
  const outcomeRef = useRef(outcome);
  useEffect(() => {
    outcomeRef.current = outcome;
  });

  const onLanded = useCallback((i: number) => {
    sound.reelStop(i);
    setAnticipating(false);
    landedCountRef.current += 1;
    if (landedCountRef.current >= SLOTS_REELS) {
      sound.spinEnd();
      const result = outcomeRef.current;
      if (result?.win) {
        if (result.multiplierBp >= SLOTS_MAX_MULTIPLIER_BP) {
          sound.jackpot();
        } else {
          sound.win(result.multiplierBp);
        }
      } else if (result) {
        sound.lose();
      }
    }
  }, []);

  const handleSpin = async () => {
    if (betLamports == null) return;
    setOverlayDismissed(false);
    setAnticipating(false);
    landedCountRef.current = 0;
    sound.spinStart();
    const sent = await game.placeBet(betLamports, 0n);
    if (!sent) sound.spinEnd();
  };

  // The motor whir started by spinStart() loops until it is explicitly cut.
  // onLanded handles the normal path; this covers every way a spin can end
  // without the reels ever landing — a rejected bet, an unresolved spin
  // waiting on a refund, or navigating away mid-spin.
  useEffect(() => {
    if (game.status === "idle" || game.status === "refundable") sound.spinEnd();
  }, [game.status]);

  useEffect(() => () => sound.spinEnd(), []);

  const onAnticipateStart = useCallback(() => {
    setAnticipating(true);
    sound.anticipation();
  }, []);

  /**
   * A reel gets the anticipation treatment when the reels that have already
   * stopped leave a paying combination still possible — two matching symbols
   * showing means the next reel can complete a three-of-a-kind. Derived purely
   * from symbols the player can already see; the outcome was fixed on-chain
   * before the first reel stopped.
   */
  const anticipateReels = useMemo(() => {
    if (!outcome) return [] as boolean[];
    return outcome.symbols.map((_, i) => {
      const counts = new Map<number, number>();
      for (const s of outcome.symbols.slice(0, i)) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const maxPrior = Math.max(0, ...counts.values());
      return maxPrior >= 2;
    });
  }, [outcome]);

  const payoutLamports =
    outcome && outcome.win && game.bet != null
      ? (game.bet * outcome.multiplierBp) / 10_000n
      : null;

  // Persist the last resolved payout so the Credit/Win bar stays informative
  // after "Play again" resets the current outcome. Updated during render
  // (React's sanctioned pattern for "remember a previous value") rather than
  // in an effect, since it's a pure derivation of already-rendered state.
  if (
    game.status === "resolved" &&
    outcome &&
    lastWin !== (payoutLamports ?? 0n)
  ) {
    setLastWin(payoutLamports ?? 0n);
  }

  const tier = outcome ? winTier(outcome.multiplierBp) : "none";
  const showOverlay =
    (tier === "big" || tier === "huge" || tier === "jackpot") &&
    payoutLamports != null &&
    !overlayDismissed &&
    game.status === "resolved";

  const winningSymbols = outcome?.win
    ? new Set(
        outcome.symbols
          .map((s, i) => (s === outcome.bestSymbol ? i : -1))
          .filter((i) => i >= 0)
      )
    : null;

  const needsBuyIn = game.balance == null || game.balance === 0n;

  return (
    <div className="relative">
      <SymbolSprite />
      <div
        className="pointer-events-none absolute -inset-8 -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 30%, rgba(255,192,87,0.14) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div>
        {showOverlay && payoutLamports != null && (
          <BigWinOverlay
            tier={tier as "big" | "huge" | "jackpot"}
            payout={lamportsToDiamonds(payoutLamports)}
            onDismiss={() => setOverlayDismissed(true)}
          />
        )}

        {game.house.data?.paused && (
          <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
            House paused — betting is disabled.
          </div>
        )}

        {!game.connected ? (
          <Card className="p-6 text-sm text-muted">
            Connect a wallet to play.
          </Card>
        ) : (
          <div className="space-y-4">
            {game.connecting && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Connecting to Solana network…
              </div>
            )}
            {game.networkProblem && !game.connecting && (
              <div className="rounded-lg border border-orange/30 bg-orange/5 px-3 py-2 text-xs text-orange">
                Having trouble reaching the Solana network. Data may be stale —
                this usually resolves automatically.
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <Cabinet
                  paylineLit={
                    game.status === "resolved" && (outcome?.win ?? false)
                  }
                  anticipating={anticipating}
                  jackpotLabel={
                    game.status === "resolved" && outcome?.win
                      ? `${outcome.bestCount}× ${SLOT_SYMBOLS[outcome.bestSymbol].name} PAYS`
                      : "SINGLE LINE · PAYS ANYWHERE"
                  }
                  reels={
                    <div className="relative">
                      <div className="flex gap-1.5 overflow-x-auto sm:overflow-visible">
                        {Array.from({ length: SLOTS_REELS }, (_, i) => (
                          <Reel
                            key={i}
                            reelIndex={i}
                            spinning={reelsSpinning}
                            landSymbol={outcome ? outcome.symbols[i] : null}
                            delayMs={i * landStagger}
                            winning={winningSymbols?.has(i) ?? false}
                            turbo={turbo}
                            anticipate={anticipateReels[i] ?? false}
                            onAnticipateStart={onAnticipateStart}
                            onLanded={onLanded}
                          />
                        ))}
                      </div>
                      {/* The single live payline. */}
                      <div
                        className={`pointer-events-none absolute inset-x-0 top-1/2 h-14 -translate-y-1/2 border-y transition-all duration-300 ${
                          game.status === "resolved" && outcome?.win
                            ? "border-gold/80 shadow-[0_0_24px_rgba(255,192,87,0.35)]"
                            : "border-gold/25"
                        }`}
                      />
                    </div>
                  }
                  deck={
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <CreditMeter
                          label="CREDIT"
                          value={
                            balanceDiamonds != null
                              ? diamondString(balanceDiamonds)
                              : "—"
                          }
                        />
                        <CreditMeter
                          label="WIN"
                          tone="red"
                          value={
                            lastWin != null
                              ? diamondString(lamportsToDiamonds(lastWin))
                              : "—"
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-40 flex-1">
                          <label className="mb-1 block text-[10px] font-semibold tracking-[0.15em] text-muted">
                            BET (💎)
                          </label>
                          <input
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            type="number"
                            min={minDiamonds != null ? Number(minDiamonds) : 0}
                            max={
                              maxDiamonds != null
                                ? Number(maxDiamonds)
                                : undefined
                            }
                            step="1"
                            disabled={game.isSending || game.status !== "idle"}
                            className="w-full rounded-md border border-black/60 bg-[#050503] px-3 py-2 font-mono text-sm shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)] outline-none focus:border-gold/50 disabled:opacity-50"
                          />
                          <div className="mt-2 flex overflow-hidden rounded-md border border-black/60">
                            {chips.map((c, i) => {
                              const selected = amount === c.toString();
                              return (
                                <button
                                  key={c.toString()}
                                  type="button"
                                  disabled={
                                    game.isSending || game.status !== "idle"
                                  }
                                  onClick={() => setAmount(c.toString())}
                                  className={`flex-1 cursor-pointer px-2 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                    i > 0 ? "border-l border-black/60" : ""
                                  } ${
                                    selected
                                      ? "bg-gold/20 text-gold"
                                      : "bg-white/5 hover:bg-white/10"
                                  }`}
                                >
                                  {diamondString(c)}
                                </button>
                              );
                            })}
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
                              className="flex-1 cursor-pointer border-l border-black/60 bg-gold/10 px-2 py-1.5 text-xs font-bold text-gold transition hover:bg-gold/20 disabled:opacity-50"
                            >
                              MAX
                            </button>
                          </div>
                        </div>

                        {/* Circular cabinet spin button */}
                        <button
                          onClick={handleSpin}
                          disabled={!canBet}
                          className="font-display size-20 shrink-0 cursor-pointer rounded-full text-xs font-black tracking-widest text-gold-foreground transition disabled:pointer-events-none disabled:opacity-40"
                          style={{
                            background:
                              "radial-gradient(circle at 35% 30%, #ffe9a8 0%, #ffc057 45%, #b07000 100%)",
                            boxShadow: canBet
                              ? "0 0 26px rgba(255,192,87,0.55), inset 0 -4px 10px rgba(0,0,0,0.35), inset 0 3px 8px rgba(255,255,255,0.45)"
                              : "inset 0 -4px 10px rgba(0,0,0,0.35)",
                          }}
                        >
                          {game.isSending ? "…" : "SPIN"}
                        </button>
                      </div>
                    </div>
                  }
                />
              </div>
              <ControlRail
                turbo={turbo}
                onToggleTurbo={() => setTurbo((t) => !t)}
                onOpenPaytable={() => setPaytableOpen(true)}
                onOpenFairModal={() => setFairModalOpen(true)}
              />
            </div>

            {errors.length > 0 && !needsBuyIn && (
              <ul className="space-y-1 text-xs text-destructive">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            {game.status === "awaitingOracle" && (
              <div className="rounded-lg border border-border-low bg-cream/50 px-4 py-3 text-sm">
                <p className="font-medium">Waiting for the VRF oracle…</p>
                <p className="mt-0.5 text-xs text-muted">
                  Your randomness request is being fulfilled (~5s). Your stake
                  is escrowed in the house treasury.
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
              <div className="rounded-lg border border-orange/30 bg-orange/5 px-4 py-3 text-sm">
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
                  className="mt-2 cursor-pointer rounded-lg border border-border-low bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                >
                  {game.isSending ? "Refunding…" : "Refund stake"}
                </button>
              </div>
            )}

            {game.status === "resolved" && outcome && (
              <div
                className={`rounded-lg border px-4 py-4 text-center ${
                  outcome.win
                    ? "border-gold/30 bg-gold/5 shadow-[0_0_24px_rgba(255,192,87,0.12)]"
                    : "border-border-low bg-cream/50"
                }`}
              >
                <p className="text-xs uppercase tracking-wide text-muted">
                  {outcome.win ? "You won" : "You lost"}
                </p>
                <p className="mt-2 flex items-center justify-center gap-1.5">
                  {outcome.symbols.map((s, i) => (
                    <span
                      key={i}
                      className={
                        s === outcome.bestSymbol && outcome.win
                          ? "rounded-md bg-gold/20 p-1 ring-1 ring-gold/60"
                          : "p-1 opacity-45"
                      }
                    >
                      <SlotSymbol index={s} className="size-8" />
                    </span>
                  ))}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {outcome.win
                    ? `${outcome.bestCount}× ${SLOT_SYMBOLS[outcome.bestSymbol].name} · ${(Number(outcome.multiplierBp) / 100).toFixed(1)}x payout · ${diamondString(lamportsToDiamonds(payoutLamports!))} 💎`
                    : "No matching symbols this spin."}
                </p>
                <button
                  onClick={game.reset}
                  className="mt-3 cursor-pointer rounded-lg bg-gold px-4 py-2 text-sm font-medium text-gold-foreground transition hover:brightness-110"
                >
                  Play again
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!needsBuyIn && (
                <button
                  type="button"
                  onClick={() => setCashierOpen((o) => !o)}
                  className="cursor-pointer rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/20"
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
          </div>
        )}

        <Paytable open={paytableOpen} onClose={() => setPaytableOpen(false)} />
        <ProvablyFairModal
          open={fairModalOpen}
          onClose={() => setFairModalOpen(false)}
          rtpLabel={`${(SLOTS_RTP * 100).toFixed(1)}%`}
          houseEdgeLabel={`${((1 - SLOTS_RTP) * 100).toFixed(1)}%`}
          weights={{
            reels: SLOTS_REELS,
            symbols: SLOT_SYMBOLS,
            rtp: SLOTS_RTP,
          }}
        />
      </div>
    </div>
  );
}
