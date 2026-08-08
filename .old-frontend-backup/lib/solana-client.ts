import { createClient, MicroLamports } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { solanaRpc, rpcAirdrop } from "@solana/kit-plugin-rpc";
import { systemProgram } from "@solana-program/system";
import { spinProgram } from "./spin/program";

export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const DEVNET_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const DEVNET_WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

const CLUSTER_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

const WS_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_WS_URL ?? "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

const WALLET_CHAINS: Record<ClusterMoniker, `solana:${string}`> = {
  devnet: "solana:devnet",
  testnet: "solana:testnet",
  mainnet: "solana:mainnet",
  // Wallets do not advertise a localnet chain. Sign against devnet so wallets
  // stay discoverable while the RPC below targets the local validator.
  localnet: "solana:devnet",
};

export function getClusterUrl(cluster: ClusterMoniker) {
  return CLUSTER_URLS[cluster];
}

export function getWalletChain(cluster: ClusterMoniker) {
  return WALLET_CHAINS[cluster];
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
