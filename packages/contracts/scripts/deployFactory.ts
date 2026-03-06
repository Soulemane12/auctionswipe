import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AuctionFactory with:", deployer.address);

  const Factory = await ethers.getContractFactory("AuctionFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  const network = await ethers.provider.getNetwork();
  console.log("AuctionFactory:", address);
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("\nAdd to .env:");

  if (network.chainId === 421614n) {
    console.log(`NEXT_PUBLIC_FACTORY_ADDRESS_ARB_SEPOLIA=${address}`);
  } else if (network.chainId === 46630n) {
    console.log(`NEXT_PUBLIC_FACTORY_ADDRESS_ROBINHOOD=${address}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
