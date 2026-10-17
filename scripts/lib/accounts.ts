/** Borsh decoders for the spin program's accounts (v2 layouts). */
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha256";
import type { Address } from "@solana/kit";
import type { RpcBundle } from "./util.js";

export type HouseTreasuryData = { authority: string; paused: boolean; bump: number };

export type GameConfigData = {
  gameId: number;
  minBet: bigint;
  maxBet: bigint;
  paused: boolean;
  bump: number;
};

export type PlayerSessionData = {
  player: string;
  wagered: bigint;
  won: bigint;
  bets: bigint;
  bump: number;
};

export type PlayerVaultData = {
  player: string;
  balance: bigint;
  delegate: string;
  delegateExpiry: bigint;
  delegateSpendLeft: bigint;
  bump: number;
};

export type CreditLedgerData = { total: bigint; reserved: bigint; bump: number };

export type ChainStateData = {
  house: string;
  epoch: bigint;
  genesis: Uint8Array;
  commitment: Uint8Array;
  index: bigint;
  length: bigint;
  nextSeq: bigint;
  cursor: bigint;
  stalls: bigint;
  active: boolean;
  bump: number;
};

export type BetStatus = "None" | "Open" | "Settled" | "Cancelled";
export const BET_STATUS: readonly BetStatus[] = ["None", "Open", "Settled", "Cancelled"];

export type BetStateData = {
  player: string;
  nonce: bigint;
  seq: bigint;
  chainEpoch: bigint;
  gameId: number;
  status: BetStatus;
  amount: bigint;
  target: bigint;
  clientSeed: Uint8Array;
  reserved: bigint;
  placedSlot: bigint;
  indexAtPlace: bigint;
  commitment: Uint8Array;
  reveal: Uint8Array;
  revealIndex: bigint;
  roll: bigint;
  payout: bigint;
  settledSlot: bigint;
  bump: number;
};

/** Anchor account discriminator: sha256("account:<Name>")[..8]. */
export function accountDiscriminator(name: string): Uint8Array {
  return sha256(`account:${name}`).slice(0, 8);
}

/** Byte offset of `status` inside BetState (after the discriminator). */
export const BET_STATUS_OFFSET = 8 + 32 + 8 + 8 + 8 + 1;
export const BET_STATE_SIZE = 235;

export type RpcAccount = {
  lamports: bigint;
  owner: string;
  data: Uint8Array | null;
  executable: boolean;
};

const pubkeySlice = (d: Uint8Array, off: number) => bs58.encode(d.slice(off, off + 32));
const view = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);
const u64At = (d: Uint8Array, off: number) => view(d).getBigUint64(off, true);

export function parseHouseTreasury(d: Uint8Array): HouseTreasuryData {
  return { authority: pubkeySlice(d, 8), paused: d[40] === 1, bump: d[41] };
}

export function parseGameConfig(d: Uint8Array): GameConfigData {
  return {
    gameId: d[8],
    minBet: u64At(d, 9),
    maxBet: u64At(d, 17),
    paused: d[25] === 1,
    bump: d[26],
  };
}

export function parsePlayerSession(d: Uint8Array): PlayerSessionData {
  return {
    player: pubkeySlice(d, 8),
    wagered: u64At(d, 40),
    won: u64At(d, 48),
    bets: u64At(d, 56),
    bump: d[64],
  };
}

export function parsePlayerVault(d: Uint8Array): PlayerVaultData {
  return {
    player: pubkeySlice(d, 8),
    balance: u64At(d, 40),
    delegate: pubkeySlice(d, 48),
    delegateExpiry: u64At(d, 80),
    delegateSpendLeft: u64At(d, 88),
    bump: d[96],
  };
}

export function parseCreditLedger(d: Uint8Array): CreditLedgerData {
  return { total: u64At(d, 8), reserved: u64At(d, 16), bump: d[24] };
}

