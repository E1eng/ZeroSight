import "dotenv/config";

import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { ethers } from "ethers";

import { FEED_IDS, MARKET_ABI, STATUS_LABELS, requireEnv, type AssetIndex } from "./utils";

async function main() {
  const rpcUrl = requireEnv("STORY_RPC_URL");
  const privateKey = process.env.MARKET_OPERATOR_PRIVATE_KEY ?? requireEnv("DEPLOYER_PRIVATE_KEY");
  const contractAddress = requireEnv("ZERO_SIGHT_MARKET_ADDRESS");

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, MARKET_ABI, wallet);

  const status = Number(await contract.marketStatus());
  if (status === 2) {
    throw new Error(`Market is already resolved.`);
  }

  const deadline = Number(await contract.deadline());
  const now = Math.floor(Date.now() / 1000);
  if (now <= deadline) {
    throw new Error(`Deadline not passed yet. deadline=${deadline}, now=${now}`);
  }

  const assetIndex = Number(await contract.activeAsset()) as AssetIndex;
  const dataFeedId = FEED_IDS[assetIndex];

  const dataServiceId = process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-primary-prod";
  const uniqueSignersCount = Number(process.env.REDSTONE_SIGNERS_THRESHOLD ?? "3");

  console.log(`Resolving market: asset=${assetIndex} status=${STATUS_LABELS[status] ?? status}`);

  const wrapped = WrapperBuilder.wrap(contract).usingDataService({
    dataServiceId,
    uniqueSignersCount,
    dataFeeds: [dataFeedId]
  } as any);

  const tx = await wrapped.resolveMarket();
  console.log(`resolveMarket tx: ${tx.hash}`);
  await tx.wait();
  console.log("Market resolved");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
