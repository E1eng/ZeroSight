import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { ethers } from "ethers";

import { ethersContract } from "./clients";
import { nonceManager } from "./nonce";
import { sendWithRetry } from "./send-tx";
import { FEED_IDS, type AssetIndex } from "../utils";

/**
 * On-chain write helpers. All txs go through the central nonce manager AND the
 * resilient `sendWithRetry` sender (timeout + replace-by-fee gas bump), so a
 * single stuck/underpriced tx can no longer deadlock the keeper.
 *
 * Each helper returns the tx receipt so callers can log block numbers + gas.
 * Errors are NOT swallowed — callers handle them and translate to phase
 * transitions (e.g. cooldown on revert).
 */

const REDSTONE_DATA_SERVICE = process.env.REDSTONE_DATA_SERVICE_ID ?? "redstone-primary-prod";
const REDSTONE_SIGNERS_THRESHOLD = Number(process.env.REDSTONE_SIGNERS_THRESHOLD ?? "3");

async function authorizedSigners(): Promise<string[]> {
  return ethersContract.getOracleSigners();
}

function wrapWithRedstone(dataPackagesId: string, authorized: string[]) {
  return WrapperBuilder.wrap(ethersContract).usingDataService({
    dataServiceId: REDSTONE_DATA_SERVICE,
    uniqueSignersCount: REDSTONE_SIGNERS_THRESHOLD,
    dataPackagesIds: [dataPackagesId],
    authorizedSigners: authorized
  } as any);
}

export async function startNextMarketTx(params: {
  category: number;
  assetIndex: AssetIndex;
  newDeadline: number;
}) {
  const { category, assetIndex, newDeadline } = params;

  return nonceManager.withNonce("startNextMarket", async (nonce) => {
    const signers = await authorizedSigners();
    const wrapped = wrapWithRedstone(FEED_IDS[assetIndex], signers);
    return sendWithRetry("startNextMarket", nonce, (overrides) =>
      wrapped.startNextMarket(category, assetIndex, newDeadline, overrides)
    );
  });
}

export async function lockMarketTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("lockMarket", async (nonce) =>
    sendWithRetry("lockMarket", nonce, (overrides) =>
      ethersContract.lockMarket(assetIndex, overrides)
    )
  );
}

export async function revealChoicesTx(params: {
  assetIndex: AssetIndex;
  bettors: string[];
  vaultIds: string[];
  choices: number[];
}) {
  const { assetIndex, bettors, vaultIds, choices } = params;

  return nonceManager.withNonce("revealChoices", async (nonce) =>
    sendWithRetry("revealChoices", nonce, (overrides) =>
      ethersContract.revealChoices(assetIndex, bettors, vaultIds, choices, overrides)
    )
  );
}

export async function resolveMarketTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("resolveMarket", async (nonce) => {
    const signers = await authorizedSigners();
    const wrapped = wrapWithRedstone(FEED_IDS[assetIndex], signers);
    return sendWithRetry("resolveMarket", nonce, (overrides) =>
      wrapped.resolveMarket(assetIndex, overrides)
    );
  });
}

export async function distributeWinningsTx(params: {
  assetIndex: AssetIndex;
  batchSize: number;
}) {
  const { assetIndex, batchSize } = params;

  return nonceManager.withNonce("distributeWinnings", async (nonce) =>
    sendWithRetry("distributeWinnings", nonce, (overrides) =>
      ethersContract.distributeWinnings(assetIndex, batchSize, overrides)
    )
  );
}

export async function sweepUnclaimedTx(assetIndex: AssetIndex) {
  return nonceManager.withNonce("sweepUnclaimed", async (nonce) =>
    sendWithRetry("sweepUnclaimed", nonce, (overrides) =>
      ethersContract.sweepUnclaimed(assetIndex, overrides)
    )
  );
}
