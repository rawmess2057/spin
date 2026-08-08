import {
  AccountRole,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import bs58 from "bs58";
import { PROGRAM_ID, SEEDS, VRF_PROGRAM_ID } from "./config.js";
import { concatBytes, ixDiscriminator, u16Le, u64Le, u8 } from "./util.js";

export type AccountMetaInput = {
  address: string;
  role: AccountRole;
};

export function decodeAddress(addr: string): Uint8Array {
  const b = bs58.decode(addr);
  if (b.length !== 32) throw new Error(`bad address: ${addr} (${b.length} bytes)`);
  return new Uint8Array(b);
}

export async function pda(program: string, seeds: Uint8Array[]): Promise<string> {
  const [address] = await getProgramDerivedAddress({
    programAddress: program as Address,
    seeds,
  });
  return address;
}

export async function houseAddress(): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.HOUSE)]);
}

export async function vrfStateAddress(): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.VRF_STATE)]);
}

export async function gameConfigAddress(gameId: number): Promise<string> {
  return pda(PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.GAME_CONFIG),
    Uint8Array.of(gameId),
  ]);
}

export async function pendingAddress(seed: Uint8Array): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.PENDING), seed]);
}

export async function sessionAddress(player: string): Promise<string> {
  return pda(PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.SESSION),
    decodeAddress(player),
  ]);
}

export async function vaultAddress(player: string): Promise<string> {
  return pda(PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.VAULT),
    decodeAddress(player),
  ]);
}

export async function creditsAddress(): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.CREDITS)]);
}

export async function networkStateAddress(): Promise<string> {
  return pda(VRF_PROGRAM_ID, [new TextEncoder().encode(SEEDS.VRF_CONFIG)]);
}

export async function clientAddress(state: string): Promise<string> {
  return pda(VRF_PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.VRF_CLIENT),
    decodeAddress(PROGRAM_ID),
    decodeAddress(state),
  ]);
}

export async function requestAddress(client: string, seed: Uint8Array): Promise<string> {
  return pda(VRF_PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.VRF_REQUEST),
    decodeAddress(client),
    seed,
  ]);
}

// ---------------------------------------------------------------------------
// Neon Slots outcome math (mirror of the on-chain `slots_eval`).
// ---------------------------------------------------------------------------

export const SLOTS_REELS = 5;
export const SLOTS_SYMBOLS = 10;
export const SLOTS_BASE_BP = [
  20_000n, 30_000n, 40_000n, 50_000n, 60_000n, 80_000n, 100_000n, 140_000n,
  180_000n, 260_000n,
] as const;
export const SLOTS_X4 = 4n;
export const SLOTS_X5 = 20n;
export const SLOTS_MAX_MULTIPLIER_BP = 1_000_000n;

function u64LeFromBytes(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] ?? 0);
  return v;
}

export type SlotsEval = {
  multiplierBp: bigint;
  raw: bigint;
  symbols: number[];
  bestSymbol: number;
  bestCount: number;
  win: boolean;
};

/** Mirrors `slots_eval` in programs/spin/src/instructions/bet.rs. */
export function slotsEval(randomness: Uint8Array): SlotsEval {
  const raw = u64LeFromBytes(randomness.subarray(0, 8));
  const symbols = Array.from({ length: SLOTS_REELS }, (_, i) =>
    Number((raw / 10n ** BigInt(i)) % BigInt(SLOTS_SYMBOLS)),
  );
  const counts = new Array<number>(SLOTS_SYMBOLS).fill(0);
  for (const s of symbols) counts[s] += 1;
  let best = 0;
  let bestCount = 0;
  counts.forEach((c, s) => {
    if (c >= bestCount) {
      best = s;
      bestCount = c;
    }
  });
  let multiplierBp = 0n;
  if (bestCount >= 3) {
    const x = bestCount === 5 ? SLOTS_X5 : bestCount === 4 ? SLOTS_X4 : 1n;
    multiplierBp = SLOTS_BASE_BP[best] * x;
    if (multiplierBp > SLOTS_MAX_MULTIPLIER_BP) {
      multiplierBp = SLOTS_MAX_MULTIPLIER_BP;
    }
  }
  return { multiplierBp, raw, symbols, bestSymbol: best, bestCount, win: multiplierBp > 0n };
}

// ---------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------

export type SpinInstruction = {
  programAddress: string;
  accounts: readonly AccountMetaInput[];
  data: Uint8Array;
};

function ix(name: string, accounts: readonly AccountMetaInput[], args: Uint8Array[] = []): SpinInstruction {
  return {
    programAddress: PROGRAM_ID,
    accounts,
    data: concatBytes(ixDiscriminator(name), ...args),
  };
}

export function systemProgram(): string {
  return "11111111111111111111111111111111";
}

// init_config: authority, treasury, vrf_state, system_program
export async function initConfigIx(authority: string): Promise<SpinInstruction> {
  return ix("init_config", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: await vrfStateAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ]);
}

