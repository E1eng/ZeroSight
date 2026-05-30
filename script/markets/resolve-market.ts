import "dotenv/config";

import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { ethers } from "ethers";

import { FEED_IDS, MARKET_ABI, STATUS_LABELS, requireEnv, type AssetIndex } from "./utils";

async function main() {
  const rpcUrl = requireEnv("STORY_RPC_URL");
  const privateKey = process.env.MARKET_OPERATOR_PRIVATE_KEY ?? requireEnv("DEPLOYER_PRIVATE_KEY");
  const contractAddress = requireEnv("NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS");

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, MARKET_ABI, wallet);

  const assetInput = (process.argv[2] ?? process.env.MARKET_ASSET ?? "ip").toLowerCase();
  const assetLabels: Record<string, number> = { ip: 0, btc: 1, eth: 2 };
  const assetIndex = assetLabels[assetInput] as AssetIndex;
  if (assetIndex === undefined) throw new Error(`Unknown asset: ${assetInput}`);

  const marketState = await contract.markets(assetIndex);
  const status = Number(marketState.status);
  if (status === 2) {
    throw new Error(`Market is already resolved.`);
  }

  const deadline = Number(marketState.deadline);
  const now = Math.floor(Date.now() / 1000);
  if (now <= deadline) {
    throw new Error(`Deadline not passed yet. deadline=${deadline}, now=${now}`);
  }
  const dataFeedId = FEED_IDS[assetIndex];

  const dataServiceId = process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-primary-prod";
  const uniqueSignersCount = Number(process.env.REDSTONE_SIGNERS_THRESHOLD ?? "3");

  const authorizedSigners = await contract.getOracleSigners();

  const wrapped = WrapperBuilder.wrap(contract).usingDataService({
    dataServiceId,
    uniqueSignersCount,
    dataPackagesIds: [dataFeedId],
    authorizedSigners
  } as any);

  const tx = await wrapped.resolveMarket(assetIndex);
  console.log(`resolveMarket tx: ${tx.hash}`);
  await tx.wait();
  console.log("Market resolved");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
