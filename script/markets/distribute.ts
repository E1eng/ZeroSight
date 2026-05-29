import "dotenv/config";

import { ethers } from "ethers";

import { MARKET_ABI, requireEnv } from "./utils";

const DEFAULT_BATCH_SIZE = 50;

async function main() {
  const rpcUrl = requireEnv("STORY_RPC_URL");
  const privateKey = process.env.MARKET_OPERATOR_PRIVATE_KEY ?? requireEnv("DEPLOYER_PRIVATE_KEY");
  const contractAddress = requireEnv("ZERO_SIGHT_MARKET_ADDRESS");

  const batchSize = Number(process.argv[2] ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid batch size: ${process.argv[2]}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, MARKET_ABI, wallet);

  const status = Number(await contract.marketStatus());
  if (status !== 2) {
    throw new Error(`Market must be Resolved to distribute. Current status: ${status}`);
  }

  const totalBettors = Number(await contract.getBettorCount());
  console.log(`Total bettors: ${totalBettors}`);

  let distributed = false;
  let round = 0;

  while (!distributed) {
    const idx = Number(await contract.distributionIndex());
    console.log(`Round ${++round}: distributing from index ${idx} (batch=${batchSize})`);

    const tx = await contract.distributeWinnings(batchSize);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();

    distributed = await contract.isFullyDistributed();
    console.log(`  fullyDistributed: ${distributed}`);
  }

  console.log("All winnings distributed.");

  // Sweep remaining dust if any.
  const remaining = await provider.getBalance(contractAddress);
  if (remaining.gt(0)) {
    console.log(`Sweeping ${ethers.utils.formatEther(remaining)} remaining balance...`);
    const sweepTx = await contract.sweepUnclaimed();
    console.log(`  sweepUnclaimed tx: ${sweepTx.hash}`);
    await sweepTx.wait();
    console.log("Sweep complete.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