// init_game_config(game_id, min_bet, max_bet, house_edge_bp, params):
//   authority, treasury, config, system_program
export async function initGameConfigIx(
  authority: string,
  gameId: number,
  minBet: bigint,
  maxBet: bigint,
  houseEdgeBp: number,
  params: Uint8Array,
): Promise<SpinInstruction> {
  if (params.length !== 32) throw new Error("params must be 32 bytes");
  return ix("init_game_config", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.READONLY },
    { address: await gameConfigAddress(gameId), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u8(gameId), u64Le(minBet), u64Le(maxBet), u16Le(houseEdgeBp), params]);
}

// set_paused(paused): treasury, authority
export async function setPausedIx(authority: string, paused: boolean): Promise<SpinInstruction> {
  return ix("set_paused", [
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: authority, role: AccountRole.READONLY_SIGNER },
  ], [new Uint8Array([paused ? 1 : 0])]);
}

// treasury_deposit(amount): authority, treasury, system_program
export async function treasuryDepositIx(authority: string, amount: bigint): Promise<SpinInstruction> {
  return ix("treasury_deposit", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u64Le(amount)]);
}

// treasury_withdraw(amount): authority, treasury, system_program
export async function treasuryWithdrawIx(authority: string, amount: bigint): Promise<SpinInstruction> {
  return ix("treasury_withdraw", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u64Le(amount)]);
}

// place_bet(game_id, amount, target, seed):
//   player, treasury, session, config, vrf_state, pending,
//   client, network_state, vrf_treasury, request, system_program
/**
 * `authority` signs and pays: either the player themselves or the session key
 * they authorized with `set_delegate`. The stake comes out of the player's
 * credit vault, not their wallet.
 */
export async function placeBetIx(
  player: string,
  seed: Uint8Array,
  gameId: number,
  amount: bigint,
  target: bigint,
  vrfTreasury: string,
  authority: string = player,
): Promise<SpinInstruction> {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const treasury = await houseAddress();
  const vrfState = await vrfStateAddress();
  const client = await clientAddress(vrfState);
  const networkState = await networkStateAddress();
  const request = await requestAddress(client, seed);
  return ix("place_bet", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: player, role: AccountRole.READONLY },
    { address: treasury, role: AccountRole.WRITABLE },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: await sessionAddress(player), role: AccountRole.WRITABLE },
    { address: await gameConfigAddress(gameId), role: AccountRole.READONLY },
    { address: vrfState, role: AccountRole.WRITABLE },
    { address: await pendingAddress(seed), role: AccountRole.WRITABLE },
    { address: client, role: AccountRole.WRITABLE },
    { address: networkState, role: AccountRole.WRITABLE },
    { address: vrfTreasury, role: AccountRole.WRITABLE },
    { address: request, role: AccountRole.WRITABLE },
    { address: VRF_PROGRAM_ID, role: AccountRole.READONLY },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u8(gameId), u64Le(amount), u64Le(target), seed]);
}

// refund_spin(seed): authority, rent_payer, vault, credits, client, vrf_state,
// network_state, request, treasury, system_program, pending
export async function refundSpinIx(
  player: string,
  seed: Uint8Array,
  authority: string = player,
  rentPayer: string = authority,
): Promise<SpinInstruction> {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const vrfState = await vrfStateAddress();
  const client = await clientAddress(vrfState);
  return ix("refund_spin", [
    { address: authority, role: AccountRole.READONLY_SIGNER },
    { address: rentPayer, role: AccountRole.WRITABLE },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: client, role: AccountRole.READONLY },
    { address: vrfState, role: AccountRole.READONLY },
    { address: await networkStateAddress(), role: AccountRole.READONLY },
    { address: await requestAddress(client, seed), role: AccountRole.WRITABLE },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
    { address: await pendingAddress(seed), role: AccountRole.WRITABLE },
  ], [seed]);
}

// ---------------------------------------------------------------------------
// Credit vault
// ---------------------------------------------------------------------------

export async function initCreditsIx(authority: string): Promise<SpinInstruction> {
  return ix("init_credits", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.READONLY },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], []);
}

export async function depositIx(player: string, amount: bigint): Promise<SpinInstruction> {
  return ix("deposit", [
    { address: player, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u64Le(amount)]);
}

export async function withdrawIx(player: string, amount: bigint): Promise<SpinInstruction> {
  return ix("withdraw", [
    { address: player, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u64Le(amount)]);
}

export async function setDelegateIx(
  player: string,
  delegate: string,
  expirySlot: bigint,
  spendLimit: bigint,
): Promise<SpinInstruction> {
  return ix("set_delegate", [
    { address: player, role: AccountRole.WRITABLE_SIGNER },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
  ], [decodeAddress(delegate), u64Le(expirySlot), u64Le(spendLimit)]);
}

export async function revokeDelegateIx(player: string): Promise<SpinInstruction> {
  return ix("revoke_delegate", [
    { address: player, role: AccountRole.WRITABLE_SIGNER },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
  ], []);
}