import hre from "hardhat";
const { ethers } = hre;

async function main() {
  console.log(" Starting deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy MockUSDT
  console.log(" Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  console.log("  MockUSDT deployed to:", await usdt.getAddress());

  // Deploy PaymentGateway
  console.log("\n Deploying PaymentGateway...");
  const feeCollector = deployer.address; // Use deployer as fee collector for now
  const PaymentGateway = await ethers.getContractFactory("PaymentGateway");
  const gateway = await PaymentGateway.deploy(feeCollector);
  await gateway.waitForDeployment();
  console.log("  PaymentGateway deployed to:", await gateway.getAddress());

  // Enable USDT as supported token
  console.log("\n  Configuring PaymentGateway...");
  const tx = await gateway.setTokenSupport(await usdt.getAddress(), true);
  await tx.wait();
  console.log("  USDT token support enabled");

  // Mint some tokens to deployer for testing
  console.log("\n Minting test tokens...");
  const mintTx = await usdt.faucet(deployer.address, ethers.parseUnits("100000", 6));
  await mintTx.wait();
  console.log("  Minted 100,000 USDT to deployer");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(" DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("MockUSDT:", await usdt.getAddress());
  console.log("PaymentGateway:", await gateway.getAddress());
  console.log("Fee Collector:", feeCollector);
  console.log("Platform Fee:", (await gateway.platformFeePercentage()).toString(), "basis points (0.25%)");
  console.log("=".repeat(60));

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      MockUSDT: await usdt.getAddress(),
      PaymentGateway: await gateway.getAddress(),
    },
    feeCollector: feeCollector,
    timestamp: new Date().toISOString(),
  };

  const fs = await import("fs");
  const path = await import("path");
  const deploymentsDir = path.join(process.cwd(), "deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n Deployment info saved to:", `deployments/${filename}`);

  // Verification instructions
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n To verify contracts on Etherscan/Polygonscan, run:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${await usdt.getAddress()}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${await gateway.getAddress()} "${feeCollector}"`);
  }

  console.log("\n Deployment complete!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
