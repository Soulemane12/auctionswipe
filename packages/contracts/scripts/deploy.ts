import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("AuctionFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("AuctionFactory deployed to:", factoryAddress);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
