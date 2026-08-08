// ORAO VRF Callback program glue. This is a third-party program with no
// Kit-native IDL available, so its PDAs and account layouts are hand-derived
// here (verified against programs/spin/src/instructions/bet.rs and
// cross-checked against the seed bytes Codama itself derived for
// generated/spin's place_bet/refund_spin instructions).
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";

export const VRF_PROGRAM_ADDRESS = address(
  "VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU"
);

const utf8 = getUtf8Encoder();
const addressCodec = getAddressEncoder();
const decodeAddress = getAddressDecoder();

export async function findVrfNetworkStatePda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: VRF_PROGRAM_ADDRESS,
    seeds: [utf8.encode("OraoVrfCbConfig")],
  });
  return pda;
}

export async function findVrfClientPda(
  spinProgramAddress: Address,
  vrfState: Address
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: VRF_PROGRAM_ADDRESS,
    seeds: [
      utf8.encode("OraoVrfCbClient"),
      addressCodec.encode(spinProgramAddress),
      addressCodec.encode(vrfState),
    ],
  });
  return pda;
}

export async function findVrfRequestPda(
  client: Address,
  seed: Uint8Array
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: VRF_PROGRAM_ADDRESS,
    seeds: [utf8.encode("OraoVrfCbRequest"), addressCodec.encode(client), seed],
  });
  return pda;
}

export type NetworkStateData = {
  bump: number;
  authority: Address;
  treasury: Address;
  requestFee: bigint;
  callbackDeadline: bigint;
  fulfillAuthorities: Address[];
  numRequests: bigint;
  numRegistered: bigint;
  numTerminated: bigint;
};

export type RequestStateData = "Pending" | "Fulfilled";

export type RequestAccountData = {
  bump: number;
  slot: bigint;
  client: Address;
  seed: Uint8Array;
  state: RequestStateData;
  randomness?: Uint8Array;
};

function view(d: Uint8Array): DataView {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}

function u64At(d: Uint8Array, off: number): bigint {
  return view(d).getBigUint64(off, true);
}

function pubkeyAt(d: Uint8Array, off: number): Address {
  return decodeAddress.decode(d.subarray(off, off + 32));
}

// Both account layouts below skip the 8-byte Anchor discriminator.
export function decodeNetworkState(d: Uint8Array): NetworkStateData {
  const off = 8;
  const bump = d[off];
  const authority = pubkeyAt(d, off + 1);
  const treasury = pubkeyAt(d, off + 33);
  const requestFee = u64At(d, off + 65);
  const callbackDeadline = u64At(d, off + 73);
  const vecLen = view(d).getUint32(off + 81, true);
  const fulfillAuthorities: Address[] = [];
  for (let i = 0; i < vecLen; i++) {
    fulfillAuthorities.push(pubkeyAt(d, off + 85 + i * 32));
  }
  const tail = off + 85 + vecLen * 32;
  return {
    bump,
    authority,
    treasury,
    requestFee,
    callbackDeadline,
    fulfillAuthorities,
    numRequests: u64At(d, tail),
    numRegistered: u64At(d, tail + 8),
    numTerminated: u64At(d, tail + 16),
  };
}

export function decodeRequestAccount(d: Uint8Array): RequestAccountData {
  const off = 8;
  const bump = d[off];
  const slot = u64At(d, off + 1);
  const client = pubkeyAt(d, off + 9);
  const seed = d.slice(off + 41, off + 73);
  const tag = d[off + 73];
  if (tag === 0) {
    return { bump, slot, client, seed, state: "Pending" };
  }
  const randomness = d.slice(off + 74, off + 138);
  return { bump, slot, client, seed, state: "Fulfilled", randomness };
}
