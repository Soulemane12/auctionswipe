/**
 * metrics.ts — mirrors auction events to AuctionMetrics on Ethereum Sepolia
 *              so Dune Analytics can index and decode them.
 *
 * Call initMetrics() once at server startup.
 * Call the report* functions from the event handlers in index.ts.
 */

import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const METRICS_ABI = parseAbi([
  "function reportAuctionCreated(uint32 sourceChainId, address auction, address seller, address currency, string metadataURI) external",
  "function reportActivated(uint32 sourceChainId, address auction, uint256 startTime, uint256 endTime) external",
  "function reportBidPlaced(uint32 sourceChainId, address auction, address bidder, uint256 amount) external",
  "function reportSettled(uint32 sourceChainId, address auction, address winner, uint256 sellerPayout, uint256 fee) external",
]);

let wallet: ReturnType<typeof createWalletClient> | null = null;
let metricsAddr: `0x${string}` | null = null;
let sourceChainId = 46630; // Robinhood testnet by default

export function initMetrics(chainId: number) {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  const metricsContract = process.env.METRICS_CONTRACT as `0x${string}` | undefined;
  const rpc = process.env.ETH_SEPOLIA_RPC || "https://rpc.sepolia.org";

  if (!rawKey || !metricsContract) {
    console.log("metrics: METRICS_CONTRACT not set — Dune mirroring disabled");
    return;
  }

  sourceChainId = chainId;
  metricsAddr = metricsContract;

  const account = privateKeyToAccount(
    (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`
  );

  wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
  console.log(`metrics: mirroring to ${metricsAddr} on Sepolia`);
}

async function send(fn: string, args: unknown[]) {
  if (!wallet || !metricsAddr) return;
  try {
    const hash = await (wallet as ReturnType<typeof createWalletClient>).writeContract({
      chain: null,
      account: (wallet as ReturnType<typeof createWalletClient>).account!,
      address: metricsAddr,
      abi: METRICS_ABI,
      functionName: fn as never,
      args: args as never,
    });
    console.log(`metrics: ${fn} → ${hash}`);
  } catch (e) {
    // Non-critical — log and continue
    console.warn(`metrics: ${fn} failed:`, (e as Error).message?.slice(0, 80));
  }
}

export const reportAuctionCreated = (auction: string, seller: string, currency: string, metadataURI: string) =>
  send("reportAuctionCreated", [sourceChainId, auction, seller, currency, metadataURI]);

export const reportActivated = (auction: string, startTime: bigint, endTime: bigint) =>
  send("reportActivated", [sourceChainId, auction, startTime, endTime]);

export const reportBidPlaced = (auction: string, bidder: string, amount: bigint) =>
  send("reportBidPlaced", [sourceChainId, auction, bidder, amount]);

export const reportSettled = (auction: string, winner: string, sellerPayout: bigint, fee: bigint) =>
  send("reportSettled", [sourceChainId, auction, winner, sellerPayout, fee]);
