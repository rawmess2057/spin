import bs58 from "bs58";
import type { Address } from "@solana/kit";
import type { RpcBundle } from "./util.js";

export type PendingStatus = "AwaitingResolution" | "Resolved";

export type HouseTreasuryData = {
  authority: string;
  paused: boolean;
  bump: number;
};

export type GameConfigData = {
  gameId: number;
  minBet: bigint;
  maxBet: bigint;
  houseEdgeBp: number;
  params: Uint8Array;
  bump: number;
};

export type PlayerSessionData = {
  player: string;
  wagered: bigint;
  won: bigint;
  bets: bigint;
  bump: number;
};

export type PendingSpinData = {
  player: string;
  gameId: number;
  amount: bigint;
  target: bigint;
  seed: Uint8Array;
  status: PendingStatus;
  createdSlot: bigint;
  rentPayer: string;
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

export type ChainStateData = {
  house: string;
  seed: Uint8Array;
  index: bigint;
  length: bigint;
  active: boolean;
  vrfEnabled: boolean;
  bump: number;
};

export type CreditLedgerData = {
  total: bigint;
  bump: number;
};

export type NetworkStateData = {
  bump: number;
  authority: string;
  treasury: string;
  requestFee: bigint;
  callbackDeadline: bigint;
  fulfillAuthorities: string[];
  numRequests: bigint;
  numRegistered: bigint;
  numTerminated: bigint;
};

export type ClientData = {
  bump: number;
  owner: string;
  program: string;
  state: string;
  numRequests: bigint;
};

export type RequestStateData = "Pending" | "Fulfilled" | string;

export type RequestAccountData = {
  bump: number;
  slot: bigint;
  client: string;
  seed: Uint8Array;
  state: RequestStateData;
  randomness?: Uint8Array;
};

export type RpcAccount = {
  lamports: bigint;
  owner: string;
  data: Uint8Array | null;
  executable: boolean;
};

function base58(bs: Uint8Array): string {
  return bs58.encode(bs);
}

function pubkeySlice(d: Uint8Array, off: number): string {
  return base58(d.slice(off, off + 32));
}

function u64At(d: Uint8Array, off: number): bigint {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(off, true);
}

function u16At(d: Uint8Array, off: number): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(off, true);
}

// Skip the 8-byte anchor discriminator.
export function parseHouseTreasury(d: Uint8Array): HouseTreasuryData {
  const off = 8;
  return {
    authority: pubkeySlice(d, off),
    paused: d[off + 32] === 1,
    bump: d[off + 33],
  };
}

export function parseGameConfig(d: Uint8Array): GameConfigData {
  const off = 8;
  return {
    gameId: d[off],
    minBet: u64At(d, off + 1),
    maxBet: u64At(d, off + 9),
    houseEdgeBp: u16At(d, off + 17),
    params: d.slice(off + 19, off + 51),
    bump: d[off + 51],
  };
}

export function parsePlayerSession(d: Uint8Array): PlayerSessionData {
  const off = 8;
  return {
    player: pubkeySlice(d, off),
    wagered: u64At(d, off + 32),
    won: u64At(d, off + 40),
    bets: u64At(d, off + 48),
    bump: d[off + 56],
  };
}

export function parsePendingSpin(d: Uint8Array): PendingSpinData {
  const off = 8;
  const statusByte = d[off + 32 + 1 + 8 + 8 + 32];
  return {
    player: pubkeySlice(d, off),
    gameId: d[off + 32],
    amount: u64At(d, off + 33),
    target: u64At(d, off + 41),
    seed: d.slice(off + 49, off + 81),
    status: statusByte === 0 ? "AwaitingResolution" : "Resolved",
    createdSlot: u64At(d, off + 82),
    rentPayer: pubkeySlice(d, off + 90),
    bump: d[off + 122],
  };
}

export function parsePlayerVault(d: Uint8Array): PlayerVaultData {
  const off = 8;
  return {
    player: pubkeySlice(d, off),
    balance: u64At(d, off + 32),
    delegate: pubkeySlice(d, off + 40),
    delegateExpiry: u64At(d, off + 72),
    delegateSpendLeft: u64At(d, off + 80),
    bump: d[off + 88],
  };
}

export function parseChainState(d: Uint8Array): ChainStateData {
  const off = 8;
  return {
    house: pubkeySlice(d, off),
    seed: d.slice(off + 32, off + 64),
    index: u64At(d, off + 64),
    length: u64At(d, off + 72),
    active: d[off + 80] === 1,
    vrfEnabled: d[off + 81] === 1,
    bump: d[off + 82],
  };
}

export function parseCreditLedger(d: Uint8Array): CreditLedgerData {
  const off = 8;
  return { total: u64At(d, off), bump: d[off + 8] };
}

export function parseNetworkState(d: Uint8Array): NetworkStateData {
  const off = 8;
  const bump = d[off];
  const authority = pubkeySlice(d, off + 1);
  const treasury = pubkeySlice(d, off + 33);
  const requestFee = u64At(d, off + 65);
  const callbackDeadline = u64At(d, off + 73);
  const vecLen = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(off + 81, true);
  const authorities: string[] = [];
  for (let i = 0; i < vecLen; i++) {
    authorities.push(pubkeySlice(d, off + 85 + i * 32));
  }
  const tail = off + 85 + vecLen * 32;
  return {
    bump,
    authority,
    treasury,
    requestFee,
    callbackDeadline,
    fulfillAuthorities: authorities,
    numRequests: u64At(d, tail),
    numRegistered: u64At(d, tail + 8),
    numTerminated: u64At(d, tail + 16),
  };
}

export function parseClient(d: Uint8Array): ClientData {
  const off = 8;
  // bump, owner, program, state, num_requests, callback: Option<ValidatedCallback>
  const numRequests = u64At(d, off + 97);
  const optByte = d[off + 105];
  if (optByte !== 0 && optByte !== 1) {
    throw new Error(`unexpected Option tag ${optByte} in client`);
  }
  return {
    bump: d[off],
    owner: pubkeySlice(d, off + 1),
    program: pubkeySlice(d, off + 33),
    state: pubkeySlice(d, off + 65),
    numRequests,
  };
}

export function parseRequestAccount(d: Uint8Array): RequestAccountData {
  const off = 8;
  const bump = d[off];
  const slot = u64At(d, off + 1);
  const client = pubkeySlice(d, off + 9);
  const seed = d.slice(off + 41, off + 73);
  const tag = d[off + 73];
  if (tag === 0) {
    return { bump, slot, client, seed, state: "Pending" };
  }
  const randomness = d.slice(off + 74, off + 138);
  return { bump, slot, client, seed, state: "Fulfilled", randomness };
}

export async function fetchAccount(
  bundle: RpcBundle,
  address: string,
): Promise<RpcAccount | null> {
  const { value } = await bundle.rpc
    .getAccountInfo(address as Address, { encoding: "base64" })
    .send();
  if (value === null) return null;
  const dataRaw = value.data;
  const b64 = Array.isArray(dataRaw) ? (dataRaw[0] as string) : (dataRaw as string);
  const dataBytes =
    typeof b64 === "string" && b64 !== ""
      ? Uint8Array.from(Buffer.from(b64, "base64"))
      : null;
  return {
    lamports: value.lamports,
    owner: value.owner,
    data: dataBytes,
    executable: value.executable,
  };
}