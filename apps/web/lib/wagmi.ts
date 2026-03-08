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

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://testnet.explorer.robinhoodchain.com" },
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
    [robinhoodTestnet.id]: http("https://rpc.testnet.chain.robinhood.com"),
    [arbitrumSepolia.id]:  http(),
  },
  ssr: false,
});
