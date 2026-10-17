import { sha256 } from "@noble/hashes/sha2.js";
import { getBase58Encoder, getBase64Encoder, type Address } from "@solana/kit";
import { bytesToHex } from "./fairness";
import {
  getDepositInstructionDataDecoder,
  getPlaceBetInstructionDataDecoder,
  getSetDelegateInstructionDataDecoder,
  getWithdrawInstructionDataDecoder,
  identifySpinInstruction,
  SpinInstruction,
  SPIN_PROGRAM_ADDRESS,
} from "./generated/spin";

/**
 * Reads what a confirmed transaction did to a player's vault, from the
 * program's instruction data (Codama decoders) and its emitted events
 * (`Program data:` log lines; Codama doesn't render event decoders, so the
 * fixed-size layouts from programs/spin/src/instructions/bet.rs and
 * vault.rs are decoded by hand here).
 */

export type ActivityKind =
  "deposit" | "withdraw" | "bet" | "settled" | "refund" | "session" | "other";

export type ActivityRow = {
  signature: string;
  blockTime: number | null;
  kind: ActivityKind;
  /** Signed change to the vault balance in lamports (0 when none). */
  lamports: bigint;
  gameId?: number;
  /** Game-specific roll for settled bets. */
  roll?: bigint;
  err: boolean;
};

type RawInstruction = {
  programIdIndex: number;
  accounts: readonly number[];
  data: string;
};
export type RawTransaction = {
  blockTime?: number | bigint | null;
  meta: { err: unknown; logMessages?: readonly string[] | null } | null;
  transaction: {
    message: {
      accountKeys: readonly (string | { pubkey: string })[];
      instructions: readonly RawInstruction[];
    };
  };
};

const base58 = getBase58Encoder();
const base64 = getBase64Encoder();

function eventDiscriminator(name: string): string {
  return bytesToHex(
    sha256(new TextEncoder().encode(`event:${name}`)).slice(0, 8)
  );
}
const EVENT = {
  BetSettled: eventDiscriminator("BetSettled"),
  BetCancelled: eventDiscriminator("BetCancelled"),
  CreditsDeposited: eventDiscriminator("CreditsDeposited"),
  CreditsWithdrawn: eventDiscriminator("CreditsWithdrawn"),
};

const u64 = (d: Uint8Array, o: number) =>
  new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);

export type BetSettledEvent = {
  player: Uint8Array;
  nonce: bigint;
  seq: bigint;
  gameId: number;
  amount: bigint;
  target: bigint;
  reveal: Uint8Array;
  revealIndex: bigint;
  roll: bigint;
  multiplierBp: bigint;
  payout: bigint;
};

/** Decodes every program event in a transaction's logs. */
export function decodeEvents(logs: readonly string[] | null | undefined): {
  settled: BetSettledEvent[];
  cancelled: { amount: bigint }[];
  deposited: { amount: bigint }[];
  withdrawn: { amount: bigint }[];
} {
  const out = {
    settled: [] as BetSettledEvent[],
    cancelled: [] as { amount: bigint }[],
    deposited: [] as { amount: bigint }[],
    withdrawn: [] as { amount: bigint }[],
  };
  for (const line of logs ?? []) {
    if (!line.startsWith("Program data: ")) continue;
    let d: Uint8Array;
    try {
      d = Uint8Array.from(base64.encode(line.slice("Program data: ".length)));
    } catch {
      continue;
    }
    if (d.length < 8) continue;
    const disc = bytesToHex(d.slice(0, 8));
    if (
      disc === EVENT.BetSettled &&
      d.length >= 8 + 32 + 8 + 8 + 1 + 8 + 8 + 32 + 8 + 8 + 8 + 8
    ) {
      let o = 8;
      const player = d.slice(o, o + 32);
      o += 32;
      const nonce = u64(d, o);
      o += 8;
      const seq = u64(d, o);
      o += 8;
      const gameId = d[o];
      o += 1;
      const amount = u64(d, o);
      o += 8;
      const target = u64(d, o);
      o += 8;
      const reveal = d.slice(o, o + 32);
      o += 32;
      const revealIndex = u64(d, o);
      o += 8;
      const roll = u64(d, o);
      o += 8;
      const multiplierBp = u64(d, o);
      o += 8;
      const payout = u64(d, o);
      out.settled.push({
        player,
        nonce,
        seq,
        gameId,
        amount,
        target,
        reveal,
        revealIndex,
        roll,
        multiplierBp,
        payout,
      });
    } else if (disc === EVENT.BetCancelled && d.length >= 8 + 32 + 8 + 8 + 8) {
      out.cancelled.push({ amount: u64(d, 8 + 32 + 8 + 8) });
    } else if (disc === EVENT.CreditsDeposited && d.length >= 8 + 32 + 8) {
      out.deposited.push({ amount: u64(d, 8 + 32) });
    } else if (disc === EVENT.CreditsWithdrawn && d.length >= 8 + 32 + 8) {
      out.withdrawn.push({ amount: u64(d, 8 + 32) });
    }
  }
  return out;
}

