import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config(); // fallback to local .env if present

// Support both naming conventions in .env
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || "";

// Full RPC URLs (preferred — already set in .env)
const ARB_SEPOLIA_RPC =
  process.env.ALCHEMY_ARB_SEPOLIA_RPC ||
  (ALCHEMY_KEY ? `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : "");

const ARB_SEPOLIA_WS =
  process.env.ALCHEMY_ARB_SEPOLIA_WS ||
  (ALCHEMY_KEY ? `wss://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : "");

const ROBINHOOD_RPC =
  process.env.ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com";

const ETH_SEPOLIA_RPC =
  process.env.ETH_SEPOLIA_RPC ||
  (ALCHEMY_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : "https://rpc.sepolia.org");

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        // CoFHE requires >=0.8.25 + cancun EVM (mcopy opcode)
        version: "0.8.25",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
        },
      },
    ],
  },
  networks: {
    hardhat: {},
    // Primary names (used by pnpm scripts)
    arb_sepolia: {
      url: ARB_SEPOLIA_RPC,
      accounts,
      chainId: 421614,
    },
    robinhood_testnet: {
      url: ROBINHOOD_RPC,
      accounts,
      chainId: 46630,
    },
    eth_sepolia: {
      url: ETH_SEPOLIA_RPC,
      accounts,
      chainId: 11155111,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
  },
};

export default config;
