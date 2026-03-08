import { ethers } from "hardhat";
import path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Network :", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);
  console.log("Balance :", ethers.formatEther(balance), "ETH");

  const Factory = await ethers.getContractFactory("AuctionMetrics");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nAuctionMetrics:", address);
  console.log("\nAdd to .env:");
  console.log(`METRICS_CONTRACT=${address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
