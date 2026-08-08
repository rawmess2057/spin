import {
  createClient,
  extendClient,
  fetchEncodedAccount,
  getProgramDerivedAddress,
  getU8Encoder,
  getUtf8Encoder,
  MicroLamports,
  type Address,
  type ClientWithPayer,
  type ClientWithRpc,
  type ClientWithTransactionPlanning,
  type ClientWithTransactionSending,
  type ExtendedClient,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type TransactionSigner,
} from "@solana/kit";
import {
  addSelfPlanAndSendFunctions,
  type SelfPlanAndSendFunctions,
} from "@solana/kit/program-client-core";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { systemProgram } from "@solana-program/system";
import {
  findPendingPda,
  findVaultPda,
  findVrfStatePda,
  getDepositInstructionAsync,
  getPlaceBetInstructionAsync,
  getRefundSpinInstructionAsync,
  getRevokeDelegateInstructionAsync,
  getSetDelegateInstructionAsync,
  getWithdrawInstructionAsync,
  SPIN_PROGRAM_ADDRESS,
  type PlaceBetAsyncInput,
  type RefundSpinAsyncInput,
} from "./generated/spin";
import {
  CLUSTER_URLS,
  WALLET_CHAINS,
  WS_URLS,
  type ClusterMoniker,
} from "./config";
import {
  decodeNetworkState,
  findVrfClientPda,
  findVrfNetworkStatePda,
  findVrfRequestPda,
} from "./vrf";

export * from "./generated/spin";
export type { ClusterMoniker };

export function getClusterUrl(cluster: ClusterMoniker) {
  return CLUSTER_URLS[cluster];
}

export function getWalletChain(cluster: ClusterMoniker) {
  return WALLET_CHAINS[cluster];
}

export async function findGameConfigPda(gameId: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: SPIN_PROGRAM_ADDRESS,
    seeds: [
      getUtf8Encoder().encode("game_config"),
      getU8Encoder().encode(gameId),
    ],
  });
  return pda;
}

/** The ORAO VRF treasury is read from live network state, not a static PDA. */
async function resolveVrfTreasury(
  rpc: Parameters<typeof fetchEncodedAccount>[0]
): Promise<Address> {
  const networkState = await findVrfNetworkStatePda();
  const account = await fetchEncodedAccount(rpc, networkState);
  if (!account.exists) {
    throw new Error("ORAO VRF network state account not found");
  }
  return decodeNetworkState(account.data).treasury;
}

export type PlaceBetInput = {
  /** Whose vault the stake comes out of. */
  player: Address;
  /** Signs and pays: the player's wallet, or their session key. */
  authority: TransactionSigner;
  gameId: number;
  amount: bigint;
  target: bigint;
  seed: Uint8Array;
};

export type RefundSpinInput = {
  player: Address;
  authority: TransactionSigner;
  /** Who paid the pending account's rent and gets it back. */
  rentPayer: Address;
  seed: Uint8Array;
};

export type DepositInput = { player: TransactionSigner; amount: bigint };
export type WithdrawInput = { player: TransactionSigner; amount: bigint };
export type SetDelegateInput = {
  player: TransactionSigner;
  delegate: Address;
  expirySlot: bigint;
  spendLimit: bigint;
};
export type RevokeDelegateInput = { player: TransactionSigner };

export type SpinPluginRequirements = ClientWithRpc<
  GetAccountInfoApi & GetMultipleAccountsApi
> &
  ClientWithPayer &
  ClientWithTransactionPlanning &
  ClientWithTransactionSending;

export type SpinPlugin = {
  instructions: {
    placeBet: (
      input: PlaceBetInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getPlaceBetInstructionAsync>>>;
    refundSpin: (
      input: RefundSpinInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getRefundSpinInstructionAsync>>>;
    deposit: (
      input: DepositInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getDepositInstructionAsync>>>;
    withdraw: (
      input: WithdrawInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getWithdrawInstructionAsync>>>;
    setDelegate: (
      input: SetDelegateInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getSetDelegateInstructionAsync>>>;
    revokeDelegate: (
      input: RevokeDelegateInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getRevokeDelegateInstructionAsync>>>;
  };
};

async function buildPlaceBetInstruction(
  client: SpinPluginRequirements,
  input: PlaceBetInput
) {
  const [config, vrfTreasury] = await Promise.all([
    findGameConfigPda(input.gameId),
    resolveVrfTreasury(client.rpc),
  ]);
  // `player` is a plain address and `authority` is the signer, so the codama
  // PDA resolvers (vault, session) key off the player while the session key
  // pays and signs.
  const asyncInput: PlaceBetAsyncInput = {
    authority: input.authority,
    player: input.player,
    config,
    vrfTreasury,
    gameId: input.gameId,
    amount: input.amount,
    target: input.target,
    seed: input.seed,
  };
  return getPlaceBetInstructionAsync(asyncInput);
}

async function buildRefundSpinInstruction(input: RefundSpinInput) {
  const [vrfState] = await findVrfStatePda();
  const vrfClient = await findVrfClientPda(SPIN_PROGRAM_ADDRESS, vrfState);
  const [request, [pending], [vault]] = await Promise.all([
    findVrfRequestPda(vrfClient, input.seed),
    findPendingPda({ seed: input.seed }),
    findVaultPda({ player: input.player }),
  ]);
  const asyncInput: RefundSpinAsyncInput = {
    authority: input.authority,
    rentPayer: input.rentPayer,
    vault,
    request,
    pending,
    seed: input.seed,
  };
  return getRefundSpinInstructionAsync(asyncInput);
}

export function spinProgram(): <T extends SpinPluginRequirements>(
  client: T
) => ExtendedClient<T, { spin: SpinPlugin }> {
  return (client) => {
    const plugin: { spin: SpinPlugin } = {
      spin: {
        instructions: {
          placeBet: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              buildPlaceBetInstruction(client, input)
            ),
          refundSpin: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              buildRefundSpinInstruction(input)
            ),
          deposit: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getDepositInstructionAsync({
                player: input.player,
                amount: input.amount,
              })
            ),
          withdraw: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getWithdrawInstructionAsync({
                player: input.player,
                amount: input.amount,
              })
            ),
          setDelegate: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getSetDelegateInstructionAsync({
                player: input.player,
                delegate: input.delegate,
                expirySlot: input.expirySlot,
                spendLimit: input.spendLimit,
              })
            ),
          revokeDelegate: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getRevokeDelegateInstructionAsync({ player: input.player })
            ),
        },
      },
    };
    return extendClient(client, plugin);
  };
}

export function createAppClient(cluster: ClusterMoniker) {
  return createClient()
    .use(walletSigner({ chain: WALLET_CHAINS[cluster] }))
    .use(
      solanaRpc({
        rpcUrl: CLUSTER_URLS[cluster],
        rpcSubscriptionsUrl: WS_URLS[cluster],
        transactionConfig: {
          microLamportsPerComputeUnit: 1000n as MicroLamports,
        },
      })
    )
    .use(rpcAirdrop())
    .use(systemProgram())
    .use(spinProgram());
}

export type AppClient = ReturnType<typeof createAppClient>;
