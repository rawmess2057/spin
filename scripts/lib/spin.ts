import {
  AccountRole,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha256";
import { PROGRAM_ID, SEEDS } from "./config.js";
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

export async function chainAddress(): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.CHAIN)]);
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

export async function vaultAddress(player: string): Promise<string> {
  return pda(PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.VAULT),
    decodeAddress(player),
  ]);
}

export async function sessionAddress(player: string): Promise<string> {
  return pda(PROGRAM_ID, [
    new TextEncoder().encode(SEEDS.SESSION),
    decodeAddress(player),
  ]);
}

export async function creditsAddress(): Promise<string> {
  return pda(PROGRAM_ID, [new TextEncoder().encode(SEEDS.CREDITS)]);
}

// ---------------------------------------------------------------------------
// Reveal chain (mirror of `chain_randomness` in the program)
// ---------------------------------------------------------------------------

/** The 64 bytes of randomness fed to the eval fns: reveal || sha256(reveal). */
export function chainRandomness(reveal: Uint8Array): Uint8Array {
  if (reveal.length !== 32) throw new Error("reveal must be 32 bytes");
  return concatBytes(reveal, sha256(reveal));
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

// ---------------------------------------------------------------------------
// Reveal chain
// ---------------------------------------------------------------------------

// init_chain(seed, length): authority, treasury, chain, system_program
export async function initChainIx(
  authority: string,
  seed: Uint8Array,
  length: bigint,
): Promise<SpinInstruction> {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  return ix("init_chain", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.READONLY },
    { address: await chainAddress(), role: AccountRole.WRITABLE },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [seed, u64Le(length)]);
}

// set_chain_mode(active, vrf_enabled): authority, treasury, chain
export async function setChainModeIx(
  authority: string,
  active: boolean,
  vrfEnabled: boolean,
): Promise<SpinInstruction> {
  return ix("set_chain_mode", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: await houseAddress(), role: AccountRole.READONLY },
    { address: await chainAddress(), role: AccountRole.WRITABLE },
  ], [new Uint8Array([active ? 1 : 0]), new Uint8Array([vrfEnabled ? 1 : 0])]);
}

// spin_chain(player, seed, game_id, amount, target, nonce, latest_index):
// authority, player, treasury, vault, credits, chain, game_config
export async function spinChainIx(
  authority: string,
  player: string,
  gameId: number,
  amount: bigint,
  target: bigint,
  reveal: Uint8Array,
): Promise<SpinInstruction> {
  if (reveal.length !== 32) throw new Error("reveal must be 32 bytes");
  return ix("spin_chain", [
    { address: authority, role: AccountRole.WRITABLE_SIGNER },
    { address: player, role: AccountRole.READONLY },
    { address: await houseAddress(), role: AccountRole.WRITABLE },
    { address: await chainAddress(), role: AccountRole.WRITABLE },
    { address: await vaultAddress(player), role: AccountRole.WRITABLE },
    { address: await creditsAddress(), role: AccountRole.WRITABLE },
    { address: await sessionAddress(player), role: AccountRole.WRITABLE },
    { address: await gameConfigAddress(gameId), role: AccountRole.READONLY },
    { address: systemProgram(), role: AccountRole.READONLY },
  ], [u8(gameId), u64Le(amount), u64Le(target), reveal]);
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