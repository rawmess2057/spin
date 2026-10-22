/**
 * Hand-written instruction builders for the spin program (v2 commit-reveal
 * layout). The frontend uses the Codama-generated client; these scripts stay
 * dependency-light and encode the Anchor layouts directly.
 */
import {
  AccountRole,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import bs58 from "bs58";
import { PROGRAM_ID, SEEDS } from "./config.js";
import { bool, concatBytes, ixDiscriminator, u64Le, u8 } from "./util.js";

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

const utf8 = (s: string) => new TextEncoder().encode(s);

export const houseAddress = () => pda(PROGRAM_ID, [utf8(SEEDS.HOUSE)]);
export const chainAddress = () => pda(PROGRAM_ID, [utf8(SEEDS.CHAIN)]);
export const creditsAddress = () => pda(PROGRAM_ID, [utf8(SEEDS.CREDITS)]);
export const gameConfigAddress = (gameId: number) =>
  pda(PROGRAM_ID, [utf8(SEEDS.GAME_CONFIG), Uint8Array.of(gameId)]);
export const vaultAddress = (player: string) =>
  pda(PROGRAM_ID, [utf8(SEEDS.VAULT), decodeAddress(player)]);
export const sessionAddress = (player: string) =>
  pda(PROGRAM_ID, [utf8(SEEDS.SESSION), decodeAddress(player)]);
export const betAddress = (player: string) =>
  pda(PROGRAM_ID, [utf8(SEEDS.BET), decodeAddress(player)]);

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export type SpinInstruction = {
  programAddress: string;
  accounts: readonly AccountMetaInput[];
  data: Uint8Array;
};

function ix(
  name: string,
  accounts: readonly AccountMetaInput[],
  args: Uint8Array[] = [],
): SpinInstruction {
  return {
    programAddress: PROGRAM_ID,
    accounts,
    data: concatBytes(ixDiscriminator(name), ...args),
  };
}

const W = AccountRole.WRITABLE;
const R = AccountRole.READONLY;
const WS = AccountRole.WRITABLE_SIGNER;
const RS = AccountRole.READONLY_SIGNER;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function initConfigIx(authority: string): Promise<SpinInstruction> {
  return ix("init_config", [
    { address: authority, role: WS },
    { address: await houseAddress(), role: W },
    { address: SYSTEM_PROGRAM, role: R },
  ]);
}

export async function initGameConfigIx(
  authority: string,
  gameId: number,
  minBet: bigint,
  maxBet: bigint,
): Promise<SpinInstruction> {
  return ix(
    "init_game_config",
    [
      { address: authority, role: WS },
      { address: await houseAddress(), role: R },
      { address: await gameConfigAddress(gameId), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u8(gameId), u64Le(minBet), u64Le(maxBet)],
  );
}

export async function setGameLimitsIx(
  authority: string,
  gameId: number,
  minBet: bigint,
  maxBet: bigint,
  paused: boolean,
): Promise<SpinInstruction> {
  return ix(
    "set_game_limits",
    [
      { address: authority, role: RS },
      { address: await houseAddress(), role: R },
      { address: await gameConfigAddress(gameId), role: W },
    ],
    [u64Le(minBet), u64Le(maxBet), bool(paused)],
  );
}

export async function setPausedIx(authority: string, paused: boolean): Promise<SpinInstruction> {
  return ix(
    "set_paused",
    [
      { address: await houseAddress(), role: W },
      { address: authority, role: RS },
    ],
    [bool(paused)],
  );
}

export async function treasuryDepositIx(authority: string, amount: bigint): Promise<SpinInstruction> {
  return ix(
    "treasury_deposit",
    [
      { address: authority, role: WS },
      { address: await houseAddress(), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u64Le(amount)],
  );
}

export async function treasuryWithdrawIx(authority: string, amount: bigint): Promise<SpinInstruction> {
  return ix(
    "treasury_withdraw",
    [
      { address: authority, role: WS },
      { address: await houseAddress(), role: W },
      { address: await creditsAddress(), role: R },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u64Le(amount)],
  );
}

// ---------------------------------------------------------------------------
// Credit vault
// ---------------------------------------------------------------------------

export async function initCreditsIx(authority: string, initialTotal: bigint): Promise<SpinInstruction> {
  return ix(
    "init_credits",
    [
      { address: authority, role: WS },
      { address: await houseAddress(), role: R },
      { address: await creditsAddress(), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u64Le(initialTotal)],
  );
}

export async function depositIx(player: string, amount: bigint): Promise<SpinInstruction> {
  return ix(
    "deposit",
    [
      { address: player, role: WS },
      { address: await houseAddress(), role: W },
      { address: await vaultAddress(player), role: W },
      { address: await creditsAddress(), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u64Le(amount)],
  );
}

export async function withdrawIx(player: string, amount: bigint): Promise<SpinInstruction> {
  return ix(
    "withdraw",
    [
      { address: player, role: WS },
      { address: await houseAddress(), role: W },
      { address: await vaultAddress(player), role: W },
      { address: await creditsAddress(), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u64Le(amount)],
  );
}

export async function setDelegateIx(
  player: string,
  delegate: string,
  expirySlot: bigint,
  spendLimit: bigint,
): Promise<SpinInstruction> {
  return ix(
    "set_delegate",
    [
      { address: player, role: WS },
      { address: await vaultAddress(player), role: W },
    ],
    [decodeAddress(delegate), u64Le(expirySlot), u64Le(spendLimit)],
  );
}

export async function revokeDelegateIx(player: string): Promise<SpinInstruction> {
  return ix("revoke_delegate", [
    { address: player, role: WS },
    { address: await vaultAddress(player), role: W },
  ]);
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

export async function placeBetIx(
  authority: string,
  player: string,
  gameId: number,
  amount: bigint,
  target: bigint,
  clientSeed: Uint8Array,
): Promise<SpinInstruction> {
  if (clientSeed.length !== 32) throw new Error("client seed must be 32 bytes");
  return ix(
    "place_bet",
    [
      { address: authority, role: WS },
      { address: player, role: R },
      { address: await houseAddress(), role: R },
      { address: await chainAddress(), role: W },
      { address: await gameConfigAddress(gameId), role: R },
      { address: await vaultAddress(player), role: W },
      { address: await creditsAddress(), role: W },
      { address: await sessionAddress(player), role: W },
      { address: await betAddress(player), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [u8(gameId), u64Le(amount), u64Le(target), clientSeed],
  );
}

export async function settleBetIx(
  cranker: string,
  player: string,
  reveal: Uint8Array,
): Promise<SpinInstruction> {
  if (reveal.length !== 32) throw new Error("reveal must be 32 bytes");
  return ix(
    "settle_bet",
    [
      { address: cranker, role: WS },
      { address: player, role: R },
      { address: await betAddress(player), role: W },
      { address: await chainAddress(), role: W },
      { address: await vaultAddress(player), role: W },
      { address: await creditsAddress(), role: W },
      { address: await sessionAddress(player), role: W },
    ],
    [reveal],
  );
}

export async function cancelBetIx(caller: string, player: string): Promise<SpinInstruction> {
  return ix("cancel_bet", [
    { address: caller, role: WS },
    { address: player, role: R },
    { address: await betAddress(player), role: W },
    { address: await chainAddress(), role: W },
    { address: await vaultAddress(player), role: W },
    { address: await creditsAddress(), role: W },
  ]);
}

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export async function initChainIx(
  authority: string,
  genesis: Uint8Array,
  length: bigint,
): Promise<SpinInstruction> {
  if (genesis.length !== 32) throw new Error("genesis must be 32 bytes");
  return ix(
    "init_chain",
    [
      { address: authority, role: WS },
      { address: await houseAddress(), role: R },
      { address: await chainAddress(), role: W },
      { address: SYSTEM_PROGRAM, role: R },
    ],
    [genesis, u64Le(length)],
  );
}

export async function rotateChainIx(
  authority: string,
  genesis: Uint8Array,
  length: bigint,
): Promise<SpinInstruction> {
  if (genesis.length !== 32) throw new Error("genesis must be 32 bytes");
  return ix(
    "rotate_chain",
    [
      { address: authority, role: RS },
      { address: await houseAddress(), role: R },
      { address: await chainAddress(), role: W },
    ],
    [genesis, u64Le(length)],
  );
}

export async function setChainActiveIx(authority: string, active: boolean): Promise<SpinInstruction> {
  return ix(
    "set_chain_active",
    [
      { address: authority, role: RS },
      { address: await houseAddress(), role: R },
      { address: await chainAddress(), role: W },
    ],
    [bool(active)],
  );
}

// ---------------------------------------------------------------------------
// Compute budget helpers (for the settlement crank)
// ---------------------------------------------------------------------------

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

export function setComputeUnitLimitIx(units: number): SpinInstruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}

export function setComputeUnitPriceIx(microLamports: bigint): SpinInstruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}
