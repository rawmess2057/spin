import { bytesToBase58 } from "./util";

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

export type RequestStateData = "Pending" | "Fulfilled";

export type RequestAccountData = {
  bump: number;
  slot: bigint;
  client: string;
  seed: Uint8Array;
  state: RequestStateData;
  randomness?: Uint8Array;
};

function pubkeySlice(d: Uint8Array, off: number): string {
  return bytesToBase58(d.slice(off, off + 32));
}

function u64At(d: Uint8Array, off: number): bigint {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(
    off,
    true
  );
}

function u16At(d: Uint8Array, off: number): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(
    off,
    true
  );
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
    bump: d[off + 90],
  };
}

export function parseNetworkState(d: Uint8Array): NetworkStateData {
  const off = 8;
  const bump = d[off];
  const authority = pubkeySlice(d, off + 1);
  const treasury = pubkeySlice(d, off + 33);
  const requestFee = u64At(d, off + 65);
  const callbackDeadline = u64At(d, off + 73);
  const vecLen = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(
    off + 81,
    true
  );
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
