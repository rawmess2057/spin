import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  getSignatureFromTransaction,
  getU64Encoder,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type KeyPairSigner,
} from "@solana/kit";
import type { RpcBundle } from "./util.js";
import type { SpinInstruction } from "./spin.js";

/**
 * Sends a single Spin instruction signed by `signer`, who must also be the
 * WRITABLE_SIGNER (or READONLY_SIGNER) account referenced by the instruction.
 */
export async function sendIx(
  bundle: RpcBundle,
  signer: KeyPairSigner<string>,
  ix: SpinInstruction,
): Promise<string> {
  const { rpc, sendAndConfirm, commitment } = bundle;

  const { value: blockhashInfo } = await rpc.getLatestBlockhash({ commitment }).send();

  const message = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
    },
    appendTransactionMessageInstruction(
      ix as never,
      setTransactionMessageFeePayerSigner(
        signer as never,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  await sendAndConfirm(signed as never, { commitment });
  return signature;
}

/** Sends a plain SOL transfer from `from` (a kit keypair signer) to `to`. */
export async function sendSystemTransfer(
  bundle: RpcBundle,
  signer: KeyPairSigner<string>,
  to: string,
  lamports: bigint,
): Promise<string> {
  const { rpc, sendAndConfirm, commitment } = bundle;

  const { value: blockhashInfo } = await rpc.getLatestBlockhash({ commitment }).send();

  // System program transfer: instruction index 2 + u64 amount.
  const data = getU64Encoder().encode(lamports);
  const payload = new Uint8Array(data.length + 4);
  payload.set([2, 0, 0, 0], 0);
  payload.set(data, 4);

  const ix = {
    programAddress: "11111111111111111111111111111111",
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data: payload,
  };

  const message = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
    },
    appendTransactionMessageInstruction(
      ix as never,
      setTransactionMessageFeePayerSigner(
        signer as never,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  await sendAndConfirm(signed as never, { commitment });
  return signature;
}