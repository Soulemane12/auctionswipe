import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { defineChain, http } from "viem";

const DEFAULT_ROBINHOOD_RPC = "https://rpc.testnet.chain.robinhood.com";
export const ROBINHOOD_RPC_URL =
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC ||
  process.env.NEXT_PUBLIC_ALCHEMY_ROBINHOOD_RPC ||
  DEFAULT_ROBINHOOD_RPC;
const ROBINHOOD_PROXY_RPC_URL = "/api/rpc/robinhood";

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo";
const includeWalletConnect = typeof window !== "undefined";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: includeWalletConnect
        ? [metaMaskWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
        : [metaMaskWallet, coinbaseWallet, rainbowWallet],
    },
  ],
  { appName: "AuctionSwipe", projectId: PROJECT_ID },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [robinhoodTestnet, arbitrumSepolia],
  transports: {
    [robinhoodTestnet.id]: http(ROBINHOOD_PROXY_RPC_URL),
    [arbitrumSepolia.id]:  http(),
  },
  ssr: false,
});
