/**
 * createAuction.ts  — create a demo auction on Robinhood Chain Testnet
 *
 * Usage (from packages/contracts/):
 *   pnpm tsx scripts/createAuction.ts
 *
 * Edit the AUCTION_PARAMS below to customise title, image, duration, etc.
 */

import * as dotenv from "dotenv";
import * as path from "path";
// cwd = packages/contracts when run via pnpm script
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

import { createWalletClient, createPublicClient, http, parseAbi, parseEventLogs, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Robinhood Chain Testnet ────────────────────────────────────────────────────
const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "RHT", symbol: "RHT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com"] },
  },
});

// ── Config ─────────────────────────────────────────────────────────────────────
const _RAW_KEY    = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const PRIVATE_KEY = (_RAW_KEY.startsWith("0x") ? _RAW_KEY : `0x${_RAW_KEY}`) as `0x${string}`;
const FACTORY_ADDR  = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD ?? "") as `0x${string}`;
const TOKEN_ADDRESS = "0xa4a4763a141dC696A020922E7E97C7f0AA5E44b5" as `0x${string}`;

const AUCTION_PARAMS = {
  title:     "Nike Air Max 1 OG (size 10)",
  imageURI:  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
  duration:  60 * 60,          // 1 hour in seconds
  reserve:   1n * 10n ** 18n,  // 1 ATKN reserve price
  increment: 1n * 10n ** 17n,  // 0.1 ATKN minimum raise
};

// ── ABIs ───────────────────────────────────────────────────────────────────────
const factoryAbi = parseAbi([
  "function createAuction(address currency, uint256 reservePrice, uint256 minIncrement, uint256 durationSeconds, string calldata metadataURI, string calldata imageURI, address admin) external returns (uint256 auctionId, address auction)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed auction, address indexed seller, address currency, string metadataURI, string imageURI)",
]);

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!_RAW_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  }
  if (!FACTORY_ADDR || !FACTORY_ADDR.startsWith("0x")) {
    throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD not set in .env");
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const rpc     = process.env.ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com";

  const wallet = createWalletClient({
    account,
    chain:     robinhoodTestnet,
    transport: http(rpc),
  });
  const publicClient = createPublicClient({
    chain:     robinhoodTestnet,
    transport: http(rpc),
  });

  console.log("Sender  :", account.address);
  console.log("Factory :", FACTORY_ADDR);
  console.log("Title   :", AUCTION_PARAMS.title);
  console.log("Duration:", AUCTION_PARAMS.duration, "s");

  const hash = await wallet.writeContract({
    address:      FACTORY_ADDR,
    abi:          factoryAbi,
    functionName: "createAuction",
    args: [
      TOKEN_ADDRESS,
      AUCTION_PARAMS.reserve,
      AUCTION_PARAMS.increment,
      BigInt(AUCTION_PARAMS.duration),
      AUCTION_PARAMS.title,
      AUCTION_PARAMS.imageURI,
      account.address,   // admin = deployer
    ],
  });

  console.log("\ntx hash:", hash);
  console.log("waiting for receipt…");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("confirmed in block", receipt.blockNumber);

  // Parse AuctionCreated log
  const logs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs });
  const created = logs.find((l) => l.eventName === "AuctionCreated");
  if (created) {
    console.log("\n✅ Auction created!");
    console.log("   address  :", (created.args as { auction: string }).auction);
    console.log("   auctionId:", (created.args as { auctionId: bigint }).auctionId.toString());
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
