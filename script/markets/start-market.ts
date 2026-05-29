import "dotenv/config";

import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { ethers } from "ethers";

import {
  ASSET_LABELS,
  CATEGORY_LABELS,
  FEED_IDS,
  MARKET_ABI,
  requireEnv,
  type AssetIndex
} from "./utils";

async function main() {
  const rpcUrl = requireEnv("STORY_RPC_URL");
  const privateKey = process.env.MARKET_OPERATOR_PRIVATE_KEY ?? requireEnv("DEPLOYER_PRIVATE_KEY");
  const contractAddress = requireEnv("ZERO_SIGHT_MARKET_ADDRESS");

  // Parse asset (ip | btc | eth) — defaults to "ip".
  const assetInput = (process.argv[2] ?? process.env.MARKET_ASSET ?? "ip").toLowerCase();
  const assetIndex = ASSET_LABELS[assetInput];
  if (assetIndex === undefined) {
    throw new Error(
      `Unknown asset "${assetInput}". Valid: ${Object.keys(ASSET_LABELS).join(", ")}`
    );
  }

  // Parse category — defaults to "crypto".
  const categoryInput = (process.argv[3] ?? process.env.MARKET_CATEGORY ?? "crypto").toLowerCase();
  const category = CATEGORY_LABELS[categoryInput];
  if (category === undefined) {
    throw new Error(
      `Unknown category "${categoryInput}". Valid: ${Object.keys(CATEGORY_LABELS).join(", ")}`
    );
  }

  // Parse deadline offset in seconds — defaults to 7 days.
  const offsetSecondsRaw = process.argv[4] ?? process.env.MARKET_DEADLINE_OFFSET ?? "604800";
  const offsetSeconds = Number(offsetSecondsRaw);
  if (!Number.isFinite(offsetSeconds) || offsetSeconds <= 0) {
    throw new Error(`Invalid deadline offset: ${offsetSecondsRaw}`);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, MARKET_ABI, wallet);

  const dataServiceId = process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-primary-prod";
  const uniqueSignersCount = Number(process.env.REDSTONE_SIGNERS_THRESHOLD ?? "3");
  const dataFeedId = FEED_IDS[assetIndex];

  console.log(
    `Starting market: asset=${assetInput}(${assetIndex}) category=${categoryInput}(${category}) deadline=${deadline}`
  );

  const wrapped = WrapperBuilder.wrap(contract).usingDataService({
    dataServiceId,
    uniqueSignersCount,
    dataFeeds: [dataFeedId]
  } as any);

  const tx = await wrapped.startNextMarket(category, assetIndex, deadline);
  console.log(`startNextMarket tx: ${tx.hash}`);
  await tx.wait();
  console.log("Market opened");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
