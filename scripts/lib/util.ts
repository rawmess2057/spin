import { sha256 } from "@noble/hashes/sha256";
import {
  AccountRole,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  type AccountMeta,
} from "@solana/kit";
import { wsUrl } from "./config.js";

export type Role = AccountRole;

export { AccountRole };

export function ixDiscriminator(name: string): Uint8Array {
  return sha256(`global:${name}`).slice(0, 8);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function u8(v: number): Uint8Array {
  return new Uint8Array([v & 0xff]);
}

export function u16Le(v: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, v, true);
  return out;
}

export function u64Le(v: bigint | number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(v), true);
  return out;
}

export function bool(v: boolean): Uint8Array {
  return new Uint8Array([v ? 1 : 0]);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RpcBundle {
  rpc: ReturnType<typeof createSolanaRpc>;
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>;
  commitment: "confirmed";
}

export function createRpcBundle(rpcUrl: string): RpcBundle {
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl());
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  return { rpc, sendAndConfirm, commitment: "confirmed" };
}
