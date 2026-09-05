export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const DEVNET_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const DEVNET_WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL;

export const CLUSTER_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

export const WS_URLS: Record<ClusterMoniker, string> = {
  devnet: DEVNET_WS_URL ?? "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

export const WALLET_CHAINS: Record<ClusterMoniker, `solana:${string}`> = {
  devnet: "solana:devnet",
  testnet: "solana:testnet",
  mainnet: "solana:mainnet",
  // Wallets don't advertise a localnet chain — sign against devnet while the
  // RPC endpoint above targets the local validator.
  localnet: "solana:devnet",
};