export function parseChainState(d: Uint8Array): ChainStateData {
  let o = 8;
  const house = pubkeySlice(d, o); o += 32;
  const epoch = u64At(d, o); o += 8;
  const genesis = d.slice(o, o + 32); o += 32;
  const commitment = d.slice(o, o + 32); o += 32;
  const index = u64At(d, o); o += 8;
  const length = u64At(d, o); o += 8;
  const nextSeq = u64At(d, o); o += 8;
  const cursor = u64At(d, o); o += 8;
  const stalls = u64At(d, o); o += 8;
  const active = d[o] === 1; o += 1;
  return { house, epoch, genesis, commitment, index, length, nextSeq, cursor, stalls, active, bump: d[o] };
}

export function parseBetState(d: Uint8Array): BetStateData {
  let o = 8;
  const player = pubkeySlice(d, o); o += 32;
  const nonce = u64At(d, o); o += 8;
  const seq = u64At(d, o); o += 8;
  const chainEpoch = u64At(d, o); o += 8;
  const gameId = d[o]; o += 1;
  const status = BET_STATUS[d[o]] ?? "None"; o += 1;
  const amount = u64At(d, o); o += 8;
  const target = u64At(d, o); o += 8;
  const clientSeed = d.slice(o, o + 32); o += 32;
  const reserved = u64At(d, o); o += 8;
  const placedSlot = u64At(d, o); o += 8;
  const indexAtPlace = u64At(d, o); o += 8;
  const commitment = d.slice(o, o + 32); o += 32;
  const reveal = d.slice(o, o + 32); o += 32;
  const revealIndex = u64At(d, o); o += 8;
  const roll = u64At(d, o); o += 8;
  const payout = u64At(d, o); o += 8;
  const settledSlot = u64At(d, o); o += 8;
  return {
    player, nonce, seq, chainEpoch, gameId, status, amount, target, clientSeed, reserved,
    placedSlot, indexAtPlace, commitment, reveal, revealIndex, roll, payout, settledSlot,
    bump: d[o],
  };
}

function decodeData(dataRaw: unknown): Uint8Array | null {
  const b64 = Array.isArray(dataRaw) ? (dataRaw[0] as string) : (dataRaw as string);
  return typeof b64 === "string" && b64 !== ""
    ? Uint8Array.from(Buffer.from(b64, "base64"))
    : null;
}

export async function fetchAccount(bundle: RpcBundle, address: string): Promise<RpcAccount | null> {
  const { value } = await bundle.rpc
    .getAccountInfo(address as Address, { encoding: "base64", commitment: bundle.commitment })
    .send();
  if (value === null) return null;
  return {
    lamports: value.lamports,
    owner: value.owner,
    data: decodeData(value.data),
    executable: value.executable,
  };
}

/** All accounts of one Anchor type owned by the program, optionally filtered. */
export async function fetchProgramAccounts(
  bundle: RpcBundle,
  programId: string,
  discriminatorName: string,
  extraFilters: { offset: number; bytes: Uint8Array }[] = [],
): Promise<{ address: string; data: Uint8Array }[]> {
  const filters = [
    { memcmp: { offset: 0n, bytes: bs58.encode(accountDiscriminator(discriminatorName)), encoding: "base58" as const } },
    ...extraFilters.map((f) => ({
      memcmp: { offset: BigInt(f.offset), bytes: bs58.encode(f.bytes), encoding: "base58" as const },
    })),
  ];
  const result = await bundle.rpc
    .getProgramAccounts(programId as Address, {
      encoding: "base64",
      commitment: bundle.commitment,
      filters,
    } as never)
    .send();
  const out: { address: string; data: Uint8Array }[] = [];
  for (const entry of result as unknown as { pubkey: string; account: { data: unknown } }[]) {
    const data = decodeData(entry.account.data);
    if (data) out.push({ address: entry.pubkey, data });
  }
  return out;
}
