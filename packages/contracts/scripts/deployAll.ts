/**
 * deployAll.ts
 * Deploys: MockERC20 + AuctionFactory
 * Mints tokens to deployer + (optionally) agent wallet
 * Prints everything needed for .env
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const MINT_AMOUNT = ethers.parseUnits("10000", 18); // 10,000 tokens each

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork : ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // ── MockERC20 ─────────────────────────────────────────────────────────────
  console.log("Deploying MockERC20…");
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("AuctionToken", "ATKN", 18, deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockERC20  :", tokenAddress);

  // Mint to deployer
  await (await token.mint(deployer.address, MINT_AMOUNT)).wait();
  console.log(`Minted 10,000 ATKN to deployer`);

  // Mint to agent wallet if different
  const agentKey = process.env.AGENT_PRIVATE_KEY;
  if (agentKey && agentKey !== process.env.DEPLOYER_PRIVATE_KEY) {
    const agentWallet = new ethers.Wallet(agentKey, ethers.provider);
    await (await token.mint(agentWallet.address, MINT_AMOUNT)).wait();
    console.log(`Minted 10,000 ATKN to agent: ${agentWallet.address}`);
  } else {
    console.log("Agent wallet = deployer (single wallet mode)");
  }

  // ── AuctionFactory ────────────────────────────────────────────────────────
  console.log("\nDeploying AuctionFactory…");
  const Factory = await ethers.getContractFactory("AuctionFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("AuctionFactory:", factoryAddress);

  // ── Summary ───────────────────────────────────────────────────────────────
  const isArb  = network.chainId === 421614n;
  const isRH   = network.chainId === 46630n;

  console.log("\n─────────────────────────────────────────");
  console.log("Add to .env:");
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  if (isArb) {
    console.log(`NEXT_PUBLIC_FACTORY_ADDRESS_ARB_SEPOLIA=${factoryAddress}`);
    console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${tokenAddress}`);
  }
  if (isRH) {
    console.log(`NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD=${factoryAddress}`);
  }
  console.log(`\nToken address (bid currency): ${tokenAddress}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
