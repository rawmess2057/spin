import {
  createClient,
  extendClient,
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
  getCancelBetInstructionAsync,
  getDepositInstructionAsync,
  getPlaceBetInstructionAsync,
  getRevokeDelegateInstructionAsync,
  getSetDelegateInstructionAsync,
  getSettleBetInstructionAsync,
  getWithdrawInstructionAsync,
  SPIN_PROGRAM_ADDRESS,
  type PlaceBetAsyncInput,
} from "./generated/spin";
import {
  CLUSTER_URLS,
  WALLET_CHAINS,
  WS_URLS,
  type ClusterMoniker,
} from "./config";

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
    // Seed must match GAME_CONFIG_SEED in programs/spin/src/constants.rs.
    seeds: [getUtf8Encoder().encode("game"), getU8Encoder().encode(gameId)],
  });
  return pda;
}

export type PlaceBetInput = {
  /** Whose vault the stake comes out of. */
  player: Address;
  /** Signs and pays: the player's wallet, or their session key. */
  authority: TransactionSigner;
  gameId: number;
  amount: bigint;
  target: bigint;
  /** 32 random bytes from the browser, mixed into the randomness. */
  clientSeed: Uint8Array;
};
export type SettleBetInput = {
  cranker: TransactionSigner;
  player: Address;
  reveal: Uint8Array;
};
export type CancelBetInput = {
  /** Anyone may cancel a timed-out bet; pays the fee. */
  caller: TransactionSigner;
  player: Address;
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
    settleBet: (
      input: SettleBetInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getSettleBetInstructionAsync>>>;
    cancelBet: (
      input: CancelBetInput
    ) => SelfPlanAndSendFunctions &
      Promise<Awaited<ReturnType<typeof getCancelBetInstructionAsync>>>;
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

async function buildPlaceBetInstruction(input: PlaceBetInput) {
  // `player` is a plain address and `authority` is the signer, so the codama
  // PDA resolvers (chain, vault, credits, session, bet, treasury) key off the
  // player while the session key pays and signs.
  const config = await findGameConfigPda(input.gameId);
  const asyncInput: PlaceBetAsyncInput = {
    authority: input.authority,
    player: input.player,
    config,
    gameId: input.gameId,
    amount: input.amount,
    target: input.target,
    clientSeed: input.clientSeed,
  };
  return getPlaceBetInstructionAsync(asyncInput);
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
              buildPlaceBetInstruction(input)
            ),
          settleBet: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getSettleBetInstructionAsync({
                cranker: input.cranker,
                player: input.player,
                reveal: input.reveal,
              })
            ),
          cancelBet: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getCancelBetInstructionAsync({
                caller: input.caller,
                player: input.player,
              })
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
