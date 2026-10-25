const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  const [admin, allocator, desk2, lender] = await ethers.getSigners();
  console.log("Deploying CollateralLedger with admin:", admin.address);
  console.log("Allocator account (#1):", allocator.address);
  console.log("Desk2 account (#2):", desk2.address);
  console.log("Lender account (#3):", lender.address);

  const factory = await ethers.getContractFactory("CollateralLedger");
  const ledger = await factory.deploy(admin.address);
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();
  console.log("CollateralLedger deployed to:", address);

  const allocatorRole = await ledger.ALLOCATOR_ROLE();
  const tx1 = await ledger.connect(admin).grantRole(allocatorRole, allocator.address);
  await tx1.wait();
  console.log("Granted ALLOCATOR_ROLE to account #1");

  const tx2 = await ledger.connect(admin).grantRole(allocatorRole, desk2.address);
  await tx2.wait();
  console.log("Granted ALLOCATOR_ROLE to account #2");

  const network = await ethers.provider.getNetwork();
  const artifact = await hre.artifacts.readArtifact("CollateralLedger");

  const deploymentData = {
    address,
    abi: artifact.abi,
    chainId: Number(network.chainId),
    accounts: {
      admin: admin.address,
      allocator: allocator.address,
      desk2: desk2.address,
      lender: lender.address,
    },
  };

  const sharedDir = path.resolve(__dirname, "../../shared");
  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
  }

  const outPath = path.join(sharedDir, "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log("Wrote deployment details to:", outPath);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