function keyAt(tx: RawTransaction, index: number): string | null {
  const k = tx.transaction.message.accountKeys[index];
  if (k == null) return null;
  return typeof k === "string" ? k : k.pubkey;
}

/** Summarises one transaction as vault activity rows (usually one). */
export function activityFromTransaction(
  signature: string,
  tx: RawTransaction,
  program: Address = SPIN_PROGRAM_ADDRESS
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  const blockTime = tx.blockTime == null ? null : Number(tx.blockTime);
  const err = tx.meta?.err != null;
  const events = decodeEvents(tx.meta?.logMessages);
  let settledIdx = 0;
  let cancelledIdx = 0;

  for (const ix of tx.transaction.message.instructions) {
    if (keyAt(tx, ix.programIdIndex) !== program) continue;
    let data: Uint8Array;
    try {
      data = Uint8Array.from(base58.encode(ix.data));
    } catch {
      continue;
    }
    let kind: SpinInstruction;
    try {
      kind = identifySpinInstruction(data);
    } catch {
      rows.push({ signature, blockTime, kind: "other", lamports: 0n, err });
      continue;
    }
    switch (kind) {
      case SpinInstruction.Deposit: {
        const { amount } = getDepositInstructionDataDecoder().decode(data);
        rows.push({
          signature,
          blockTime,
          kind: "deposit",
          lamports: amount,
          err,
        });
        break;
      }
      case SpinInstruction.Withdraw: {
        const { amount } = getWithdrawInstructionDataDecoder().decode(data);
        rows.push({
          signature,
          blockTime,
          kind: "withdraw",
          lamports: -amount,
          err,
        });
        break;
      }
      case SpinInstruction.PlaceBet: {
        const { amount, gameId } =
          getPlaceBetInstructionDataDecoder().decode(data);
        rows.push({
          signature,
          blockTime,
          kind: "bet",
          lamports: -amount,
          gameId,
          err,
        });
        break;
      }
      case SpinInstruction.SettleBet: {
        const ev = events.settled[settledIdx++];
        rows.push({
          signature,
          blockTime,
          kind: "settled",
          lamports: ev?.payout ?? 0n,
          gameId: ev?.gameId,
          roll: ev?.roll,
          err,
        });
        break;
      }
      case SpinInstruction.CancelBet: {
        const ev = events.cancelled[cancelledIdx++];
        rows.push({
          signature,
          blockTime,
          kind: "refund",
          lamports: ev?.amount ?? 0n,
          err,
        });
        break;
      }
      case SpinInstruction.SetDelegate:
      case SpinInstruction.RevokeDelegate: {
        if (kind === SpinInstruction.SetDelegate) {
          getSetDelegateInstructionDataDecoder().decode(data);
        }
        rows.push({ signature, blockTime, kind: "session", lamports: 0n, err });
        break;
      }
      default:
        rows.push({ signature, blockTime, kind: "other", lamports: 0n, err });
    }
  }
  return rows;
}
