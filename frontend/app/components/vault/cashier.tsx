"use client";

import { useMemo, useState } from "react";
import { sol, solToLamports, type Address } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../../lib/hooks/use-app-client";
import { useBalance } from "../../lib/hooks/use-balance";
import { useSend } from "../../lib/hooks/use-send";
import {
  DIAMOND_LAMPORTS,
  diamondString,
  lamportsToDiamonds,
} from "../../lib/diamonds";
import { solString } from "../../lib/solana/format";

/**
 * How long one wallet approval authorizes the session key for. ~2.5 slots a
 * second, so this is roughly a day.
 */
const SESSION_SLOTS = 200_000n;

/**
 * SOL sent to the session key so it can pay transaction fees. Each spin costs
 * one signature (~5,000 lamports) because `resolve_spin` returns the pending
 * account's rent, so this covers thousands of spins.
 */
const SESSION_FEE_FLOAT = 20_000_000n;

const BUY_PRESETS = [0.05, 0.1, 0.25, 0.5];

/**
 * Buy-in / cash-out panel.
 *
 * The buy-in is deliberately a single transaction that does three things —
 * fund the session key, deposit, and authorize the delegate — so the player
 * approves once and then plays without further prompts.
 */
export function Cashier({
  player,
  balance,
  sessionAddress,
  sessionReady,
  sessionExpired,
  spendLeft,
  onDone,
}: {
  player: Address;
  balance: bigint | null;
  sessionAddress: Address | null;
  sessionReady: boolean;
  sessionExpired: boolean;
  spendLeft: bigint;
  onDone?: () => void;
}) {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { run, isSending } = useSend();
  const wallet = useBalance(player);
  const [amount, setAmount] = useState("0.1");
  const [mode, setMode] = useState<"buy" | "cash">("buy");

  const amountLamports = useMemo(() => {
    try {
      return solToLamports(sol(amount as `${number}`));
    } catch {
      return null;
    }
  }, [amount]);

  const credited = balance ?? 0n;
  const canBuy =
    amountLamports != null &&
    amountLamports > 0n &&
    sessionAddress != null &&
    !isSending &&
    (wallet.lamports == null ||
      wallet.lamports > amountLamports + SESSION_FEE_FLOAT);

  const buyIn = async () => {
    if (amountLamports == null || !sessionAddress) return;
    const signer = connected?.signer;
    if (!signer) return;

    const slot = await client.rpc.getSlot().send();
    const expirySlot = BigInt(slot) + SESSION_SLOTS;

    const ok = await run(async () => {
      const [fund, deposit, delegate] = await Promise.all([
        Promise.resolve(
          getTransferSolInstruction({
            source: signer,
            destination: sessionAddress,
            amount: SESSION_FEE_FLOAT,
          })
        ),
        client.spin.instructions.deposit({
          player: signer,
          amount: amountLamports,
        }),
        client.spin.instructions.setDelegate({
          player: signer,
          delegate: sessionAddress,
          expirySlot,
          // The session may only ever wager what was just bought in.
          spendLimit: amountLamports,
        }),
      ]);
      return client.sendTransaction([fund, deposit, delegate]);
    }, "Diamonds purchased — session active");
    if (ok) onDone?.();
  };

  const cashOut = async () => {
    const signer = connected?.signer;
    if (!signer || credited <= 0n) return;
    const ok = await run(
      () =>
        client.spin.instructions
          .withdraw({ player: signer, amount: credited })
          .sendTransaction(),
      "Cashed out to your wallet"
    );
    if (ok) onDone?.();
  };

  return (
    <div className="rounded-sm border border-gold/30 bg-gold/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">
            Cashier
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-gold">
            {diamondString(lamportsToDiamonds(credited))} 💎
          </p>
          <p className="text-[10px] text-muted">
            = {solString(credited)} SOL · 1 💎 ={" "}
            {solString(DIAMOND_LAMPORTS)} SOL
          </p>
        </div>
        <div className="flex overflow-hidden rounded-sm border border-border-low">
          {(["buy", "cash"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition ${
                mode === m ? "bg-gold/20 text-gold" : "hover:bg-cream/50"
              }`}
            >
              {m === "buy" ? "Buy in" : "Cash out"}
            </button>
          ))}
        </div>
      </div>

      {mode === "buy" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Buy in (SOL)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              disabled={isSending}
              className="w-full rounded-sm border border-border-low bg-background px-3 py-2 font-mono text-sm outline-none focus:border-gold disabled:opacity-50"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BUY_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isSending}
                  onClick={() => setAmount(p.toString())}
                  className="cursor-pointer rounded-sm border border-border-low bg-cream/50 px-2.5 py-1 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
                >
                  {p} SOL
                </button>
              ))}
            </div>
            {amountLamports != null && (
              <p className="mt-2 text-xs text-muted">
                You get{" "}
                <span className="font-mono text-gold">
                  {diamondString(lamportsToDiamonds(amountLamports))} 💎
                </span>
                , plus {solString(SESSION_FEE_FLOAT)} SOL to your session key
                for transaction fees.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={buyIn}
            disabled={!canBuy}
            className="w-full cursor-pointer rounded-sm bg-gold px-4 py-2.5 text-sm font-semibold text-gold-foreground transition hover:brightness-110 disabled:opacity-40"
          >
            {isSending ? "Confirming…" : "Buy diamonds — one approval"}
          </button>
          <p className="text-[10px] leading-relaxed text-muted">
            One wallet signature deposits your SOL, funds your session key and
            authorizes it to wager up to this amount for about a day. The
            session key can never withdraw — cashing out always needs your
            wallet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Cash your full balance back to your wallet. Your session key stays
            armed for the remaining limit.
          </p>
          <button
            type="button"
            onClick={cashOut}
            disabled={isSending || credited <= 0n}
            className="w-full cursor-pointer rounded-sm border border-gold/50 bg-transparent px-4 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-40"
          >
            {isSending
              ? "Confirming…"
              : `Cash out ${solString(credited)} SOL`}
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-border-low pt-3 text-[10px] text-muted">
        {sessionAddress == null ? (
          "Preparing session key…"
        ) : sessionReady ? (
          <>
            Session active · {diamondString(lamportsToDiamonds(spendLeft))} 💎
            left to wager without a prompt
          </>
        ) : sessionExpired ? (
          "Session expired — buy in again to re-authorize."
        ) : (
          "No active session — bets will prompt your wallet until you buy in."
        )}
      </div>
    </div>
  );
}
