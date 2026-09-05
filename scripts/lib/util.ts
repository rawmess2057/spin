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

// Public devnet endpoints intermittently answer 429 / "Internal error" and
// drop connections; the reveal service and smoke test poll on a schedule, so
// a plain failure would otherwise kill the run. Retry idempotent reads with
// backoff. Sends are left alone — they carry retry semantics of their own
// (the sendAndConfirm factory) and must never double-submit.
const READ_RETRIES = 5;
const BASE_BACKOFF_MS = 400;

function isRetryable(err: unknown): boolean {
  const e = err as { context?: { __code?: number }; cause?: { code?: string } };
  const code = e?.context?.__code;
  if (code === 8100002) return true; // HTTP transport error (429, 5xx, drop)
  if (code === -32603) return true; // JSON-RPC internal error
  if (err instanceof TypeError && e?.cause?.code?.startsWith("UND_ERR_")) {
    return true; // undici network failure (connect timeout, socket drop)
  }
  return false;
}

// The wrapper returns the same shape as its input, so `any` keeps the
// cluster-typed RPC ergonomics of the caller (sendAndConfirmFactory wants
// cluster-bound RPCs, which a generic Rpc isn't assignable to).
export function retryingRpc(rpc: ReturnType<typeof createSolanaRpc>): any {
  return new Proxy(rpc, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "sendTransaction") return value; // never blindly resubmit
      return (...args: unknown[]) => {
        const call = value.apply(target, args);
        if (call?.send == null) return call;
        return {
          send: async () => {
            const rawSend = call.send;
            let attempt = 0;
            for (;;) {
              try {
                return await rawSend();
              } catch (err) {
                if (!isRetryable(err) || attempt >= READ_RETRIES) throw err;
                attempt += 1;
                console.warn(
                  `[util] retrying ${String(prop)} (${err instanceof Error ? err.message : String(err)}), attempt ${attempt}/${READ_RETRIES}`
                );
                await sleep(
                  BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 200
                );
              }
            }
          },
        };
      };
    },
  });
}

export function createRpcBundle(rpcUrl: string): RpcBundle {
  const rpc = retryingRpc(createSolanaRpc(rpcUrl));
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl());
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  return { rpc, sendAndConfirm, commitment: "confirmed" };
}
