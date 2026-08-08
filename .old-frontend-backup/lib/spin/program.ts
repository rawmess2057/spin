import {
  addSelfPlanAndSendFunctions,
  type SelfPlanAndSendFunctions,
} from "@solana/kit/program-client-core";
import {
  extendClient,
  type ClientWithPayer,
  type ClientWithRpc,
  type ClientWithTransactionPlanning,
  type ClientWithTransactionSending,
  type ExtendedClient,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
} from "@solana/kit";
import {
  getPlaceBetInstruction,
  getRefundSpinInstruction,
  type PlaceBetInput,
  type RefundSpinInput,
  type SpinInstruction,
} from "./instructions";

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
    ) => SelfPlanAndSendFunctions & Promise<SpinInstruction>;
    refundSpin: (
      input: RefundSpinInput
    ) => SelfPlanAndSendFunctions & Promise<SpinInstruction>;
  };
};

export function spinProgram(): <T extends SpinPluginRequirements>(
  client: T
) => ExtendedClient<T, { spin: SpinPlugin }> {
  return (client) => {
    const spin: { spin: SpinPlugin } = {
      spin: {
        instructions: {
          placeBet: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getPlaceBetInstruction(client.rpc, input)
            ),
          refundSpin: (input) =>
            addSelfPlanAndSendFunctions(
              client,
              getRefundSpinInstruction(client.rpc, input)
            ),
        },
      },
    };
    return extendClient(client, spin);
  };
}
