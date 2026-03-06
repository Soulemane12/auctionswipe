import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AuctionFHE with:", deployer.address);

  const admin = process.env.ADMIN_ADDRESS ?? deployer.address;

  const Factory = await ethers.getContractFactory("AuctionFHE");
  const auction = await Factory.deploy(admin);
  await auction.waitForDeployment();

  const address = await auction.getAddress();
  console.log("AuctionFHE deployed to:", address);
  console.log("Admin:", admin);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("\nAdd to .env:");
  console.log(`NEXT_PUBLIC_AUCTION_FHE_ADDRESS=${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
