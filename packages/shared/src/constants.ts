// Network config
export const NETWORKS = {
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpc: process.env.ALCHEMY_ARB_SEPOLIA_RPC ?? "",
    ws: process.env.ALCHEMY_ARB_SEPOLIA_WS ?? "",
    explorer: "https://sepolia.arbiscan.io",
  },
  robinhoodTestnet: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    rpc: process.env.ROBINHOOD_RPC ?? "https://rpc.testnet.chain.robinhood.com",
    ws: process.env.ROBINHOOD_WS ?? "wss://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
} as const;

// Auction state enum (mirrors contract)
export enum AuctionState {
  LOCKED = 0,
  COUNTDOWN = 1,
  ACTIVE = 2,
  ENDED = 3,
  SETTLED = 4,
}

export const STATE_LABELS: Record<AuctionState, string> = {
  [AuctionState.LOCKED]: "LOCKED",
  [AuctionState.COUNTDOWN]: "COUNTDOWN",
  [AuctionState.ACTIVE]: "ACTIVE",
  [AuctionState.ENDED]: "ENDED",
  [AuctionState.SETTLED]: "SETTLED",
};

export const COUNTDOWN_SECONDS = 150; // 2m30
export const PLATFORM_FEE_BPS = 200;  // 2%
