import {
  AccountRole,
  getProgramDerivedAddress,
  type AccountMeta,
  type Address,
  type Instruction,
  type Rpc,
  type GetAccountInfoApi,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";
import { parseNetworkState, type NetworkStateData } from "./accounts";
import { PROGRAM_ID, SEEDS, SYSTEM_PROGRAM_ID, VRF_PROGRAM_ID } from "./config";
import {
  base58ToBytes,
  base64ToBytes,
  concatBytes,
  ixDiscriminator,
  seedBytes,
  u8,
  u64Le,
} from "./util";

export type SpinInstruction = Instruction & {
  accounts: readonly AccountMeta[];
  data: ReadonlyUint8Array;
};

async function pda(program: string, seeds: Uint8Array[]): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: program as Address,
    seeds,
  });
  return address;
}

export async function houseAddress(): Promise<Address> {
  return pda(PROGRAM_ID, [seedBytes(SEEDS.HOUSE)]);
}

export async function vrfStateAddress(): Promise<Address> {
  return pda(PROGRAM_ID, [seedBytes(SEEDS.VRF_STATE)]);
}

export async function gameConfigAddress(gameId: number): Promise<Address> {
  return pda(PROGRAM_ID, [seedBytes(SEEDS.GAME_CONFIG), Uint8Array.of(gameId)]);
}

export async function pendingAddress(seed: Uint8Array): Promise<Address> {
  return pda(PROGRAM_ID, [seedBytes(SEEDS.PENDING), seed]);
}

export async function sessionAddress(player: string): Promise<Address> {
  return pda(PROGRAM_ID, [seedBytes(SEEDS.SESSION), base58ToBytes(player)]);
}

export async function networkStateAddress(): Promise<Address> {
  return pda(VRF_PROGRAM_ID, [seedBytes(SEEDS.VRF_CONFIG)]);
}

export async function clientAddress(state: string): Promise<Address> {
  return pda(VRF_PROGRAM_ID, [
    seedBytes(SEEDS.VRF_CLIENT),
    base58ToBytes(PROGRAM_ID),
    base58ToBytes(state),
  ]);
}

export async function requestAddress(
  client: string,
  seed: Uint8Array
): Promise<Address> {
  return pda(VRF_PROGRAM_ID, [
    seedBytes(SEEDS.VRF_REQUEST),
    base58ToBytes(client),
    seed,
  ]);
}

/** Fetches and decodes the ORAO network state; throws if the PDA is missing. */
export async function fetchNetworkState(
  rpc: Rpc<GetAccountInfoApi>,
  address: Address
): Promise<NetworkStateData> {
  const { value } = await rpc
    .getAccountInfo(address, { encoding: "base64", commitment: "confirmed" })
    .send();
  if (value === null) {
    throw new Error("ORAO network state not found");
  }
  const dataRaw = value.data;
  const b64 = Array.isArray(dataRaw) ? dataRaw[0] : dataRaw;
  if (!b64) {
    throw new Error("ORAO network state account has no data");
  }
  return parseNetworkState(base64ToBytes(b64));
}

export type PlaceBetInput = {
  player: TransactionSigner;
  gameId: number;
  amount: bigint;
  target: bigint;
  seed: Uint8Array;
};

export async function getPlaceBetInstruction(
  rpc: Rpc<GetAccountInfoApi>,
  input: PlaceBetInput
): Promise<SpinInstruction> {
  const { player, gameId, amount, target, seed } = input;
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");

  const treasury = await houseAddress();
  const vrfState = await vrfStateAddress();
  const session = await sessionAddress(player.address);
  const config = await gameConfigAddress(gameId);
  const pending = await pendingAddress(seed);
  const client = await clientAddress(vrfState);
  const networkState = await networkStateAddress();
  const request = await requestAddress(client, seed);

  const ns = await fetchNetworkState(rpc, networkState);

  const data = concatBytes(
    await ixDiscriminator("place_bet"),
    u8(gameId),
    u64Le(amount),
    u64Le(target),
    seed
  );

  return {
    programAddress: PROGRAM_ID as Address,
    accounts: [
      { address: player.address, role: AccountRole.WRITABLE_SIGNER },
      { address: treasury, role: AccountRole.WRITABLE },
      { address: session, role: AccountRole.WRITABLE },
      { address: config, role: AccountRole.READONLY },
      { address: vrfState, role: AccountRole.WRITABLE },
      { address: pending, role: AccountRole.WRITABLE },
      { address: client, role: AccountRole.WRITABLE },
      { address: networkState, role: AccountRole.WRITABLE },
      { address: ns.treasury as Address, role: AccountRole.WRITABLE },
      { address: request, role: AccountRole.WRITABLE },
      { address: VRF_PROGRAM_ID as Address, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID as Address, role: AccountRole.READONLY },
    ],
    data,
  };
}

export type RefundSpinInput = {
  player: TransactionSigner;
  seed: Uint8Array;
};

export async function getRefundSpinInstruction(
  rpc: Rpc<GetAccountInfoApi>,
  input: RefundSpinInput
): Promise<SpinInstruction> {
  const { player, seed } = input;
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");

  const vrfState = await vrfStateAddress();
  const client = await clientAddress(vrfState);
  const networkState = await networkStateAddress();
  const request = await requestAddress(client, seed);
  const treasury = await houseAddress();
  const pending = await pendingAddress(seed);

  const data = concatBytes(await ixDiscriminator("refund_spin"), seed);

  return {
    programAddress: PROGRAM_ID as Address,
    accounts: [
      { address: player.address, role: AccountRole.WRITABLE_SIGNER },
      { address: client, role: AccountRole.READONLY },
      { address: vrfState, role: AccountRole.READONLY },
      { address: networkState, role: AccountRole.READONLY },
      { address: request, role: AccountRole.WRITABLE },
      { address: treasury, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID as Address, role: AccountRole.READONLY },
      { address: pending, role: AccountRole.WRITABLE },
    ],
    data,
  };
}
